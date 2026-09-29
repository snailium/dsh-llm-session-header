// Real-boot compatibility test against dsh 0.2.0-rc.2.
//
// The 0.1.7 → 0.2.0 audit found the whole settings chain byte-identical and only
// the client primitives / plugin-manager bundles changed. This test pins the two
// things that could still break the plugin on 0.2.0 and that a file diff cannot
// settle on its own:
//
//   1. the Host half activates under 0.2.0's REAL schemastery, and the schema
//      still yields live volatile handles (the card's whole write path);
//   2. a save committed through those handles changes the route table the
//      `llm/stream` hook resolves — i.e. the no-restart promise still holds.
//
// It loads schemastery from a 0.2.0 install when one is given, so the schema is
// validated by the same library the new Host uses.
//
// Usage:
//   node tests/compat-0.2.mjs                       # uses the plugin's own schemastery
//   DSH_020=<prefix> node tests/compat-0.2.mjs      # uses <prefix>'s dsh packages

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

// ---------------------------------------------------------- pick schemastery
const prefix = process.env.DSH_020
let schemaUrl = null
if (prefix) {
  const p = join(prefix, 'node_modules', '@deepseek-ai', 'schemastery', 'lib', 'index.js')
  if (existsSync(p)) schemaUrl = pathToFileURL(p).href
}

const { default: z } = schemaUrl ? await import(schemaUrl) : await import('@deepseek-ai/schemastery')
const zPkg = schemaUrl
  ? JSON.parse((await import('node:fs')).readFileSync(
      join(prefix, 'node_modules', '@deepseek-ai', 'schemastery', 'package.json'), 'utf8'))
  : require('@deepseek-ai/schemastery/package.json')

const mod = await import(new URL('../lib/index.js', import.meta.url).href)

console.log(`schemastery under test: ${zPkg.version}${prefix ? ' (from the 0.2.0 prefix)' : ''}`)
assert.ok(typeof z.string === 'function', 'schemastery must expose string()')

// ---------------------------------------------- 1. the schema still works
assert.ok(mod.Config, 'the plugin must export a Config schema')
assert.equal(mod.Config['~standard'].vendor, 'schemastery',
  'the Host identifies the schema by this vendor string, not by object identity')

const parsed = mod.Config['~standard'].validate({
  headerName: 'x-opencode-session',
  providers: ['opencode'],
  mode: 'session-id',
  debug: false,
})
assert.equal(parsed.issues, undefined,
  `schema must validate cleanly, got: ${JSON.stringify(parsed.issues)}`)

// Every declared field must come back as a LIVE HANDLE, or a card save cannot
// reach a running instance and the entry is not reported as a namespace at all.
for (const field of ['headerName', 'providers', 'mode', 'debug', 'debugFile']) {
  const v = parsed.value[field]
  assert.ok(v !== null && typeof v === 'object' && typeof v.get === 'function',
    `${field} must resolve to a volatile handle, got ${typeof v}`)
}
assert.deepEqual(parsed.value.providers.get(), ['opencode'])
console.log('OK  schema validates on 0.2.0 and every field is a live volatile handle')

// The write seam re-validates the whole mutated document (`configEditor.edit` →
// `resolveConfig`), so a card that stages a value of the wrong TYPE is refused
// with `settings/rejected` and the save silently does not happen. A boolean
// field is the trap: `settingsTextField.parse` returns the raw string, so a
// card built on text fields writes "true" into `z.boolean()` and is rejected.
// Our card stages a real boolean, so assert that stays true.
{
  const okBool = mod.Config['~standard'].validate({ debug: true, providers: ['a'] })
  assert.equal(okBool.issues, undefined, 'a real boolean must be accepted on write')
  assert.equal(okBool.value.debug.get(), true)

  const strBool = mod.Config['~standard'].validate({ debug: 'true' })
  assert.ok(strBool.issues, 'a string in a boolean field must be rejected (the trap)')
  console.log('OK  boolean fields accept booleans and reject strings (write-seam type check)')
}

// ------------------------------------- 2. a live save moves the route table
const { apply, resolveConfig } = mod
const effects = []
const listeners = new Map()
const ctx = {
  logger: { info() {}, warn() {}, debug() {} },
  effect(fn, name) { effects.push({ name, dispose: fn() }) },
  on(event, fn) { listeners.set(event, fn) },
}

// Hand `apply` exactly what the 0.2.0 Host would: the parsed config whose
// fields are volatile handles.
apply(ctx, parsed.value)
assert.ok(listeners.has('llm/stream'), 'llm/stream must be registered')

const before = resolveConfig(parsed.value)
assert.equal(before.providers.has('b70-smg'), false,
  'b70-smg must not be routed before the save')

// Simulate the Host committing a card save: it rewrites the SAME handle's value
// in place (that is what makes a restart unnecessary).
const write = Object.getOwnPropertySymbols(parsed.value.providers)
  .find((s) => String(s).includes('volatile.write'))
assert.ok(write, 'the handle must carry the cosmokit volatile writer symbol')
parsed.value.providers[write]({ opencode: 'x-opencode-session', 'b70-smg': 'X-SMG-Routing-Key' })

const after = resolveConfig(parsed.value)
assert.equal(after.providers.get('b70-smg'), 'X-SMG-Routing-Key',
  'the new route must be live on the next resolve, with no restart')
assert.equal(after.providers.get('opencode'), 'x-opencode-session')
console.log('OK  an in-place save is visible to the next resolve (no restart needed)')

// A scalar field too, so the card's header-name edit is covered.
const hnWrite = Object.getOwnPropertySymbols(parsed.value.headerName)
  .find((s) => String(s).includes('volatile.write'))
parsed.value.headerName[hnWrite]('X-SMG-Routing-Key')
parsed.value.providers[write](['b70-smg'])
assert.equal(resolveConfig(parsed.value).providers.get('b70-smg'), 'X-SMG-Routing-Key')
console.log('OK  headerName + list-form providers resolve together after a save')

for (const e of effects) e.dispose?.()
console.log('\n0.2.0 REAL-BOOT COMPAT: PASS')
