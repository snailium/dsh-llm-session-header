// Unit tests for dsh-llm-session-header.
//
// Expectations are derived from the module's own exported defaults wherever a
// default is what is being asserted, so a deliberate default change does not
// silently invalidate the suite.

import assert from 'node:assert/strict'
import test from 'node:test'

import { readFileSync } from 'node:fs'

import {
  name,
  inject,
  resolveConfig,
  resolveProviders,
  headerValueFor,
  hasHeader,
  patchFetch,
  withStore,
  Config,
  BoundedMap,
} from '../lib/index.js'

// ---------------------------------------------------------------- defaults

test('module exports the expected cordis surface', () => {
  assert.equal(name, 'llm-session-header')
  assert.deepEqual(inject, ['llm'])
})

test('a bare config falls back to the opencode defaults', () => {
  const cfg = resolveConfig({})
  // Behavioural contract: with no config the plugin must behave exactly like
  // the OpenCode plugin it generalises.
  assert.equal(cfg.headerName, 'x-opencode-session')
  assert.equal(cfg.mode, 'session-id')
  assert.equal(cfg.debug, false)
  assert.equal(cfg.debugFile, undefined)
  assert.deepEqual([...cfg.providers.keys()], ['opencode', 'opencode-go'])
  for (const header of cfg.providers.values()) {
    assert.equal(header, cfg.headerName)
  }
})

test('undefined config is tolerated', () => {
  const cfg = resolveConfig(undefined)
  const base = resolveConfig({})
  assert.equal(cfg.headerName, base.headerName)
  assert.deepEqual([...cfg.providers.keys()], [...base.providers.keys()])
})

// ------------------------------------------------------- headerName global

test('headerName applies to a listed provider set', () => {
  const cfg = resolveConfig({ headerName: 'X-Olla-Session-ID', providers: ['olla'] })
  assert.equal(cfg.headerName, 'X-Olla-Session-ID')
  assert.deepEqual([...cfg.providers.entries()], [['olla', 'X-Olla-Session-ID']])
})

test('headerName is trimmed and blank values fall back to the default', () => {
  assert.equal(resolveConfig({ headerName: '  X-Test  ' }).headerName, 'X-Test')
  assert.equal(resolveConfig({ headerName: '   ' }).headerName, 'x-opencode-session')
  assert.equal(resolveConfig({ headerName: 42 }).headerName, 'x-opencode-session')
})

test('an empty provider list falls back to the default set, not to empty', () => {
  const cfg = resolveConfig({ providers: [] })
  const base = resolveConfig({})
  assert.deepEqual([...cfg.providers.keys()], [...base.providers.keys()])
})

// --------------------------------------------------- per-provider override

test('a provider map gives each route its own header', () => {
  const cfg = resolveConfig({
    headerName: 'x-default',
    providers: {
      olla: 'X-Olla-Session-ID',
      opencode: 'x-opencode-session',
    },
  })
  assert.equal(cfg.providers.get('olla'), 'X-Olla-Session-ID')
  assert.equal(cfg.providers.get('opencode'), 'x-opencode-session')
  assert.equal(cfg.providers.size, 2)
})

test('the map form serves both backends from one plugin instance', () => {
  // This is the whole point of the generalisation: one row, two backends.
  const cfg = resolveConfig({
    providers: {
      opencode: 'x-opencode-session',
      'opencode-go': 'x-opencode-session',
      olla: 'X-Olla-Session-ID',
    },
  })
  assert.equal(cfg.providers.get('opencode'), 'x-opencode-session')
  assert.equal(cfg.providers.get('opencode-go'), 'x-opencode-session')
  assert.equal(cfg.providers.get('olla'), 'X-Olla-Session-ID')
})

test('map entries with blank keys or values are dropped, not crashed on', () => {
  const cfg = resolveConfig({
    providers: { olla: 'X-Olla-Session-ID', '': 'x-empty-key', broken: '', fine: 'x-fine' },
  })
  assert.equal(cfg.providers.get('olla'), 'X-Olla-Session-ID')
  assert.equal(cfg.providers.get('fine'), 'x-fine')
  assert.equal(cfg.providers.has(''), false)
  assert.equal(cfg.providers.has('broken'), false)
})

test('a map overrides headerName but does not inherit it for unlisted routes', () => {
  const providers = resolveProviders({ providers: { a: 'x-a' } }, 'x-fallback')
  assert.deepEqual([...providers.entries()], [['a', 'x-a']])
})

// ------------------------------------------------------------ value modes

test('session-id mode passes the session id through verbatim', () => {
  const table = new Map()
  assert.equal(headerValueFor('sess-123', 'session-id', table), 'sess-123')
  assert.equal(table.size, 0, 'session-id mode must not populate the uuid table')
})

test('uuid mode is stable per session and distinct across sessions', () => {
  const table = new Map()
  const a1 = headerValueFor('s1', 'uuid', table)
  const a2 = headerValueFor('s1', 'uuid', table)
  const b = headerValueFor('s2', 'uuid', table)
  assert.equal(a1, a2, 'same session must map to the same uuid')
  assert.notEqual(a1, b, 'different sessions must map to different uuids')
})

test('an empty session id yields no value', () => {
  assert.equal(headerValueFor('', 'session-id', new Map()), undefined)
})

test('mode defaults to session-id for unknown values', () => {
  assert.equal(resolveConfig({ mode: 'nonsense' }).mode, 'session-id')
  assert.equal(resolveConfig({ mode: 'uuid' }).mode, 'uuid')
})

// --------------------------------------------------------- fetch injection

/** Minimal fetch double recording what the patched call forwarded. */
function makeFetchSpy() {
  const calls = []
  const spy = function (input, init) {
    calls.push({ input, init })
    return Promise.resolve({ ok: true })
  }
  return { spy, calls }
}

function headersOf(init) {
  return new Headers(init?.headers)
}

test('patched fetch injects the store header while one is active', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  const { spy, calls } = makeFetchSpy()
  const patched = patchFetch(spy, als)

  await als.run({ header: 'X-Olla-Session-ID', value: 'sess-abc' }, () =>
    patched('http://example.test/v1/chat/completions', { method: 'POST' }))

  assert.equal(calls.length, 1)
  assert.equal(headersOf(calls[0].init).get('X-Olla-Session-ID'), 'sess-abc')
})

test('the injected header name follows the store, not the closure', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  const { spy, calls } = makeFetchSpy()
  const patched = patchFetch(spy, als)

  await als.run({ header: 'x-opencode-session', value: 'v1' }, () => patched('http://a.test'))
  await als.run({ header: 'X-Olla-Session-ID', value: 'v2' }, () => patched('http://b.test'))

  assert.equal(headersOf(calls[0].init).get('x-opencode-session'), 'v1')
  assert.equal(headersOf(calls[1].init).get('X-Olla-Session-ID'), 'v2')
  assert.equal(headersOf(calls[0].init).has('X-Olla-Session-ID'), false)
})

test('no store means the request is forwarded untouched', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  const { spy, calls } = makeFetchSpy()
  const patched = patchFetch(spy, als)

  await patched('http://example.test/v1/chat/completions', { method: 'POST' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers, undefined)
})

test('an existing header always wins', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  const { spy, calls } = makeFetchSpy()
  const patched = patchFetch(spy, als)

  await als.run({ header: 'X-Olla-Session-ID', value: 'injected' }, () =>
    patched('http://example.test', { headers: { 'X-Olla-Session-ID': 'caller' } }))

  assert.equal(headersOf(calls[0].init).get('X-Olla-Session-ID'), 'caller')
})

test('pre-existing unrelated headers survive injection', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  const { spy, calls } = makeFetchSpy()
  const patched = patchFetch(spy, als)

  await als.run({ header: 'X-Olla-Session-ID', value: 'v' }, () =>
    patched('http://example.test', { headers: { 'Content-Type': 'application/json' } }))

  const h = headersOf(calls[0].init)
  assert.equal(h.get('Content-Type'), 'application/json')
  assert.equal(h.get('X-Olla-Session-ID'), 'v')
})

test('hasHeader matches case-insensitively', () => {
  assert.equal(hasHeader('http://x.test', { headers: { 'x-olla-session-id': 'a' } }, 'X-Olla-Session-ID'), true)
  assert.equal(hasHeader('http://x.test', { headers: {} }, 'X-Olla-Session-ID'), false)
  assert.equal(hasHeader('http://x.test', undefined, 'X-Olla-Session-ID'), false)
})

// ------------------------------------------------------------ stream wrap

test('withStore drives every pull inside the store', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  const observed = []

  async function* source() {
    for (const v of [1, 2, 3]) {
      observed.push(als.getStore()?.value)
      yield v
    }
  }

  const wrapped = withStore(source(), { header: 'x', value: 'S' }, als)
  const got = []
  for await (const v of wrapped) got.push(v)

  assert.deepEqual(got, [1, 2, 3])
  assert.deepEqual(observed, ['S', 'S', 'S'])
})

test('withStore tolerates a downstream that throws on return', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  const wrapped = withStore({
    [Symbol.asyncIterator]() { return this },
    async next() { return { done: true, value: undefined } },
    async return() { throw new Error('already torn down') },
  }, { header: 'x', value: 'v' }, als)

  const result = await wrapped.return()
  assert.equal(result.done, true)
})

test('withStore runs return inside ALS store', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  let observedInReturn
  const wrapped = withStore({
    [Symbol.asyncIterator]() { return this },
    async next() { return { done: false, value: 'ok' } },
    async return() {
      observedInReturn = als.getStore()?.value
      return { done: true }
    },
  }, { header: 'x-session', value: 'sess-123' }, als)

  await wrapped.return()
  assert.equal(observedInReturn, 'sess-123')
})

test('withStore supports Symbol.asyncDispose within ALS store', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  const als = new AsyncLocalStorage()
  let disposedInStore
  const wrapped = withStore({
    [Symbol.asyncIterator]() { return this },
    async next() { return { done: true } },
    async [Symbol.asyncDispose]() {
      disposedInStore = als.getStore()?.value
    },
  }, { header: 'x-session', value: 'sess-dispose' }, als)

  await wrapped[Symbol.asyncDispose]()
  assert.equal(disposedInStore, 'sess-dispose')
})

// ----------------------------------------------------------- BoundedMap tests

test('BoundedMap respects maxSize and evicts oldest items', () => {
  const map = new BoundedMap(3)
  map.set('a', 1)
  map.set('b', 2)
  map.set('c', 3)
  assert.equal(map.size, 3)
  assert.deepEqual([...map.keys()], ['a', 'b', 'c'])

  // Inserting 'd' should evict 'a'
  map.set('d', 4)
  assert.equal(map.size, 3)
  assert.equal(map.has('a'), false)
  assert.deepEqual([...map.keys()], ['b', 'c', 'd'])

  // Updating existing key should not evict anything
  map.set('b', 20)
  assert.equal(map.size, 3)
  assert.deepEqual([...map.keys()], ['b', 'c', 'd'])
})

// ------------------------------------------------------- hasHeader fast paths

test('hasHeader works with Headers instance and plain objects', () => {
  const headersObj = new Headers({ 'x-custom': 'foo', 'x-opencode-session': '123' })
  assert.equal(hasHeader(undefined, { headers: headersObj }, 'X-Custom'), true)
  assert.equal(hasHeader(undefined, { headers: headersObj }, 'x-opencode-session'), true)
  assert.equal(hasHeader(undefined, { headers: headersObj }, 'x-missing'), false)

  const plainObj = { 'X-SMG-Routing-Key': 'abc' }
  assert.equal(hasHeader(undefined, { headers: plainObj }, 'x-smg-routing-key'), true)
  assert.equal(hasHeader(undefined, { headers: plainObj }, 'X-SMG-ROUTING-KEY'), true)
  assert.equal(hasHeader(undefined, { headers: plainObj }, 'x-missing'), false)

  const arrayHeaders = [['X-Custom-Header', 'val']]
  assert.equal(hasHeader(undefined, { headers: arrayHeaders }, 'x-custom-header'), true)
  assert.equal(hasHeader(undefined, { headers: arrayHeaders }, 'x-other'), false)
})

// ---------------------------------------------------- DSH metadata & locale

test('locale files exist and contain proper title and description metadata', () => {
  const en = JSON.parse(readFileSync(new URL('../locale/en.json', import.meta.url), 'utf8'))
  const zh = JSON.parse(readFileSync(new URL('../locale/zh.json', import.meta.url), 'utf8'))

  assert.equal(en.meta?.title, 'LLM session header')
  assert.ok(typeof en.meta?.description === 'string' && en.meta.description.length > 10)

  assert.equal(zh.meta?.title, 'LLM 会话路由请求头')
  assert.ok(typeof zh.meta?.description === 'string' && zh.meta.description.length > 10)

  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.ok(pkg.files.includes('locale'))
})

test('Config schema defines defaults and descriptions on all fields', () => {
  assert.ok(Config.dict.headerName.meta.default === 'x-opencode-session')
  assert.ok(typeof Config.dict.headerName.meta.description === 'string')

  assert.ok(Array.isArray(Config.dict.providers.meta.default))
  assert.ok(typeof Config.dict.providers.meta.description === 'string')

  assert.ok(Config.dict.mode.meta.default === 'session-id')
  assert.ok(typeof Config.dict.mode.meta.description === 'string')

  assert.ok(Config.dict.debug.meta.default === false)
  assert.ok(typeof Config.dict.debug.meta.description === 'string')

  assert.ok(Config.dict.debugFile.meta.default === null)
  assert.ok(typeof Config.dict.debugFile.meta.description === 'string')
})

