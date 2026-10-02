// Verifies the BUILT client bundle (lib/client.js), not its sources.
//
// `scripts/build-client.js` assembles lib/client.js by stripping import/export
// lines from src/client/*.js and concatenating them in a fixed order. Nothing
// else checks the result: the controller tests import src/client/controller.js
// directly, and tests/slot-contract.mjs only pattern-matches the bundle's text.
// So a concatenation that parses but fails at runtime — an unresolved free
// variable, a class used before its declaration, a stripped import that was
// actually needed — would ship unnoticed.
//
// This loads the real bundle the way the Plugins page does (through
// window.__ModuleLoader__.load), runs `apply`, then renders the card it
// registers with stub React, and asserts the resulting tree.
//
// No browser and no dsh: only the bundle, a stub module table, and stubs.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SOURCE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

/** Load the bundle through a stub module table and return its exports. */
function loadBundle() {
  let registration = null
  const window = {
    __ModuleLoader__: {
      load(spec) { registration = spec },
    },
  }

  // The bundle is a classic script: evaluating it registers through `window`.
  new Function('window', SOURCE)(window)

  assert.ok(registration, 'the bundle must call window.__ModuleLoader__.load')
  assert.equal(registration.id, 'dsh-llm-session-header',
    'the loader id must be the package name')

  const jsxRuntime = {
    jsx: (type, props, key) => ({ type, props: props ?? {}, key }),
    jsxs: (type, props, key) => ({ type, props: props ?? {}, key }),
  }
  const primitives = {
    SettingsForm: function SettingsForm() {},
    SettingsValueField: function SettingsValueField() {},
  }
  const seen = []
  const require = (spec) => {
    seen.push(spec)
    if (spec === 'react/jsx-runtime') return jsxRuntime
    if (spec === 'react') return { createElement: () => {} }
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected require(${spec})`)
  }

  return { exports: registration.factory(require), seen, primitives }
}

/** A mock ctx covering exactly what lifecycle.js touches. */
function makeCtx({ served = true, routes = ['b70-smg', 'opencode'] } = {}) {
  const value = { providers: { 'b70-smg': 'X-SMG-Routing-Key' }, mode: 'session-id' }
  const effects = []
  let registered = null
  let injected = null
  let whileServedGate = null

  const scope = {
    getSnapshot: () => ({ status: 'ready', writable: true, revision: 7, value: { ...value }, base: {} }),
    subscribe: () => () => {},
    mutate: async () => true,
  }

  const ctx = {
    logger: { info() {}, warn() {} },
    configForms: {
      get: () => scope,
      describe: () => ({
        getSnapshot: () => ({ view: { namespaces: [{ ns: 'llm-pi-ai', value: { providers: Object.fromEntries(routes.map((r) => [r, {}])) } }] } }),
        subscribe: () => () => {},
      }),
      whileServed(namespaces, register) { whileServedGate = namespaces; return register() },
    },
    slots: {
      inject(name, cb) { injected = name; return cb() },
      register(options, component) { registered = { options, component }; return () => {} },
    },
    locale: {
      bind: () => (key) => `[${key}]`,
      register() {},
    },
    effect(fn) { effects.push(fn()); return () => {} },
    // exposed for assertions
    _registered: () => registered,
    _injected: () => injected,
    _gate: () => whileServedGate,
    _effects: effects,
    _served: served,
  }
  return ctx
}

test('the built bundle loads and registers through the module loader', () => {
  const { exports, seen } = loadBundle()
  assert.equal(typeof exports.apply, 'function', 'apply must be exported')
  assert.deepEqual(exports.inject, ['slots', 'locale', 'configForms'])
  assert.ok(seen.includes('react/jsx-runtime'), 'the bundle must pull the jsx runtime')
  assert.ok(seen.includes('@deepseek-ai/dsh-client-ui-primitives'),
    'the bundle must pull the shared primitives from the module table')
})

test('apply() registers the card into plugins.row.config behind whileServed', () => {
  const { exports } = loadBundle()
  const ctx = makeCtx()
  exports.apply(ctx)

  assert.deepEqual(ctx._gate(), ['llm-session-header'],
    'the registration must be gated on the Host serving the settings namespace')
  assert.equal(ctx._injected(), 'plugins.row.config',
    'a bundle row configuration belongs in plugins.row.config')
  const reg = ctx._registered()
  assert.ok(reg, 'a slot entry must be registered')
  assert.equal(reg.options.name, 'plugins.row.config')
  assert.equal(reg.options.key, 'dsh-llm-session-header#llm-session-header',
    'the key is `<package name>#<row id>`')
  assert.equal(typeof reg.component, 'function', 'the registration must carry the component')
})

test('apply() is inert on a host without configForms (0.1.2/0.1.5)', () => {
  const { exports } = loadBundle()
  const ctx = makeCtx()
  ctx.configForms = undefined
  exports.apply(ctx)
  assert.equal(ctx._registered(), null, 'nothing may be registered without a settings scope')
})

test('the card renders its form body with the composed state', () => {
  const { exports, primitives } = loadBundle()
  const ctx = makeCtx()
  exports.apply(ctx)
  const Card = ctx._registered().component

  const snapshot = {
    available: true,
    writable: true,
    saving: false,
    failed: false,
    dirty: false,
    availableRoutes: ['b70-smg', 'opencode'],
    headerName: { text: 'x-opencode-session', overridden: false, invalid: false },
    mode: { text: 'session-id', overridden: false, invalid: false },
    debug: { text: 'false', overridden: false, invalid: false },
    providers: [{ route: 'b70-smg', header: 'X-SMG-Routing-Key', isCustom: false }],
    addInvalid: false,
  }
  const props = {
    t: (key) => `[${key}]`,
    view: 'page',
    useLlmSessionHeaderCard: (select) => select(snapshot),
    save: () => {},
    discard: () => {},
    editHeaderName: () => {},
    editMode: () => {},
    toggleDebug: () => {},
    editProvider: () => {},
    setCustomRoute: () => {},
    removeProvider: () => {},
    addProvider: () => {},
  }

  const tree = Card(props)
  assert.ok(tree, 'the card must render a tree for view=page')
  assert.equal(tree.type, primitives.SettingsForm,
    'the body must be the shared SettingsForm, not a self-drawn frame')

  // Walk the tree for the controls the card owns.
  const found = new Set()
  const walk = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const n of node) walk(n); return }
    if (typeof node.type === 'string') found.add(node.type)
    const children = node.props?.children
    if (Array.isArray(children)) for (const c of children) walk(c)
    else if (children !== undefined) walk(children)
  }
  walk(tree)

  assert.ok(found.has('select'), 'the mode control must render')
  assert.ok(found.has('input'), 'the header/debug/route inputs must render')
  assert.ok(found.has('button'), 'the add/remove controls must render')
})

test('the card returns one line of copy for the summary view', () => {
  const { exports } = loadBundle()
  const ctx = makeCtx()
  exports.apply(ctx)
  const Card = ctx._registered().component
  // The hook is read before the summary early-return, so the slot renderer must
  // inject it for every view — including summary. Pass it as the page does.
  const out = Card({
    t: (k) => `[${k}]`,
    view: 'summary',
    useLlmSessionHeaderCard: (select) => select({}),
  })
  assert.equal(out, '[description]', 'summary must be the row-description fallback')
})

test('the route dropdown falls back to a free-text field for a custom row', () => {
  const { exports } = loadBundle()
  const ctx = makeCtx()
  exports.apply(ctx)
  const Card = ctx._registered().component

  const render = (isCustom) => {
    const snapshot = {
      available: true, writable: true, saving: false, failed: false, dirty: false,
      availableRoutes: ['b70-smg'],
      headerName: { text: 'h', overridden: false, invalid: false },
      mode: { text: 'session-id', overridden: false, invalid: false },
      debug: { text: 'false', overridden: false, invalid: false },
      providers: [{ route: isCustom ? 'my-route' : 'b70-smg', header: '', isCustom }],
      addInvalid: false,
    }
    return Card({
      t: (k) => `[${k}]`, view: 'page',
      useLlmSessionHeaderCard: (s) => s(snapshot),
      save() {}, discard() {}, editHeaderName() {}, editMode() {}, toggleDebug() {},
      editProvider() {}, setCustomRoute() {}, removeProvider() {}, addProvider() {},
    })
  }

  // The mode control is always a <select>, so scope the assertion to the route
  // cell (`div.llm-session-header-route-cell`) rather than the whole tree.
  const routeCell = (tree) => {
    let found = null
    const walk = (n) => {
      if (found || n === null || typeof n !== 'object') return
      if (Array.isArray(n)) { for (const x of n) walk(x); return }
      if (n.type === 'div' && n.props?.className === 'llm-session-header-route-cell') { found = n; return }
      const c = n.props?.children
      if (Array.isArray(c)) for (const x of c) walk(x)
      else if (c !== undefined) walk(c)
    }
    walk(tree)
    return found
  }

  const tagsIn = (node) => {
    const out = []
    const walk = (n) => {
      if (n === null || typeof n !== 'object') return
      if (Array.isArray(n)) { for (const x of n) walk(x); return }
      if (typeof n.type === 'string') out.push(n.type)
      const c = n.props?.children
      if (Array.isArray(c)) for (const x of c) walk(x)
      else if (c !== undefined) walk(c)
    }
    walk(node)
    return out
  }

  const listed = routeCell(render(false))
  assert.ok(listed, 'the route cell must render')
  assert.ok(tagsIn(listed).includes('select'), 'a listed route uses the dropdown')
  assert.ok(!tagsIn(listed).includes('input'), 'a listed route must not also show a free-text field')

  const custom = routeCell(render(true))
  assert.ok(custom, 'the route cell must render')
  assert.ok(tagsIn(custom).includes('input'), 'a custom route uses a free-text input')
  assert.ok(!tagsIn(custom).includes('select'), 'a custom route must not also render the dropdown')
})
