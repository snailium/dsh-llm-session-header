// dsh-llm-session-header
//
// Host plugin: automatically attach a stable per-conversation session header to
// model requests routed to configured providers. The header name is
// configurable, so one plugin serves any backend that implements
// conversation-affinity routing via a request header (OpenCode's
// `x-opencode-session`, Olla's `X-Olla-Session-ID`, and others).
//
// Such relays pin every request sharing the same header value to the same
// upstream backend, which keeps the prompt/KV cache warm across the turns of
// one conversation. The value only has to be opaque and stable per
// conversation, so by default we reuse the DSH session id that already travels
// with each model call (the same identity the official DeepSeek adapter sends
// as `x-deepseek-harness-session-id`).
//
// How it works:
//   1. Listen on the `llm/stream` waterfall. Calls whose `options.provider`
//      names a configured route and which carry a `sessionId` are driven
//      through an AsyncLocalStorage store holding the header name and value.
//   2. `globalThis.fetch` is patched once. While a store is active the patch
//      merges `<headerName>: <value>` into the outgoing request headers
//      (unless the request already carries that header).
//   3. Both registrations are fiber-scoped ctx effects, so plugin stop /
//      update / unload restores the original fetch and removes the listener.
//
// Requests that are NOT routed to a configured provider, or that carry no
// session id (some auxiliary hand-built calls), pass through untouched.
//
// Derived from dsh-opencode-session (MIT, (c) nobu121), generalised to a
// configurable header name.

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { appendFile } from 'node:fs/promises'

export const name = 'llm-session-header'

// Activate only after the abstract `llm` service exists, so the waterfall
// event we listen on is already registered by its provider.
export const inject = ['llm']

// Default header name. Preserves the behaviour of the plugin this was
// derived from (OpenCode), so an existing installation that names no
// headerName keeps working unchanged.
const DEFAULT_HEADER = 'x-opencode-session'

// Provider routes that get the default header when no per-provider override
// is configured. A route naming an installed pi-ai catalog provider keeps
// that provider's id as its route key, so both catalog ids are covered;
// users routing through a custom provider key add it through config.
const DEFAULT_PROVIDERS = ['opencode', 'opencode-go']

/**
 * Normalise the configured provider list into a Map of route key -> header name.
 *
 * Accepts either:
 *   providers: ['opencode', 'opencode-go']                  -> all use headerName
 *   providers: { olla: 'X-Olla-Session-ID', opencode: ... } -> per-provider header
 *
 * A list and a map cannot be mixed; a map is the only way to set per-provider
 * headers. Provider keys are matched case-sensitively, as route keys are.
 */
export function resolveProviders(config, headerName) {
  const raw = config.providers
  const map = new Map()

  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const header = String(value ?? '').trim()
      if (key.length === 0 || header.length === 0) continue
      map.set(String(key), header)
    }
    return map
  }

  const list = Array.isArray(raw) && raw.length > 0
    ? raw.map((value) => String(value))
    : [...DEFAULT_PROVIDERS]
  for (const key of list) map.set(key, headerName)
  return map
}

export function resolveConfig(config = {}) {
  const headerName = typeof config.headerName === 'string' && config.headerName.trim().length > 0
    ? config.headerName.trim()
    : DEFAULT_HEADER
  // session-id: reuse the DSH session id (stable across turns AND restarts,
  // unique per conversation). uuid: derive a process-stable random uuid per
  // DSH session id (opaque, but resets when the process restarts).
  const mode = config.mode === 'uuid' ? 'uuid' : 'session-id'
  const debug = config.debug === true
  const debugFile = typeof config.debugFile === 'string' && config.debugFile.length > 0
    ? config.debugFile
    : undefined
  return { providers: resolveProviders(config, headerName), headerName, mode, debug, debugFile }
}

/** Fire-and-forget append of one debug record; failures only log a warning. */
function recordDebug(ctx, file, entry) {
  appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8').catch((error) => {
    ctx.logger.warn('[llm-session-header] debugFile write failed: %s', error?.message ?? String(error))
  })
}

/** Derive the opaque header value for one DSH session id. */
export function headerValueFor(sessionId, mode, table) {
  const raw = String(sessionId)
  if (raw.length === 0) return undefined
  if (mode !== 'uuid') return raw
  let value = table.get(raw)
  if (value === undefined) {
    value = randomUUID()
    table.set(raw, value)
  }
  return value
}

/**
 * Wrap a downstream async iterable so every pull executes inside an
 * AsyncLocalStorage store. Async generators and the promises they create
 * inherit the store as long as the generator body is driven from a pull made
 * inside `als.run`, which is exactly what this wrapper does per `next()`.
 */
export function withStore(iterable, store, als) {
  const iterator = typeof iterable[Symbol.asyncIterator] === 'function'
    ? iterable[Symbol.asyncIterator]()
    : iterable
  return {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      return als.run(store, () => iterator.next())
    },
    async return(value) {
      if (typeof iterator.return === 'function') {
        try {
          return await iterator.return(value)
        } catch {
          // The downstream stream may already be torn down; treat as done.
        }
      }
      return { done: true, value }
    },
    async throw(error) {
      if (typeof iterator.throw === 'function') {
        return als.run(store, () => iterator.throw(error))
      }
      throw error
    },
  }
}

/** True when the outgoing request already carries the given header. */
export function hasHeader(input, init, headerName) {
  const source = init?.headers
    ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined)
  if (source === undefined) return false
  try {
    return new Headers(source).has(headerName)
  } catch {
    return false
  }
}

/**
 * Build a patched fetch that injects the header while a store is active.
 * Header precedence mirrors native fetch: when `init.headers` is present it
 * wins; otherwise a Request's own headers are the base.
 *
 * The header name comes from the active store rather than the closure, so a
 * single patched fetch serves every configured provider with its own header.
 */
export function patchFetch(original, als) {
  return function patchedFetch(input, init) {
    const state = als.getStore()
    if (state && !hasHeader(input, init, state.header)) {
      const headers = new Headers(
        init?.headers
          ?? (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined),
      )
      headers.set(state.header, state.value)
      return original.call(this, input, { ...init, headers })
    }
    return original.apply(this, arguments)
  }
}

export function apply(ctx, config) {
  const { providers, headerName, mode, debug, debugFile } = resolveConfig(config)
  const als = new AsyncLocalStorage()
  const uuidBySession = new Map()

  const originalFetch = globalThis.fetch
  if (typeof originalFetch !== 'function') {
    ctx.logger.warn('[llm-session-header] globalThis.fetch is unavailable; cannot inject session headers')
    return
  }

  const patched = patchFetch(originalFetch, als)

  ctx.effect(() => {
    globalThis.fetch = patched
    const summary = [...providers.entries()].map(([p, h]) => `${p}=${h}`).join(', ')
    ctx.logger.info('[llm-session-header] active for providers [%s] with mode %s', summary, mode)
    return () => {
      if (globalThis.fetch === patched) globalThis.fetch = originalFetch
    }
  }, 'llm-session-header.fetch-patch')

  ctx.on('llm/stream', (options, next) => {
    if (options === undefined || options === null || typeof options !== 'object') return next()
    const header = providers.get(String(options.provider))
    if (header === undefined) return next()
    const sessionId = options.sessionId
    if (sessionId === undefined || sessionId === null) return next()
    const value = headerValueFor(sessionId, mode, uuidBySession)
    if (value === undefined) return next()

    // Reaching the adapter is the only way the actual HTTP request happens;
    // `next()` returns the downstream (lazy) stream. Call it exactly once,
    // then drive its iterator from inside the store.
    let downstream
    try {
      downstream = next()
    } catch (error) {
      // Let the caller handle an adapter dispatch failure as it normally would.
      throw error
    }
    if (downstream === undefined || downstream === null) return downstream
    if (typeof downstream[Symbol.asyncIterator] !== 'function') return downstream

    if (debug || debugFile !== undefined) {
      const entry = {
        ts: new Date().toISOString(),
        provider: options.provider,
        model: options.model,
        session: String(sessionId),
        header,
        value,
      }
      if (debugFile !== undefined) recordDebug(ctx, debugFile, entry)
      if (debug) {
        ctx.logger.info(
          '[llm-session-header] streaming provider "%s" with %s=%s',
          options.provider,
          header,
          value,
        )
      }
    }
    return withStore(downstream, { header, value }, als)
  }, { prepend: true })
}

export default { name, inject, apply }
