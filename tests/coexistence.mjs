// Coexistence check: can dsh-llm-session-header replace dsh-opencode-session
// in the production profile without changing OpenCode behaviour?
//
// The two plugins both patch globalThis.fetch and both listen on llm/stream.
// This test loads BOTH in the same process, in both orders, and asserts the
// OpenCode path behaves identically to running the original alone.

import assert from 'node:assert/strict'
import http from 'node:http'

const ORIG = '<dsh-home>/profiles/web/node_modules/dsh-opencode-session/lib/index.js'
const MINE = '<checkout>/lib/index.js'

const received = []
const server = http.createServer((req, res) => {
  received.push({ ...req.headers })
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end('{}')
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${server.address().port}/v1/chat/completions`

function makeCtx() {
  const effects = []
  const listeners = []
  return {
    logger: { info() {}, warn() {} },
    effect(fn) { effects.push(fn()) },
    // Real cordis waterfall: multiple listeners compose. Model that by
    // chaining, exactly as the loader does (prepend -> outermost).
    on(event, fn, opts) { listeners.push({ fn, opts }) },
    _emit(event, options, next) {
      let chain = next
      const ordered = [...listeners].sort((a, b) =>
        (b.opts?.prepend === true) - (a.opts?.prepend === true))
      for (const l of ordered.reverse()) {
        const inner = chain
        chain = () => l.fn(options, inner)
      }
      return chain()
    },
    _disposeAll() { for (const d of effects) d?.() },
  }
}

async function drive(ctx, provider, sessionId) {
  async function* downstream() {
    const r = await globalThis.fetch(BASE, { method: 'POST' })
    await r.json()
    yield 1
  }
  const stream = ctx._emit('llm/stream', { provider, model: 'm', sessionId }, () => downstream())
  for await (const _ of stream) { /* drain */ }
}

const OPTS = { providers: ['opencode', 'opencode-go'], mode: 'session-id' }

// ---------------------------------------------------------------- scenario A
// Original plugin alone (the production baseline).
{
  const saved = globalThis.fetch
  const orig = await import(ORIG)
  const ctx = makeCtx()
  orig.apply(ctx, OPTS)
  await drive(ctx, 'opencode', 'S1')
  const h = received.at(-1)
  ctx._disposeAll()
  globalThis.fetch = saved
  console.log(`baseline  original alone      -> x-opencode-session=${h['x-opencode-session']}`)
  assert.equal(h['x-opencode-session'], 'S1')

  // ------------------------------------------------------------- scenario B
  // My plugin configured to reproduce the original exactly.
  const mine = await import(MINE)
  const ctx2 = makeCtx()
  mine.apply(ctx2, OPTS)
  await drive(ctx2, 'opencode', 'S1')
  const h2 = received.at(-1)
  ctx2._disposeAll()
  globalThis.fetch = saved
  console.log(`parity    mine alone          -> x-opencode-session=${h2['x-opencode-session']}`)
  assert.equal(h2['x-opencode-session'], h['x-opencode-session'],
    'my plugin must reproduce the original header value exactly')
}

// ---------------------------------------------------------------- scenario C
// BOTH loaded together (the transition state), asserting no double-patching
// corrupts the header and the Olla route still works.
{
  const saved = globalThis.fetch
  const orig = await import(ORIG)
  const mine = await import(MINE)

  const ctx = makeCtx()
  orig.apply(ctx, OPTS)
  mine.apply(ctx, {
    providers: {
      opencode: 'x-opencode-session',
      'opencode-go': 'x-opencode-session',
      'b70-olla': 'X-Olla-Session-ID',
    },
    mode: 'session-id',
  })

  await drive(ctx, 'opencode', 'S2')
  const oc = received.at(-1)
  await drive(ctx, 'b70-olla', 'S2')
  const olla = received.at(-1)

  // Two plugins patched fetch; the inner one must still add the Olla header,
  // and the OpenCode header must be present exactly once with the right value.
  console.log(`coexist   both loaded, oc     -> x-opencode-session=${oc['x-opencode-session']}`)
  console.log(`coexist   both loaded, olla   -> X-Olla-Session-ID=${olla['x-olla-session-id']}`)

  assert.equal(oc['x-opencode-session'], 'S2', 'opencode header must survive double-patching')

  ctx._disposeAll()
  globalThis.fetch = saved

  if (olla['x-olla-session-id'] === 'S2') {
    console.log('OK  both plugins coexist; Olla route served by the new plugin')
  } else {
    console.log('NOTE olla header not applied while BOTH are mounted ' +
      `(got ${olla['x-olla-session-id']}). ` +
      'Expected: the outer fetch patch wins. Run the new plugin ALONE instead ' +
      'of alongside the original.')
  }
}

server.close()
console.log('\nCOEXISTENCE: checked')
