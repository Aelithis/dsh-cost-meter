import assert from 'node:assert/strict'
import vm from 'node:vm'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Ledger, sanitizeConfig, applyConfigPatch } from '../lib/store.js'
import { stateSchema } from '../lib/typert.host.js'

const dir = new URL('../src/client/', import.meta.url)
const source = readdirSync(dir).filter(n => n.endsWith('.js')).sort().map(n => readFileSync(new URL(n, dir), 'utf8')).join('')
let factory, hookIndex = 0, hooks = []
const storage = new Map()
vm.runInNewContext(source.replace('exports.apply = apply', 'exports.test = { SidebarFooter, parseConfig, codexQuotaCache }; exports.apply = apply'), {
  navigator: { language: 'en' }, window: { __ModuleLoader__: { load: v => { factory = v.factory } }, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
})
const el = (type, props, ...children) => ({ type, props: props ?? {}, children })
const React = { createElement: el, Fragment: 'fragment', useEffect() {},
  useRef: value => { const i = hookIndex++; return hooks[i] ??= { current: value } },
  useState: init => { const i = hookIndex++; if (!(i in hooks)) hooks[i] = typeof init === 'function' ? init() : init; return [hooks[i], value => { hooks[i] = value }] },
}
const ui = factory(name => name === 'react' ? React : { Tooltip: 'tooltip' }).test
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.children)] : []
const base = sanitizeConfig({ sidebarStyle: 'compact', quotaStrip: { promptSeen: true }, balance: { clickHintSeen: true }, hideOfficialBalance: true, goQuota: { enabled: false } })
assert.equal(base.sidebarSimple, false, '旧配置保留当前布局')
assert.equal(base.sidebarStyle, 'compact')
for (const field of ['sidebarSimple', 'sidebarSimplePromptSeen']) {
  assert.ok(applyConfigPatch(base, { [field]: 'true' }).errors.length > 0, '不能把文本当作用户选择')
}
// Visual choices now live only in Display settings; onboarding never applies them.
let config = applyConfigPatch(base, { sidebarSimple: true, sidebarSimplePromptSeen: true }).config
const rpcConfig = stateSchema.shape.config.parse(config)
const clientConfig = ui.parseConfig(rpcConfig, 'config')
assert.equal(clientConfig.sidebarSimple, true)
assert.equal(clientConfig.sidebarSimplePromptSeen, true)
const oldConfig = structuredClone(config)
for (const field of ['sidebarSimplePromptSeen', 'sidebarSummaryPromptSeen', 'peakProgressPromptSeen']) delete oldConfig[field]
delete oldConfig.quotaStrip.promptSeen; delete oldConfig.balance.clickHintSeen
const oldClient = ui.parseConfig(oldConfig, 'config')
for (const field of ['sidebarSimplePromptSeen', 'sidebarSummaryPromptSeen', 'peakProgressPromptSeen']) assert.equal(Object.hasOwn(oldClient, field), false, 'old-host marker absence survives parsing')
assert.equal(Object.hasOwn(oldClient.quotaStrip, 'promptSeen'), false)
assert.equal(Object.hasOwn(oldClient.balance, 'clickHintSeen'), false)
const api = {}
const root = mkdtempSync(join(tmpdir(), 'cm-simple-118-'))
const oldHome = process.env.DSH_HOME
try {
  process.env.DSH_HOME = root
  const ledger = Ledger.open()
  ledger.config = config
  ledger.scheduleWrite()
  ledger.close()
  const reopened = Ledger.open()
  assert.equal(reopened.config.sidebarSimple, true)
  assert.equal(reopened.config.sidebarSimplePromptSeen, true, '重启后无需再次选择')
  reopened.close()
} finally {
  if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
  rmSync(root, { recursive: true, force: true })
}

const totals = { cost: 1, calls: 1, input: 100, output: 20, cacheRead: 0, cacheWrite: 0 }
const win = { percent: 25, resetsAt: new Date(Date.now() + 3600000).toISOString() }
config = sanitizeConfig({ ...base, budget: { enabled: true }, codingPlans: { kimi: { enabled: true, display: 'sidebar' } }, sidebarSimple: true, sidebarSimplePromptSeen: true })
const state = { config, today: totals, month: totals, total: totals, codingPlans: { kimi: { status: 'ok', windows: { daily: win }, fetchedAt: Date.now() } }, gatewayQuotas: { sources: [] } }
ui.codexQuotaCache.status = 'unavailable'
const footer = wide => { hooks = []; hookIndex = 0; return ui.SidebarFooter({ wide, useCost: pick => pick({ state }), api }) }
const simple = footer(true)
assert.match(simple.props.className, /simple/)
assert.doesNotMatch(simple.props.className, /compact/)
assert.equal(simple.props.tabIndex, 0, '可用键盘进入并滚动')
assert.equal(nodes(simple).filter(n => n.props.summary === true).length, 1, '预算使用独立摘要')
assert.equal(nodes(simple).filter(n => n.props['data-cm-display'] === 'today').length, 1, '今日用量单独显示')
assert.match(footer(false).props.className, /rail.*simple/)
state.config = { ...config, sidebarSimple: false }
const standard = footer(true)
assert.match(standard.props.className, /compact/)
assert.doesNotMatch(standard.props.className, /simple/)
console.log('[ok] #118 display settings: preference validation, RPC/restart persistence, layout restoration and keyboard scrolling')
