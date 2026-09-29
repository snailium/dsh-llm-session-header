// Slot contract test: the browser half must claim the slot the Plugins page's
// contract assigns to a THIRD-PARTY bundle's own row.
//
// The page's slot contract (packages/client/ui-plugin-manager/src/client/
// slot-contract.ts, byte-identical in dsh 0.1.7-rc.2 and 0.2.0-rc.2) says:
//
//   'plugins.item': … OCCUPIED by the official settings pages, one companion
//   package per host-plane namespace; a bundle's configuration belongs in
//   plugins.bundle.config or plugins.row.config instead.
//
// Our settings namespace is the loader entry id, which is also the id of the row
// our bundle declares, so the contract's match is `plugins.row.config` keyed
// `<package name>#<row id>`. That is also the only non-official config slot the
// page hands a `form` to, and the one whose registration is what makes the row
// gain a Configure button.
//
// Registering into `plugins.item` still renders — it is a valid list slot — so a
// wrong choice shows up as a third-party card mislabelled under "Official"
// rather than as an error. Hence a test rather than a runtime check.
//
// Runs the real bundle file against a stub slot registry: no browser, no dsh.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const ENTRY_ID = 'llm-session-header'
const ROW_KEY = `${pkg.name}#${ENTRY_ID}`

// ------------------------------------------------- 1. the reserved slot is unused
const injected = [...source.matchAll(/ctx\.slots\.inject\(\s*"([^"]+)"/g)].map((m) => m[1])
assert.ok(injected.length > 0, 'the bundle must register at least one slot')
assert.ok(
  !injected.includes('plugins.item'),
  'plugins.item is reserved for official namespaces; a third-party bundle must not claim it',
)
assert.ok(
  injected.includes('plugins.row.config'),
  `a bundle's own row configuration belongs in plugins.row.config, got: ${injected.join(', ')}`,
)

// ------------------------------------------------- 2. exactly one keyed slot, right key
const registered = [...source.matchAll(/name:\s*"(plugins\.[a-z.]+)",\s*\n\s*key:\s*`\$\{PACKAGE\}(#\$\{ENTRY_ID\})?`/g)]
assert.equal(registered.length, 1,
  `expected exactly one keyed registration, got ${registered.length}: ${injected.join(', ')}`)
assert.equal(registered[0][1], 'plugins.row.config',
  'a namespace that is a row id must use plugins.row.config, not plugins.bundle.config')
assert.equal(registered[0][2], '#${ENTRY_ID}',
  'plugins.row.config is keyed `<package name>#<row id>`; bundle.config uses the bare package name')

// ------------------------------------------------- 3. the key matches package.json
assert.equal(ROW_KEY, 'dsh-llm-session-header#llm-session-header',
  'the row key must be spelled from package.json + the row id, both as literals in the bundle')
assert.match(source, /const PACKAGE = "dsh-llm-session-header"/,
  'PACKAGE must be pinned as a literal so a package rename fails here')
assert.match(source, /const ENTRY_ID = "llm-session-header"/,
  'ENTRY_ID must be pinned as a literal so a row rename fails here')

// ------------------------------------------------- 4. the gate is still whileServed
assert.match(source, /whileServed\(\[ENTRY_ID\]/,
  'the registration must be gated on the Host serving the settings namespace')

// ------------------------------------------------- 5. no dead `label`/`order` on a keyed slot
const block = source.slice(source.indexOf('ctx.slots.inject("plugins.row.config"'))
assert.ok(!/\blabel:/.test(block), 'a keyed slot takes its heading from the bundle patch, not a label')
assert.ok(!/\border:/.test(block), 'order is unused for keyed slots')

console.log('OK  the card claims plugins.row.config keyed dsh-llm-session-header#llm-session-header')
console.log('OK  plugins.item (official-only) is not claimed, and the whileServed gate is intact')
console.log('\nSLOT CONTRACT: PASS')
