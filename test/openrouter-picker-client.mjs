import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname, join } from 'node:path'
import vm from 'node:vm'

// Render the installed DSH ModelSelect, with inert UI primitives and a synthetic
// host directory. Selection and keyboard handlers are the real host component's.
const deps = process.argv[2] ?? process.env.DSH_TEST_NODE_MODULES
const req = createRequire(resolve(deps, '__picker.cjs'))
const host = createRequire(resolve(process.argv[3] ?? deps, '__host.cjs'))
const { JSDOM } = req('jsdom')
const dom = new JSDOM('<div id="root" data-slot="conversation.input.model"></div><div id="prices"></div>', { url: 'http://localhost', pretendToBeVisual: true })
dom.window.HTMLElement.prototype.scrollIntoView = function () {}
const saved = Object.getOwnPropertyDescriptors(globalThis)
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'HTMLInputElement', 'HTMLButtonElement']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const React = req('react'), { createRoot } = req('react-dom/client'), { act } = req('react-dom/test-utils')
const el = React.createElement, root = createRoot(document.getElementById('root'))
const pricingRoot = createRoot(document.getElementById('prices'))
const timers = new Set()
const clock = { now: () => now }
let now = Date.parse('2026-10-09T07:00:00Z')
function moduleOf(source, require, extra = {}) {
  let factory
  dom.window.__ModuleLoader__ = { load: row => { factory = row.factory } }
  vm.runInNewContext(source, { window: dom.window,
    document, navigator, HTMLElement, Element, Node, HTMLInputElement, HTMLButtonElement,
    queueMicrotask, setTimeout, clearTimeout, console, Date: class extends Date { static now() { return clock.now() } },
    MutationObserver: dom.window.MutationObserver, ...extra,
  })
  return factory(require)
}
const ui = moduleOf(readFileSync(new URL('../lib/client.openrouter.js', import.meta.url), 'utf8'), () => React, {
  setInterval: fn => { timers.add(fn); return fn }, clearInterval: fn => timers.delete(fn),
})
const primitives = new Proxy({
  MenuSurface: React.forwardRef(({ compact, ...props }, ref) => el('div', { ...props, ref })),
  Input: React.forwardRef((props, ref) => el('input', { ...props, ref })),
  MenuGroup: ({ label, children }) => { const id = React.useId(); return el('section', { role: 'group', 'aria-labelledby': id, 'data-menu-group': '' }, el('div', { id, 'data-menu-group-heading': '' }, label), children) },
  rankByName: (models, query) => models.filter(model => model.name.toLowerCase().includes(query.toLowerCase())),
  observeStickyMenuGroups: () => () => {},
}, { get: (target, key) => target[key] ?? (() => null) })
const hostPath = join(dirname(host.resolve('@deepseek-ai/dsh-client-ui-model-selection/package.json')), 'lib/client.js')
const modelPlugin = moduleOf(readFileSync(hostPath, 'utf8'), name => name === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : name === '@deepseek-ai/cordis' ? { Service: class {} } : name === '@deepseek-ai/dsh-client-store' ? {} : req(name))
let Selector
const t = key => ({ 'menu.model': 'Model', 'trigger.selectAria': 'Select model', 'trigger.fallback': 'Select model', 'search.placeholder': 'Search models...' }[key] ?? key)
modelPlugin.apply({
  locale: { register: () => () => {}, bind: () => t }, plugin() {}, effect: fn => fn(),
  inject: (names, fn) => { if (!names.includes('slots')) return; fn({ modelDirectories: {}, sessions: {}, slots: { inject: (_, install) => install(), register: (_, component) => { Selector = component; return () => {} } } }) },
})
assert.equal(typeof Selector, 'function')
const models = [{ id: 'vendor/flash', name: 'Vendor: Flash' }, { id: 'vendor/flash:free', name: 'Vendor: Flash (free)' }, { id: 'vendor/absent', name: 'Unknown model' }]
const groups = [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'different', name: 'Vendor: Flash' }] }, { id: 'openrouter', name: 'OpenRouter', models }]
const snapshot = { groups, failures: [], status: 'ready', current: null, pending: null, error: null }
const directory = { getSnapshot: () => snapshot, subscribe: () => () => {} }
const selections = []
let locale = 'en', catalog = { models: [
  { id: 'vendor/flash', name: 'Official name', input: 0.1, output: 0.5, cachedInput: 0, cacheWrite: null, contextLength: 128000 },
  { id: 'vendor/flash:free', name: 'Official free name', input: 0, output: 0, cachedInput: null, cacheWrite: null, contextLength: 128000 },
], fetchedAt: '2026-10-09T07:00:00Z', stale: false, error: '' }, calls = 0
const api = { getOpenRouterCatalog: async () => { calls++; return structuredClone(catalog) } }
let stop, changedGroups
let mounted = 0
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve() })
const buttons = () => [...document.querySelectorAll('button[role="menuitemradio"]')]
const open = async () => {
  await act(async () => document.querySelector('#root button').click()); await flush()
  // Older DSH first opens a root menu; newer DSH goes straight to model rows
  // when no model is currently selected.
  if (!buttons().length) { await act(async () => document.querySelector('[role="menuitem"]').click()); await flush() }
}
try {
  const cleanups = [], effect = fn => { cleanups.push(fn()) }
  const PricePage = await ui.mount({
    get: name => name === 'remote' ? { $mount: async () => { mounted++; return () => mounted-- } } : { getOpenRouterCatalog: async () => ({ ok: true, value: await api.getOpenRouterCatalog() }) },
    effect,
    inject: (names, install) => {
      assert.deepEqual(Array.from(names), ['modelDirectories'])
      install({ effect, get: () => ({ catalog: { store: {
        getSnapshot: () => ({ value: { groups } }),
        subscribe: fn => { changedGroups = fn; return () => { changedGroups = null } },
      } } }) })
    },
  }, () => locale)
  stop = () => { for (const dispose of cleanups.reverse()) dispose() }
  assert.equal(mounted, 1)
  assert.equal(calls, 0, 'installing the hook does not fetch prices')
  await act(async () => root.render(el(Selector, {
    locked: false, available: true, directory, t, load() {},
    renderSlot: (_name, _props, options) => options?.fallback ?? null,
    select: async selection => { selections.push(selection); return { ok: true } },
  })))
  await open()
  assert.equal(buttons().length, 4)
  await act(async () => {
    for (const button of [document.querySelector('#root button'), ...buttons()]) {
      for (const type of ['pointerover', 'focusin']) button.dispatchEvent(new window.Event(type, { bubbles: true }))
    }
    document.dispatchEvent(new window.Event('visibilitychange'))
  })
  await flush()
  assert.equal(calls, 0, 'opening, hovering or focusing the picker never fetches a catalog')
  assert.equal(buttons()[1].title, 'Vendor: Flash', 'without a snapshot the native tooltip is kept')
  await act(async () => pricingRoot.render(el(PricePage, { state: { config: {} }, resolveLocale: () => locale })))
  await act(async () => pricingRoot.render(null))
  await act(async () => changedGroups())
  await flush()
  assert.equal(calls, 1, 'opening the Prices view fetches one catalog')
  assert.equal(buttons()[0].title, 'Vendor: Flash', 'another provider with the same display name is untouched')
  const paid = buttons()[1], free = buttons()[2], absent = buttons()[3]
  assert.match(paid.title, /Input: \$0.1\nOutput: \$0.5\nCache read: \$0\nCache write: —/)
  assert.match(paid.title, /Updated:/)
  assert.match(free.title, /Input: \$0\nOutput: \$0/)
  assert.match(absent.title, /Token price unavailable/)
  locale = 'zh'
  await act(async () => changedGroups()); await flush()
  assert.match(paid.title, /输入: \$0.1/)
  now += 60000; catalog.models[0].input = 9
  await act(async () => {
    paid.dispatchEvent(new window.Event('pointerover', { bubbles: true }))
    paid.dispatchEvent(new window.Event('focusin', { bubbles: true }))
    document.dispatchEvent(new window.Event('visibilitychange'))
  }); await flush()
  assert.equal(calls, 1, 'a stale snapshot is not refreshed from the picker')
  assert.match(paid.title, /输入: \$0.1/)
  assert.equal(timers.size, 0, 'only the mounted Prices view polls')
  // Ambiguous labels must not guess a model or provider.
  groups[1].models.push({ id: 'vendor/other', name: models[0].name })
  await act(async () => changedGroups()); await flush()
  assert.equal(paid.title, 'Vendor: Flash')
  groups[1].models.pop(); await act(async () => changedGroups()); await flush()
  await act(async () => free.click()); await flush()
  assert.equal(selections[0].provider, 'openrouter'); assert.equal(selections[0].model, 'vendor/flash:free')
  assert.equal(buttons().length, 0, 'host selection still closes the menu')
  await open()
  assert.equal(calls, 1, 'reopening the picker does not refresh a snapshot')
  const reopened = buttons()[1]
  stop(); stop = null
  assert.equal(reopened.title, 'Vendor: Flash', 'plugin unload restores the original title')
  assert.equal(timers.size, 0); assert.equal(changedGroups, null); assert.equal(mounted, 0)
} finally { stop?.(); await act(async () => root.unmount()); dom.window.close();
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'HTMLInputElement', 'HTMLButtonElement', 'IS_REACT_ACT_ENVIRONMENT']) {
    if (saved[key]) Object.defineProperty(globalThis, key, saved[key]); else delete globalThis[key]
  }
}
console.log('[ok] real DSH model picker ' + host('@deepseek-ai/dsh-client-ui-model-selection/package.json').version + ': no picker requests, snapshot tooltips, selection and cleanup')
