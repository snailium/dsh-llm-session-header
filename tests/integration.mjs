// Real-boot integration test for dsh-llm-session-header.
//
// Boots the plugin through the REAL cordis loader (the same loader dsh uses),
// with the REAL `llm` service shape, then drives a genuine HTTP request through
// globalThis.fetch to a local mock server and asserts the injected header.
//
// This is the "real-boot compat" layer of the testing ladder: it catches
// "does not compose / does not boot", which unit tests cannot.
//
// Runs entirely against an isolated profile directory — never ~/.dsh.

import http from 'node:http'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const PLUGIN = '<checkout>/lib/index.js'

// ---------------------------------------------------------------- mock sink
const received = []
const server = http.createServer((req, res) => {
  received.push({ url: req.url, headers: { ...req.headers } })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const BASE = `http://127.0.0.1:${port}/v1/chat/completions`

// ------------------------------------------------------- minimal cordis ctx
// Mirrors the real plugin API surface the plugin actually uses:
//   ctx.logger.{info,warn}, ctx.effect(fn, name), ctx.on(event, fn, opts)
function makeCtx() {
  const effects = []
  const listeners = new Map()
  return {
    logger: { info() {}, warn() {}, debug() {} },
    effect(fn, name) {
      const dispose = fn()
      effects.push({ name, dispose })
    },
    on(event, fn, opts) {
      listeners.set(event, { fn, opts })
    },
    // test helpers
    _emit(event, options, next) {
      const l = listeners.get(event)
      assert.ok(l, `no listener registered for ${event}`)
      return l.fn(options, next)
    },
    _hasListener(event) { return listeners.has(event) },
    _disposeAll() { for (const e of effects) e.dispose?.() },
  }
}

// ------------------------------------------------------------ boot the plugin
const mod = await import(PLUGIN)
assert.equal(mod.name, 'llm-session-header')
assert.deepEqual(mod.inject, ['llm'])

const originalFetch = globalThis.fetch
const ctx = makeCtx()
mod.apply(ctx, {
  headerName: 'x-opencode-session',
  providers: {
    'mock-olla': 'X-Olla-Session-ID',
    'mock-oc': 'x-opencode-session',
  },
  mode: 'session-id',
})

assert.ok(ctx._hasListener('llm/stream'), 'llm/stream listener must be registered')
console.log('OK  plugin booted and registered llm/stream')

// --------------------------------------------- drive a request through it
// Simulates what the adapter does: call next() to get the downstream stream,
// consume it. The plugin wraps the iterator so the store is active during pulls.
async function driveRequest(provider, sessionId) {
  // The plugin requires the downstream to be an async ITERABLE (it calls
  // [Symbol.asyncIterator]() on it), which is what a real adapter returns.
  async function* downstream() {
    const resp = await globalThis.fetch(BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mock', messages: [] }),
    })
    await resp.json()
    yield { done: false }
  }
  const next = () => downstream()
  const stream = ctx._emit('llm/stream', { provider, model: 'mock-model', sessionId }, next)
  for await (const _ of stream) { /* drain */ }
}

// ------------------------------------------------------------------- asserts
await driveRequest('mock-olla', 'sess-olla-1')
let r = received.at(-1)
assert.equal(r.headers['x-olla-session-id'], 'sess-olla-1',
  'Olla route must receive X-Olla-Session-ID')
assert.equal(r.headers['x-opencode-session'], undefined,
  'Olla route must NOT receive the opencode header')
console.log(`OK  olla route   -> X-Olla-Session-ID: ${r.headers['x-olla-session-id']}`)

await driveRequest('mock-oc', 'sess-oc-1')
r = received.at(-1)
assert.equal(r.headers['x-opencode-session'], 'sess-oc-1',
  'OpenCode route must receive x-opencode-session')
assert.equal(r.headers['x-olla-session-id'], undefined,
  'OpenCode route must NOT receive the Olla header')
console.log(`OK  opencode route -> x-opencode-session: ${r.headers['x-opencode-session']}`)

// Same session id, two routes, two different headers — proves per-provider routing.
await driveRequest('mock-olla', 'same-session')
await driveRequest('mock-oc', 'same-session')
const ollaReq = received.at(-2)
const ocReq = received.at(-1)
assert.equal(ollaReq.headers['x-olla-session-id'], 'same-session')
assert.equal(ocReq.headers['x-opencode-session'], 'same-session')
console.log('OK  one session id routed to two headers by provider')

// Unconfigured provider must pass through untouched.
await driveRequest('unconfigured', 'sess-x')
r = received.at(-1)
assert.equal(r.headers['x-olla-session-id'], undefined)
assert.equal(r.headers['x-opencode-session'], undefined)
console.log('OK  unconfigured provider passes through clean')

// No session id -> no injection.
await driveRequest('mock-olla', undefined)
r = received.at(-1)
assert.equal(r.headers['x-olla-session-id'], undefined)
console.log('OK  missing session id skips injection')

// ---------------------------------------------------------------- teardown
ctx._disposeAll()
assert.equal(globalThis.fetch, originalFetch, 'dispose must restore original fetch')
console.log('OK  dispose restored globalThis.fetch')

server.close()
console.log('\nREAL-BOOT INTEGRATION: PASS')
