/**
 * @eddyskywalker/dsh-chatgpt-subscription 兼容(W1)测试。
 *
 * 纯本地:检测只读临时目录构造的 package.json(支持 scoped 包名),账本用
 * plain object / 临时目录;本插件不发任何网络请求,测试也不发。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Ledger, applyConfigPatch, sanitizeConfig } from '../lib/store.js'
import {
  DEFAULT_PLAN_PROVIDER_CLASS,
  PLAN_PROVIDER_ALIASES,
  PLAN_PROVIDER_IDS,
  billingClassOf,
  enabledPlanSetOf,
  planProviderIdOf,
} from '../lib/plan-billing.js'
import { detectCodexSubscription, detectSubscriptionPackage } from '../lib/codex-subscription-compat.js'
import {
  CHATGPT_SUBSCRIPTION_PACKAGE,
  CHATGPT_SUBSCRIPTION_PROVIDER_PLANS,
  detectChatgptSubscription,
  ensureChatgptSubscriptionPlan,
} from '../lib/chatgpt-subscription-compat.js'
import { apply } from '../lib/index.js'

const root = mkdtempSync(join(tmpdir(), 'cm-chatgpt-compat-'))
const NOT_INSTALLED = { installed: false, version: '', detection: 'none', packagePath: '' }
/** scoped 包名的两级路径段:@scope / name。 */
const SCOPED_SEGMENTS = CHATGPT_SUBSCRIPTION_PACKAGE.split('/')
const MIGRATION_ID = null // 本模块不做历史重算,无迁移标记
const W1_EXPECTED = {
  'codex-chatgpt': 'codex',
  'claude-subscription': 'anthropic',
  antigravity: 'antigravity',
  'kimi-code': 'kimi',
  'minimax-code': 'minimax',
  'command-code': 'commandcode',
  'workbuddy-subscription': 'workbuddy',
  'glm-coding-plan': 'zai',
  'step-code': 'stepfun',
}
const W1_MODELS = {
  'codex-chatgpt': 'gpt-6.1-sol',
  'claude-subscription': 'claude-sonnet-4-5',
  antigravity: 'gemini-3-pro',
  'kimi-code': 'kimi-k2',
  'minimax-code': 'minimax-m2',
  'command-code': 'command-code',
  'workbuddy-subscription': 'workbuddy',
  'glm-coding-plan': 'glm-4.6',
  'step-code': 'step-3',
}
const W1_PLAN_IDS = Object.values(CHATGPT_SUBSCRIPTION_PROVIDER_PLANS)

/** 在 <nodeModulesDir>/@scope/name/package.json 写清单,返回清单绝对路径。 */
function writeScopedPackage(nodeModulesDir, version) {
  const dir = join(nodeModulesDir, ...SCOPED_SEGMENTS)
  mkdirSync(dir, { recursive: true })
  const manifest = join(dir, 'package.json')
  writeFileSync(manifest, JSON.stringify({ name: CHATGPT_SUBSCRIPTION_PACKAGE, version }))
  return manifest
}

/** 注入用的「已安装」检测结果。 */
function installedDetection(version = '0.26.1') {
  return {
    installed: true,
    version,
    detection: 'package',
    packagePath: join(root, 'injected', ...SCOPED_SEGMENTS, 'package.json'),
  }
}

/** 纯函数直接操作的假账本:只含兼容模块会改动的字段 + 落盘计数。 */
function fakeLedger(configPatch = {}, days = {}) {
  return {
    config: sanitizeConfig(configPatch),
    days,
    migrations: [],
    writes: 0,
    scheduleWrite() { this.writes += 1 },
  }
}

try {
  // ---------- 0. 导出契约 ----------
  assert.equal(CHATGPT_SUBSCRIPTION_PACKAGE, '@eddyskywalker/dsh-chatgpt-subscription', 'scoped 包名常量')
  assert.deepEqual({ ...CHATGPT_SUBSCRIPTION_PROVIDER_PLANS }, W1_EXPECTED, '9 条 provider→planId 映射表')
  assert.ok(Object.isFrozen(CHATGPT_SUBSCRIPTION_PROVIDER_PLANS), '映射表冻结')
  assert.equal(typeof detectChatgptSubscription, 'function')
  assert.equal(typeof ensureChatgptSubscriptionPlan, 'function')
  assert.equal(MIGRATION_ID, null) // 说明:本模块只做配置归类,不做历史 apiCost 重算。

  // ---------- 1. scoped 包检测:三条路径 + 异常降级(全部临时目录/注入) ----------
  const emptyHome = join(root, 'empty-home')
  mkdirSync(emptyHome, { recursive: true })

  // 1a. 与本包同级的 node_modules:<node_modules>/@scope/name/lib/xx.js → package
  const siblingModule = join(root, 'node_modules', 'dsh-cost-meter', 'lib', 'chatgpt-subscription-compat.js')
  const siblingManifest = writeScopedPackage(join(root, 'node_modules'), '0.26.1')
  const packageDetection = { installed: true, version: '0.26.1', detection: 'package', packagePath: siblingManifest }
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: pathToFileURL(siblingModule).href, env: {}, homeDir: emptyHome }),
    packageDetection,
    '同级 node_modules 检测 scoped 包为 package',
  )
  assert.deepEqual(
    detectSubscriptionPackage(CHATGPT_SUBSCRIPTION_PACKAGE, { moduleUrl: pathToFileURL(siblingModule).href, env: {}, homeDir: emptyHome }),
    packageDetection,
    '泛化检测与薄包装结果一致',
  )

  // 1b. 同级 node_modules 优先于 profile 目录
  const priorityProfile = join(root, 'profile-priority')
  writeScopedPackage(join(priorityProfile, 'node_modules'), '9.9.9')
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: pathToFileURL(siblingModule).href, env: { DSH_PROFILE_DIR: priorityProfile }, homeDir: emptyHome }),
    packageDetection,
    '同级 node_modules 优先于 profile',
  )

  // 1c. DSH_PROFILE_DIR / options.profileDir → profile
  const repoLikeModule = join(root, 'plain-app', 'dsh-cost-meter', 'lib', 'chatgpt-subscription-compat.js')
  const repoLikeUrl = pathToFileURL(repoLikeModule).href
  const profileDir = join(root, 'profile-scope')
  const profileManifest = writeScopedPackage(join(profileDir, 'node_modules'), '2.0.0')
  const profileDetection = { installed: true, version: '2.0.0', detection: 'profile', packagePath: profileManifest }
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: repoLikeUrl, env: { DSH_PROFILE_DIR: profileDir }, homeDir: emptyHome }),
    profileDetection,
    'DSH_PROFILE_DIR 检测为 profile',
  )
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: repoLikeUrl, env: {}, profileDir, homeDir: emptyHome }),
    profileDetection,
    'options.profileDir 注入可替代环境变量',
  )

  // 1d. $DSH_HOME/profiles/* 扫描(排序取首个命中) → profile
  const profilesHome = join(root, 'home-profiles')
  const alphaManifest = writeScopedPackage(join(profilesHome, 'profiles', 'alpha', 'node_modules'), '1.0.0')
  writeScopedPackage(join(profilesHome, 'profiles', 'beta', 'node_modules'), '2.5.0')
  const alphaDetection = { installed: true, version: '1.0.0', detection: 'profile', packagePath: alphaManifest }
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: repoLikeUrl, env: {}, homeDir: profilesHome }),
    alphaDetection,
    'homeDir/profiles/* 按排序取首个命中',
  )
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: repoLikeUrl, env: { DSH_HOME: profilesHome } }),
    alphaDetection,
    '未显式注入 homeDir 时回落到 env.DSH_HOME',
  )

  // 1e. 都没有 → none(真实本仓库路径不会被误判)
  assert.deepEqual(
    detectChatgptSubscription({ env: {}, homeDir: emptyHome }),
    NOT_INSTALLED,
    '真实 moduleUrl(本仓库)为未安装',
  )
  assert.deepEqual(
    detectSubscriptionPackage('', { moduleUrl: repoLikeUrl, env: {}, homeDir: emptyHome }),
    NOT_INSTALLED,
    '空包名安全降级',
  )

  // 1f. 只在 profile package.json 里声明依赖,不算安装
  const declaringHome = join(root, 'home-declaring')
  mkdirSync(join(declaringHome, 'profiles', 'p'), { recursive: true })
  writeFileSync(join(declaringHome, 'profiles', 'p', 'package.json'),
    JSON.stringify({ name: 'profile', dependencies: { [CHATGPT_SUBSCRIPTION_PACKAGE]: '*' } }))
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: repoLikeUrl, env: {}, homeDir: declaringHome }),
    NOT_INSTALLED,
    '仅 dependencies 声明不视为安装',
  )

  // 1g. 清单损坏 / fs 抛异常:静默降级为未安装
  const corruptProfile = join(root, 'profile-corrupt')
  mkdirSync(join(corruptProfile, 'node_modules', ...SCOPED_SEGMENTS), { recursive: true })
  writeFileSync(join(corruptProfile, 'node_modules', ...SCOPED_SEGMENTS, 'package.json'), '{ not valid json')
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: repoLikeUrl, env: {}, profileDir: corruptProfile, homeDir: emptyHome }),
    NOT_INSTALLED,
    '损坏清单按未安装处理',
  )
  const throwingFs = { existsSync: () => { throw new Error('denied') }, readFileSync: () => { throw new Error('denied') }, readdirSync: () => { throw new Error('denied') } }
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: pathToFileURL(siblingModule).href, env: {}, homeDir: emptyHome, fs: throwingFs }),
    NOT_INSTALLED,
    'fs 异常不得抛出',
  )

  // 1h. scoped 与其他包隔离:只装 codex 包的目录里不误判本插件,反之亦然
  const isoNodeModules = join(root, 'iso', 'node_modules')
  const codexDir = join(isoNodeModules, 'dsh-codex-subscription')
  mkdirSync(codexDir, { recursive: true })
  writeFileSync(join(codexDir, 'package.json'), JSON.stringify({ name: 'dsh-codex-subscription', version: '1.2.3' }))
  const isoModule = join(isoNodeModules, 'dsh-cost-meter', 'lib', 'x.js')
  assert.deepEqual(
    detectChatgptSubscription({ moduleUrl: pathToFileURL(isoModule).href, env: {}, homeDir: emptyHome }),
    NOT_INSTALLED,
    '相邻目录只有 codex 包时不误判本插件',
  )
  assert.equal(
    detectCodexSubscription({ moduleUrl: pathToFileURL(isoModule).href, env: {}, homeDir: emptyHome }).version,
    '1.2.3',
    '泛化重构不改变 codex 检测结果',
  )
  assert.equal(
    detectChatgptSubscription({ moduleUrl: pathToFileURL(isoModule).href, env: {}, homeDir: emptyHome }).installed,
    false,
  )
  assert.deepEqual(
    detectSubscriptionPackage('dsh-chatgpt-subscription', { moduleUrl: pathToFileURL(isoModule).href, env: {}, homeDir: emptyHome }),
    NOT_INSTALLED,
    '非 scoped 同名包不匹配 scoped 包名',
  )

  // ---------- 2. plan-billing 映射与默认分类 ----------
  const baseConfig = sanitizeConfig({})
  for (const [providerId, planId] of Object.entries(W1_EXPECTED)) {
    assert.equal(planProviderIdOf(providerId, baseConfig.planBilling, W1_MODELS[providerId]), planId, providerId + ' → ' + planId)
    // 未适配前的默认分类:auto 且未启用订阅开关 → 计入 API。
    assert.equal(
      billingClassOf(providerId, W1_MODELS[providerId], baseConfig.planBilling, enabledPlanSetOf(baseConfig), baseConfig.prices),
      'api',
      providerId + ' 默认归 API',
    )
  }
  for (const id of ['workbuddy', 'antigravity', 'stepfun']) {
    assert.ok(PLAN_PROVIDER_IDS.includes(id), 'PLAN_PROVIDER_IDS 含 ' + id)
    assert.equal(DEFAULT_PLAN_PROVIDER_CLASS[id], 'auto', id + ' 默认 auto')
    assert.equal(baseConfig.planBilling.providers[id], 'auto', id + ' 默认配置 auto')
  }
  assert.deepEqual(PLAN_PROVIDER_ALIASES.codex, ['codex', 'openai-codex', 'dsh-openai-codex', 'codex-chatgpt'])
  assert.deepEqual(PLAN_PROVIDER_ALIASES.anthropic, ['anthropic', 'claude-subscription'])
  assert.deepEqual(PLAN_PROVIDER_ALIASES.zai, ['zai', 'glm-coding-plan'])
  assert.deepEqual(PLAN_PROVIDER_ALIASES.minimax, ['minimax', 'minimax-code', 'minimax-m-plan', 'minimax-mplan', 'minimax-token-plan'])
  assert.deepEqual(PLAN_PROVIDER_ALIASES.kimi, ['kimi', 'kimi-code', 'kimi-coding', 'kimi-coding-plan'])
  assert.deepEqual(PLAN_PROVIDER_ALIASES.commandcode, ['commandcode', 'command-code'])
  assert.deepEqual(PLAN_PROVIDER_ALIASES.workbuddy, ['workbuddy', 'workbuddy-subscription', 'workbuddy-ai', 'workbuddy-global', 'xdpool', 'xdpool-global'])
  assert.deepEqual(PLAN_PROVIDER_ALIASES.antigravity, ['antigravity'])
  assert.deepEqual(PLAN_PROVIDER_ALIASES.stepfun, ['stepfun', 'step-code'])

  // ---------- 3. ensureChatgptSubscriptionPlan:归类、尊重显式、幂等、no-op ----------
  const baseLedger = fakeLedger()
  const firstResult = ensureChatgptSubscriptionPlan(baseLedger, installedDetection())
  assert.deepEqual(firstResult, { changed: true, planIds: W1_PLAN_IDS }, '首次归类全部 9 个 planId')
  assert.equal(baseLedger.writes, 1, '只 scheduleWrite 一次')
  for (const [providerId, planId] of Object.entries(W1_EXPECTED)) {
    assert.equal(baseLedger.config.planBilling.providers[planId], 'plan', planId + ' 写成 plan')
    assert.equal(
      billingClassOf(providerId, W1_MODELS[providerId], baseLedger.config.planBilling, enabledPlanSetOf(baseLedger.config), baseLedger.config.prices),
      'plan',
      providerId + ' 归类后归 Plan',
    )
  }
  assert.equal(baseLedger.config.planBilling.providers.go, 'auto', '其他 Plan 提供商配置不受影响')

  const explicit = fakeLedger({ planBilling: { providers: { codex: 'api', anthropic: 'plan', workbuddy: 'api' } } })
  const explicitResult = ensureChatgptSubscriptionPlan(explicit, installedDetection())
  assert.deepEqual(
    explicitResult.planIds,
    W1_PLAN_IDS.filter(id => !['codex', 'anthropic', 'workbuddy'].includes(id)),
    '显式 plan/api 不覆盖且不计入 planIds',
  )
  assert.equal(explicitResult.changed, true)
  assert.equal(explicit.config.planBilling.providers.codex, 'api', '显式 api 保留')
  assert.equal(explicit.config.planBilling.providers.anthropic, 'plan', '显式 plan 保留')
  assert.equal(explicit.config.planBilling.providers.workbuddy, 'api', '显式 api 保留(新家族)')
  assert.equal(
    billingClassOf('codex-chatgpt', W1_MODELS['codex-chatgpt'], explicit.config.planBilling, enabledPlanSetOf(explicit.config), explicit.config.prices),
    'api',
    '显式 api 的线路仍归 API',
  )
  assert.equal(explicit.writes, 1, '有改动时 scheduleWrite 一次')
  const secondResult = ensureChatgptSubscriptionPlan(explicit, installedDetection())
  assert.deepEqual(secondResult, { changed: false, planIds: [] }, '重复调用幂等')
  assert.equal(explicit.writes, 1, '幂等不重复落盘')

  const allAssigned = fakeLedger({
    planBilling: {
      providers: Object.fromEntries(W1_PLAN_IDS.map((id, index) => [id, index % 2 === 0 ? 'plan' : 'api'])),
    },
  })
  assert.deepEqual(ensureChatgptSubscriptionPlan(allAssigned, installedDetection()), { changed: false, planIds: [] }, '全部已显式配置时不改动')
  assert.equal(allAssigned.writes, 0)

  for (const detection of [NOT_INSTALLED, null, undefined, { installed: false, version: '9.9.9', detection: 'none', packagePath: '' }]) {
    const untouched = fakeLedger()
    const before = structuredClone(untouched.config)
    assert.deepEqual(ensureChatgptSubscriptionPlan(untouched, detection), { changed: false, planIds: [] }, '未安装 no-op')
    assert.deepEqual(untouched.config, before, '未安装不改 config')
    assert.equal(untouched.writes, 0, '未安装不落盘')
  }

  // providers 缺失时新建;planBilling 缺失/非法时安全 no-op。
  const missingProviders = fakeLedger({ planBilling: {} })
  assert.equal(ensureChatgptSubscriptionPlan(missingProviders, installedDetection()).changed, true)
  assert.equal(missingProviders.config.planBilling.providers.codex, 'plan')
  const nullBilling = { config: { planBilling: null }, writes: 0, scheduleWrite() { this.writes += 1 } }
  assert.deepEqual(ensureChatgptSubscriptionPlan(nullBilling, installedDetection()), { changed: false, planIds: [] })
  assert.equal(nullBilling.writes, 0)
  const noConfig = { writes: 0, scheduleWrite() { this.writes += 1 } }
  assert.deepEqual(ensureChatgptSubscriptionPlan(noConfig, installedDetection()), { changed: false, planIds: [] })
  assert.deepEqual(ensureChatgptSubscriptionPlan(null, installedDetection()), { changed: false, planIds: [] }, '空账本不抛错')

  // ---------- 4. store 清洗/校验/持久化回读 ----------
  const defaults = sanitizeConfig({})
  for (const id of ['workbuddy', 'antigravity', 'stepfun']) {
    assert.equal(defaults.planBilling.providers[id], 'auto', '默认 auto: ' + id)
  }
  const kept = sanitizeConfig({
    planBilling: { providers: { workbuddy: 'plan', antigravity: 'api', stepfun: 'plan', codex: 'api' } },
  })
  assert.equal(kept.planBilling.providers.workbuddy, 'plan')
  assert.equal(kept.planBilling.providers.antigravity, 'api')
  assert.equal(kept.planBilling.providers.stepfun, 'plan')
  assert.equal(kept.planBilling.providers.codex, 'api')
  const fallback = sanitizeConfig({ planBilling: { providers: { workbuddy: 'nope', antigravity: 42, stepfun: null } } })
  assert.equal(fallback.planBilling.providers.workbuddy, 'auto', '非法值回落默认 auto')
  assert.equal(fallback.planBilling.providers.antigravity, 'auto')
  assert.equal(fallback.planBilling.providers.stepfun, 'auto')

  const validPatch = applyConfigPatch(defaults, { planBilling: { providers: { workbuddy: 'plan', antigravity: 'plan', stepfun: 'plan' } } })
  assert.deepEqual(validPatch.errors, [], '新家族 id 的合法补丁被接受')
  assert.equal(validPatch.config.planBilling.providers.workbuddy, 'plan')
  assert.equal(validPatch.config.planBilling.providers.antigravity, 'plan')
  assert.equal(validPatch.config.planBilling.providers.stepfun, 'plan')
  const invalidPatch = applyConfigPatch(defaults, { planBilling: { providers: { workbuddy: 'sub' } } })
  assert.ok(invalidPatch.errors.length > 0, '非法分类值报错')
  assert.ok(invalidPatch.errors.some(message => String(message).includes('workbuddy')), '错误消息包含键名')

  // 真 Ledger 落盘 → 回读:新 id 配置不得丢失。
  const storage = join(root, 'storage')
  mkdirSync(storage, { recursive: true })
  const ledgerPath = join(storage, 'ledger.json')
  const seedConfig = sanitizeConfig({
    planBilling: { providers: { workbuddy: 'plan', antigravity: 'plan', stepfun: 'plan' } },
  })
  const seed = new Ledger(seedConfig, {}, ledgerPath)
  seed.scheduleWrite()
  seed.close()
  const storedRaw = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  for (const id of ['workbuddy', 'antigravity', 'stepfun']) {
    assert.equal(storedRaw.config.planBilling.providers[id], 'plan', '落盘保留 ' + id)
  }
  const reloaded = Ledger.load(ledgerPath)
  for (const id of ['workbuddy', 'antigravity', 'stepfun']) {
    assert.equal(reloaded.config.planBilling.providers[id], 'plan', '回读保留 ' + id)
  }
  reloaded.close()

  // ensure 直接作用在真 Ledger 上并落盘回读。
  const livePath = join(root, 'live', 'ledger.json')
  mkdirSync(join(root, 'live'), { recursive: true })
  const live = new Ledger(sanitizeConfig({}), {}, livePath)
  assert.equal(ensureChatgptSubscriptionPlan(live, installedDetection()).changed, true)
  live.scheduleWrite()
  live.close()
  const liveStored = JSON.parse(readFileSync(livePath, 'utf8'))
  for (const planId of W1_PLAN_IDS) {
    assert.equal(liveStored.config.planBilling.providers[planId], 'plan', 'ensure 落盘回读 ' + planId)
  }

  // ---------- 5. apply() 集成:检测到插件时启动归类(临时 DSH_HOME + fake ctx) ----------
  const previousHome = process.env.DSH_HOME
  const previousProfileDir = process.env.DSH_PROFILE_DIR
  try {
    delete process.env.DSH_PROFILE_DIR
    const home = join(root, 'service-home')
    writeScopedPackage(join(home, 'profiles', 'default', 'node_modules'), '0.26.1')
    mkdirSync(join(home, 'storages', 'cost-meter'), { recursive: true })
    process.env.DSH_HOME = home
    const disposers = []
    let service
    apply({
      on: () => () => {},
      inject() {},
      get: name => name === 'settings' ? { get: () => ({}) } : undefined,
      effect: fn => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
      provide: (name, value) => { if (name === 'costMeter') service = value },
      logger: console,
    })
    assert.ok(service, 'fake ctx 应注册 costMeter service')
    try {
      const state = await service.getState()
      for (const [providerId, planId] of Object.entries(W1_EXPECTED)) {
        assert.equal(state.config.planBilling.providers[planId], 'plan', '启动归类落 state: ' + planId)
        assert.equal(
          billingClassOf(providerId, W1_MODELS[providerId], state.config.planBilling, enabledPlanSetOf(state.config), state.config.prices),
          'plan',
          '启动后 state 中 ' + providerId + ' 归 Plan',
        )
      }
      assert.equal(state.config.planBilling.providers.go, 'auto', '其他提供商保持默认')
    } finally {
      for (const dispose of disposers.reverse()) await dispose()
    }
    const storedHome = JSON.parse(readFileSync(join(home, 'storages', 'cost-meter', 'ledger.json'), 'utf8'))
    for (const planId of W1_PLAN_IDS) {
      assert.equal(storedHome.config.planBilling.providers[planId], 'plan', '启动归类已落盘: ' + planId)
    }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    if (previousProfileDir === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfileDir
  }
} finally {
  rmSync(root, { recursive: true, force: true })
}
console.log('[ok] dsh-chatgpt-subscription 兼容:scoped 检测三态、9 条订阅线路映射与 Plan 归类、显式配置不覆盖、幂等、store 清洗回读、apply 集成')
