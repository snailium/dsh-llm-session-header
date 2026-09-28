// Tests for the live config-update path.
//
// Under dsh 0.1.7 the fiber's parsed config carries live volatile references
// for every `.volatile()` field: a card save is committed into those
// references in place, so the plugin sees the new value by re-reading the very
// same config object on its next `llm/stream` call. These tests model that
// with a tiny volatile stub, and also assert the plain-value path still works
// (tests, older runtimes, hand-written configs).

import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, resolveConfig } from '../lib/index.js'

/** Stand-in for cosmokit's `createVolatile`: `{ get() }`, rewritten in place. */
function volatile(initial) {
  let current = initial
  return {
    get: () => current,
    commit(next) {
      current = next
    },
  }
}

/** A minimal dsh ctx: effect registry plus an `llm/stream` waterfall. */
function makeCtx() {
  const effects = new Map()
  const listeners = []
  return {
    logger: { info() {}, warn() {} },
    effect(fn, id) {
      assert.ok(!effects.has(id), `duplicate effect id ${id}`)
      effects.set(id, fn())
    },
    on(event, handler) {
      listeners.push({ event, handler })
    },
    /** Drive one llm/stream call through every registered listener. */
    async stream(options) {
      let result = 'terminal'
      for (const { event, handler } of [...listeners].reverse()) {
        if (event !== 'llm/stream') continue
        const downstream = await handler(options, () => result)
        if (downstream !== undefined && downstream !== null) result = downstream
      }
      return result
    },
    effects,
    listeners,
  }
}

test('a config save adds a provider route without restart', () => {
  const providers = volatile(['opencode'])
  const config = {
    headerName: volatile('x-opencode-session'),
    providers,
    mode: volatile('session-id'),
    debug: volatile(false),
  }
  const ctx = makeCtx()
  apply(ctx, config)

  // Before the save: opencode is covered, b70-smg is not.
  assert.equal(resolveConfig(config).providers.has('b70-smg'), false)

  // The card save rewrites the volatile reference in place.
  providers.commit({ opencode: 'x-opencode-session', 'b70-smg': 'X-SMG-Routing-Key' })

  // The route table re-resolves on the next read, with per-provider headers.
  const resolved = resolveConfig(config)
  assert.equal(resolved.providers.get('b70-smg'), 'X-SMG-Routing-Key')
  assert.equal(resolved.providers.get('opencode'), 'x-opencode-session')

  // A save must not re-patch fetch: the single patch from apply() stays
  // installed (the effect is registered once and disposed on unload).
  const patched = ctx.effects.get('llm-session-header.fetch-patch')
  assert.equal(typeof patched, 'function')
})

test('a config save removes a provider route', () => {
  const providers = volatile({ opencode: 'x-opencode-session', 'b70-smg': 'X-SMG-Routing-Key' })
  const config = { headerName: volatile('x-opencode-session'), providers }
  const ctx = makeCtx()
  apply(ctx, config)

  providers.commit(['opencode'])

  const resolved = resolveConfig(config)
  assert.equal(resolved.providers.has('b70-smg'), false)
  assert.equal(resolved.providers.get('opencode'), 'x-opencode-session')
})

test('a scalar field save changes the header name and mode in place', () => {
  const config = {
    headerName: volatile('x-opencode-session'),
    providers: volatile(['b70-smg']),
    mode: volatile('session-id'),
  }
  const ctx = makeCtx()
  apply(ctx, config)

  assert.equal(resolveConfig(config).providers.get('b70-smg'), 'x-opencode-session')
  assert.equal(resolveConfig(config).mode, 'session-id')

  config.headerName.commit('X-SMG-Routing-Key')
  config.mode.commit('uuid')

  const resolved = resolveConfig(config)
  assert.equal(resolved.providers.get('b70-smg'), 'X-SMG-Routing-Key')
  assert.equal(resolved.mode, 'uuid')
})

test('a malformed providers value falls back instead of corrupting the table', () => {
  const providers = volatile(['opencode'])
  const config = { providers }
  apply(makeCtx(), config)

  // A bare string is neither a list nor a map: resolveProviders falls back to
  // the default route set rather than throwing or producing a garbage table.
  providers.commit('opencode')

  const resolved = resolveConfig(config)
  assert.deepEqual([...resolved.providers.keys()], ['opencode', 'opencode-go'])
})

test('apply tolerates an undefined initial config (bundle row without config)', () => {
  const ctx = makeCtx()
  apply(ctx, undefined)
  const resolved = resolveConfig({})
  assert.deepEqual([...resolved.providers.keys()], ['opencode', 'opencode-go'])
})
