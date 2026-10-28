// #429, reported/requested by L33Z22L11: https://github.com/Han-1413141/dsh-cost-meter/issues/429
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { sanitizeConfig, applyConfigPatch } from '../lib/store.js'
const source = readFileSync(new URL('../src/notices/index.js', import.meta.url), 'utf8')
const main = readFileSync(new URL('../src/client/03-settings-panels-main.js', import.meta.url), 'utf8')
for (const id of ['simple-guide', 'qstrip-guide', 'summary-guide', 'peak-progress-guide', 'balance-click-guide']) {
  assert.ok(!main.includes("id: 'cost-meter-" + id + "'"), id + ': no residual automatic registration')
}
assert.equal((main.match(/id: 'cost-meter-display-onboarding'/g) ?? []).length, 1)
for (const id of ['cost-meter-codex-compat', 'cost-meter-peak-alert']) assert.ok(main.includes("id: '" + id + "'"), 'billing/safety registration preserved')
const flags = ['sidebarSimplePromptSeen', 'sidebarSummaryPromptSeen', 'peakProgressPromptSeen']
const legacyKeys = ['dsh-cost-meter:simple-guide-dismissed', 'dsh-cost-meter:balance-click-hint-seen', 'dsh-cost-meter:peak-progress-intro-v1', 'dsh-cost-meter:sidebar-summary-intro-v1']
const key = 'dsh-cost-meter:display-onboarding-seen'
const expected = Object.fromEntries(flags.map(field => [field, true]))
expected.quotaStrip = { promptSeen: true }; expected.balance = { clickHintSeen: true }
function fixture(config = sanitizeConfig({}), storage = new Map()) {
  let registered, i = 0, dirty = false, hooks = [], effects = [], calls = [], tree
  const window = { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, addEventListener() {}, removeEventListener() {}, __ModuleLoader__: { load: value => registered = value } }
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useRef: initial => hooks[i++] ??= { current: initial },
    useState: initial => { const idx = i++; if (!(idx in hooks)) hooks[idx] = typeof initial === 'function' ? initial() : initial; return [hooks[idx], value => { if (!Object.is(hooks[idx], value)) { hooks[idx] = value; dirty = true } }] },
    useEffect: (fn, deps) => { const idx = i++, old = hooks[idx]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) { hooks[idx] = { deps, cleanup: old?.cleanup }; effects.push(() => { hooks[idx].cleanup?.(); hooks[idx].cleanup = fn() }) } },
  }
  vm.runInNewContext(source, { window, document: { activeElement: null } })
  const Component = registered.factory(() => React).mount({ FloatingCard: 'card', makeT: () => k => k, resolveLocale: c => c.locale ?? 'zh' })
  const render = () => { let n = 0; do { dirty = false; i = 0; tree = Component({ useCost: () => config ? { state: { config } } : {}, api: { updateConfig: patch => { calls.push(JSON.parse(JSON.stringify(patch))); return Promise.reject(Error('offline')) } } }); const queued = effects; effects = []; queued.forEach(fn => fn()); assert.ok(++n < 20) } while (dirty); return tree }
  return { render, calls, storage }
}
for (const file of ['src/notices/index.js', 'lib/client.notices.js']) new vm.Script(readFileSync(new URL('../' + file, import.meta.url), 'utf8'))
const base = sanitizeConfig({ sidebarStyle: 'compact', sidebarSimple: true, currency: 'USD', pricingCurrency: 'CNY', balance: { display: 'settings' }, quotaStrip: { enabled: true } })
const fresh = fixture(base)
assert.equal(fresh.render().props.role, 'dialog', 'fresh installs receive one optional display entry')
const card = fresh.render(); card.props.actions.dismiss(); card.props.actions.dismiss()
await Promise.resolve(); await Promise.resolve()
assert.deepEqual(fresh.calls, [expected], 'one marker-only patch, even on rejected RPC')
assert.equal(fresh.render(), null)
assert.equal(fresh.storage.get(key), '1')
const changed = applyConfigPatch(base, fresh.calls[0]); assert.deepEqual(changed.errors, [])
const preserved = structuredClone(changed.config)
for (const field of flags) preserved[field] = base[field]
preserved.quotaStrip.promptSeen = base.quotaStrip.promptSeen; preserved.balance.clickHintSeen = base.balance.clickHintSeen
assert.deepEqual(preserved, base, 'display, placement, currency, balances and billing preferences are unchanged')
for (const patch of [...flags.map(field => ({ [field]: true })), { quotaStrip: { promptSeen: true } }, { balance: { clickHintSeen: true } }]) {
  const f = fixture(applyConfigPatch(base, patch).config); assert.equal(f.render(), null, 'any old display acknowledgement migrates without re-prompt'); assert.deepEqual(f.calls, [])
}
for (const localKey of [key, ...legacyKeys]) { const f = fixture(base, new Map([[localKey, '1']])); assert.equal(f.render(), null); assert.deepEqual(f.calls, []) }
assert.equal(fixture(null).render(), null, 'missing/loading state cannot interrupt the host')
const older = structuredClone(base); for (const field of flags) delete older[field]; delete older.balance.clickHintSeen; delete older.quotaStrip.promptSeen
const oldHost = fixture(older); oldHost.render().props.actions.dismiss(); await Promise.resolve()
assert.deepEqual(oldHost.calls, [], 'absent old-host marker fields are not submitted')
assert.equal(oldHost.render(), null)
console.log('[ok] Unified onboarding: one registration, marker migration, preferences unchanged, supported-field-only dismissal and unchanged safety alerts')
