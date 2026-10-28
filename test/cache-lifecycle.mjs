import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate as tick, setTimeout as wait } from 'node:timers/promises'
import { apply } from '../lib/index.js'
import { stateSchema } from '../lib/typert.host.js'
import { GATEWAY_MANAGEMENT_PATHS, managementKeyVarOf } from '../lib/gateway-quotas.js'
import { queryCustomBalance } from '../lib/custom-balance.js'

const failures = []
const check = async (name, run) => {
  try { await run(); console.log('[ok]', name) }
  catch (error) { failures.push(error); console.error('[fail]', name, error.message) }
}
const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const until = async predicate => {
  // Local snapshots include asynchronous filesystem reads. A fixed number
  // of setImmediate spins can expire in milliseconds before that I/O settles.
  // The request gate stays blocked, so this still fails if local state waits
  // for the network; only the scheduling budget is wall-clock based.
  const deadline = performance.now() + 2000
  while (performance.now() < deadline) { if (predicate()) return; await wait(1) }
  throw new Error('fixture did not reach the expected request')
}
const fixture = async (config, fetchImpl, run) => {
  const root = mkdtempSync(join(tmpdir(), 'cm-cache-'))
  const previousHome = process.env.DSH_HOME, previousFetch = globalThis.fetch
  const cleanups = []
  let api
  const dispose = async () => { for (const fn of cleanups.splice(0).reverse()) await fn() }
  try {
    const dir = join(root, 'storages', 'cost-meter')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'ledger.json'), JSON.stringify({ version: 1, days: {}, config: {
      locale: 'en', balance: { display: 'off' }, goQuota: { enabled: false }, ...config,
    } }))
    process.env.DSH_HOME = root
    globalThis.fetch = fetchImpl
    apply({ on: () => () => {}, inject() {}, logger: { info() {}, warn() {}, error() {} },
      get: name => name === 'credentials' ? {
        describe: async () => ({ configured: true, source: 'env' }),
        resolve: async () => ({ value: 'TEST_CACHE_KEY' }), set: async () => {}, unset: async () => {},
      } : undefined,
      effect: fn => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
      provide: (name, service) => { if (name === 'costMeter') api = service },
    })
    await run(api, dispose)
  } finally {
    await dispose()
    globalThis.fetch = previousFetch
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(root, { recursive: true, force: true })
  }
}

const gateway = { id: 'test', type: 'cliproxyapi', baseURL: 'http://127.0.0.1:8317', enabled: true,
  display: 'both', refreshMinutes: 15, includeProviders: ['claude'] }
const gatewayConfig = { gatewayQuotas: { sources: [gateway] } }
const gatewayPayload = percent => ({ status_code: 200, body: JSON.stringify({ five_hour: { utilization: percent } }) })
const gatewayResponse = (url, percent) => Response.json(new URL(url).pathname === GATEWAY_MANAGEMENT_PATHS.authFiles
  ? { auth_files: [{ auth_index: 'test', provider: 'claude' }] } : gatewayPayload(percent))

await check('首屏本地数据不等待冷额度请求，普通读取随后补齐且不重复查询', async () => {
  const gate = deferred()
  let calls = 0, painted = false
  await fixture(gatewayConfig, async url => { calls++; await gate.promise; return gatewayResponse(url, 15) }, async api => {
    const immediate = api.getLocalState().then(state => { stateSchema.parse(state); painted = true; return state })
    let complete
    try {
      await until(() => painted)
      assert.equal(painted, true, '本地统计先显示，网络仍被 fixture 阻塞')
      assert.equal((await immediate).gatewayQuotas[0].status, 'loading', '未返回的额度不伪装为实际零用量')
      complete = api.getState()
    } finally { gate.resolve() }
    assert.equal((await complete).gatewayQuotas[0].status, 'ok')
    assert.equal(calls, 2, '仅一次发现和一次额度读取，两次状态请求共享任务')
  })
})

await check('本地显示设置保存不等待无关的冷额度请求', async () => {
  const gate = deferred()
  let saved = false, calls = 0
  await fixture(gatewayConfig, async url => { calls++; await gate.promise; return gatewayResponse(url, 25) }, async api => {
    const pending = api.updateConfig({ decimals: 4 }).then(state => { saved = true; return state })
    try {
      await until(() => saved)
      const local = await pending
      assert.equal(local.config.decimals, 4)
      assert.equal(local.gatewayQuotas[0].status, 'loading')
    } finally { gate.resolve() }
    assert.equal((await api.getState()).gatewayQuotas[0].status, 'ok')
    assert.equal(calls, 2, '保存与状态更新合并原有额度请求')
  })
})

await check('网关缓存复用与失败时保留上次成功额度', () => {
  let calls = 0, fail = false
  return fixture(gatewayConfig, async url => { calls++; return fail ? new Response('', { status: 401 }) : gatewayResponse(url, 42) }, async api => {
    const first = await api.getState()
    assert.equal(first.gatewayQuotas[0].status, 'ok')
    const warmCalls = calls
    await api.getState(); await api.getState()
    assert.equal(calls, warmCalls, '有效缓存期间不重复访问网关')
    await api.updateConfig({ decimals: 3 })
    assert.equal(calls, warmCalls, '无关设置不清除额度缓存')
    fail = true
    const result = await api.refreshGatewayQuota('test')
    assert.equal(result.state.gatewayQuotas[0].status, 'stale')
    assert.deepEqual(result.state.gatewayQuotas[0].accounts, first.gatewayQuotas[0].accounts)
    stateSchema.parse(result.state)
  })
})

await check('网关首次并发读取共享在途请求', async () => {
  const gate = deferred()
  let calls = 0
  await fixture(gatewayConfig, async url => { calls++; await gate.promise; return gatewayResponse(url, 15) }, async api => {
    const pending = [api.getState(), api.getState(), api.getState()]
    try { await until(() => calls > 0); await tick() }
    finally { gate.resolve() }
    const states = await Promise.all(pending)
    assert.equal(calls, 2, '三次状态读取只发一次发现和一次额度请求')
    for (const state of states) assert.equal(state.gatewayQuotas[0].status, 'ok')
  })
})

const row = (label, path = label) => ({ enabled: true, label, display: 'both', refreshMinutes: 15,
  request: { url: 'http://127.0.0.1/' + path, headers: {} }, extract: { remaining: 'balance' } })

for (const action of ['disable', 'remove', 'replace-key', 'clear-key', 'dispose']) {
  await check(`网关 ${action} 取消旧请求并阻止继续查询账号`, async () => {
    const gate = deferred(); let signal, calls = 0
    await fixture(gatewayConfig, async (url, init) => {
      signal ??= init.signal; calls++
      await gate.promise
      return gatewayResponse(url, 15)
    }, async (api, dispose) => {
      const pending = api.getState(); let mutation
      try {
        await until(() => signal)
        const configured = (await api.getLocalState()).config.gatewayQuotas.sources[0]
        if (action === 'disable') mutation = api.updateConfig({ gatewayQuotas: { sources: [{ ...configured, enabled: false }] } })
        else if (action === 'remove') mutation = api.updateConfig({ gatewayQuotas: { sources: [] } })
        else if (action === 'replace-key') mutation = api.setCredential('customVar:' + managementKeyVarOf(gateway), 'REPLACEMENT_TEST_KEY')
        else if (action === 'clear-key') mutation = api.clearCredential('customVar:' + managementKeyVarOf(gateway))
        else mutation = dispose()
        mutation.catch(() => {})
        await until(() => signal.aborted)
      } finally { gate.resolve(); await Promise.all([pending, mutation]) }
      if (['disable', 'remove', 'dispose'].includes(action)) assert.equal(calls, 1, '旧来源停止后不再发出账号查询')
    })
  })
}
await check('官方余额关闭后立即重新显示，无需重启或等待刷新间隔', async () => {
  let calls = 0
  const config = { balance: { display: 'both', refreshMinutes: 60, reconcile: false } }
  await fixture(config, async () => {
    calls++
    return Response.json({ balance_infos: [{ currency: 'CNY', total_balance: '82.5593', granted_balance: '2', topped_up_balance: '80.5593' }] })
  }, async api => {
    const initial = await api.getState()
    assert.equal(initial.balance.status, 'ok')
    assert.equal(calls, 1)
    await api.updateConfig({ balance: { ...initial.config.balance, display: 'off' }, hideOfficialBalance: true })
    const disabled = await api.getState()
    assert.equal(disabled.balance.status, 'off')
    assert.equal(calls, 1, '关闭不查询余额')
    const restored = await api.updateConfig({ balance: { ...disabled.config.balance, display: 'both' }, hideOfficialBalance: false })
    assert.equal(restored.balance.status, 'ok', '恢复显示的保存结果必须带回真实余额，不能保留刚写入的 off 缓存')
    assert.equal(restored.balance.totalBalance, 82.5593)
    assert.equal(calls, 2)
    await api.updateConfig({ balance: { ...restored.config.balance, display: 'sidebar' } })
    await api.getState()
    assert.equal(calls, 2, '只改变可见位置沿用有效缓存')
    stateSchema.parse(restored)
  })
})
await check('自定义余额首次硬失败可重试，恢复后遵守缓存间隔', () => {
  let calls = 0
  return fixture({ customBalances: [row('a')] }, async () => {
    calls++
    return calls === 1 ? new Response('', { status: 500 }) : Response.json({ balance: 25 })
  }, async api => {
    assert.equal((await api.getState()).customBalances[0].status, 'error')
    assert.equal((await api.getState()).customBalances[0].remaining, 25)
    await api.getState()
    assert.equal(calls, 2)
  })
})

await check('自定义余额修改配置、交换条目和禁用时更新缓存', () => {
  const calls = []
  return fixture({ customBalances: [row('a'), row('b')] }, async url => {
    calls.push(url)
    return Response.json({ balance: url.endsWith('/a') ? 10 : 20 })
  }, async api => {
    await api.getState()
    await api.updateConfig({ customBalances: [row('b'), row('a')] })
    let state = await api.getState()
    assert.deepEqual(state.customBalances.map(entry => [entry.label, entry.remaining]), [['b', 20], ['a', 10]])
    await api.updateConfig({ customBalances: [{ ...row('b'), enabled: false }, row('a')] })
    state = await api.getState()
    assert.equal(state.customBalances[0].status, 'off', '其他条目开启时也清空已关闭条目的余额')
    const warmCalls = calls.length
    await api.getState()
    assert.equal(calls.length, warmCalls)
    stateSchema.parse(state)
  })
})

await check('自定义余额配置切换取消旧请求并拒绝迟到结果', async () => {
  const gate = deferred()
  let block = false, oldSignal, started = false
  await fixture({ customBalances: [row('a')] }, async (url, init) => {
    if (block && url.endsWith('/a')) { oldSignal = init.signal; started = true; await gate.promise }
    return Response.json({ balance: url.endsWith('/a') ? 99 : 20 })
  }, async api => {
    await api.getState()
    block = true
    const pending = api.refreshCustomBalance(0)
    let cancelled
    try {
      await until(() => started)
      await api.updateConfig({ customBalances: [row('b')] })
      cancelled = oldSignal.aborted
    } finally { gate.resolve(); await pending }
    assert.equal((await api.getState()).customBalances[0].remaining, 20, '旧地址返回的 99 不能覆盖新地址的 20')
    assert.equal(cancelled, true, '取消已失效的网络请求')
  })
})

await check('自定义余额卸载时取消在途请求', async () => {
  const gate = deferred()
  let signal
  await fixture({ customBalances: [row('a')] }, async (_url, init) => {
    signal = init.signal; await gate.promise; return Response.json({ balance: 10 })
  }, async (api, dispose) => {
    const pending = api.getState()
    try { await until(() => signal); await dispose() }
    finally { gate.resolve(); await pending }
    assert.equal(signal.aborted, true)
  })
})

for (const kind of ['balance', 'goQuota', 'anthropic']) {
  await check(`${kind} 关闭查询时取消旧请求且忽略迟到结果`, async () => {
    const gate = deferred()
    let signal, block = false
    const config = kind === 'balance' ? { balance: { display: 'both' } }
      : kind === 'goQuota' ? { goQuota: { enabled: true } } : { codingPlans: { anthropic: { enabled: true } } }
    const payload = kind === 'balance' ? { balance_infos: [{ currency: 'USD', total_balance: '10', granted_balance: '0', topped_up_balance: '10' }] }
      : kind === 'goQuota' ? { usage: { rolling: { used: 2, limit: 10 } } } : { five_hour: { utilization: 30 } }
    const disabled = kind === 'balance' ? { balance: { display: 'off' } }
      : kind === 'goQuota' ? { goQuota: { enabled: false } } : { codingPlans: { anthropic: { enabled: false } } }
    await fixture(config, async (_url, init) => {
      if (block) { signal = init.signal; await gate.promise }
      return Response.json(payload)
    }, async api => {
      await api.getState()
      block = true
      const pending = kind === 'balance' ? api.refreshBalance() : kind === 'goQuota' ? api.refreshGoQuota() : api.refreshCodingPlan(kind)
      let cancelled
      try {
        await until(() => signal)
        await api.updateConfig(disabled)
        cancelled = signal.aborted
      } finally { gate.resolve(); await pending }
      const state = await api.getState()
      assert.equal((kind === 'anthropic' ? state.codingPlans.anthropic : state[kind]).status, 'off')
      assert.equal(cancelled, true)
    })
  })
}

await check('更新订阅凭据立即作废缓存', () => {
  let calls = 0
  return fixture({ codingPlans: { anthropic: { enabled: true } } }, async () => {
    calls++; return Response.json({ five_hour: { utilization: 10 * calls } })
  }, async api => {
    assert.equal((await api.getState()).codingPlans.anthropic.status, 'ok')
    const initialCalls = calls
    await api.setCredential('codingPlans.anthropic', 'REPLACEMENT_TEST_KEY')
    await api.getState()
    assert.equal(calls, initialCalls + 1)
    await api.clearCredential('codingPlans.anthropic')
    await api.getState()
    assert.equal(calls, initialCalls + 2)
  })
})

await check('自定义余额重定向释放响应流', async () => {
  let cancelled = false
  await fixture({}, async () => new Response(new ReadableStream({ cancel() { cancelled = true } }), { status: 302 }), async () => {
    await assert.rejects(queryCustomBalance({ get: () => undefined }, { customBalance: row('a') }), /redirected/)
    assert.equal(cancelled, true)
  })
})

// #409: rejection must not turn UI polling or queued refresh clicks into an HTTP loop.
for (const kind of ['official', 'custom']) {
  const config = kind === 'official'
    ? { balance: { display: 'both', refreshMinutes: 1, reconcile: false } }
    : { customBalances: [{ ...row('limited'), refreshMinutes: 1 }] }
  const refresh = api => kind === 'official' ? api.refreshBalance() : api.refreshCustomBalance(0)
  const value = state => kind === 'official' ? state.balance : state.customBalances[0]
  const success = () => kind === 'official'
    ? Response.json({ balance_infos: [{ currency: 'USD', total_balance: '25' }] })
    : Response.json({ balance: 25 })
  for (const status of [401, 403]) {
    await check(`${kind} HTTP ${status} 自动查询等待间隔，手动刷新可恢复`, async () => {
      let calls = 0
      await fixture(config, async () => ++calls === 1 ? new Response('private upstream body', { status }) : success(), async api => {
        const first = await api.getState()
        assert.equal(value(first).status, 'error')
        assert.ok(!JSON.stringify(first).includes('private upstream body'))
        await api.getState(); await api.getState()
        assert.equal(calls, 1)
        assert.equal((await refresh(api)).ok, true)
        assert.equal(calls, 2)
      })
    })
  }
  for (const header of ['900', 'date', 'invalid', '']) {
    await check(`${kind} HTTP 429 遵守 ${header || '缺省'} Retry-After，包括并发手动刷新`, async () => {
      const originalNow = Date.now
      let now = Date.UTC(2026, 9, 26), calls = 0
      const gate = deferred(), delay = ['900', 'date'].includes(header) ? 900_000 : 60_000
      const retryAfter = header === 'date' ? new Date(now + delay).toUTCString() : header
      Date.now = () => now
      try {
        await fixture(config, async () => {
          calls++
          if (calls > 1) return success()
          await gate.promise
          return new Response('private upstream body', { status: 429, headers: { 'Retry-After': retryAfter } })
        }, async api => {
          const initial = api.getState()
          await until(() => calls === 1)
          const queued = [refresh(api), refresh(api)]
          await tick()
          gate.resolve()
          const states = await Promise.all([initial, ...queued])
          assert.equal(value(states[0]).status, 'error')
          assert.equal(calls, 1, 'queued clicks must observe the rejection from the first request')
          await api.updateConfig({ decimals: 3 })
          now += delay - 1
          await api.getState()
          assert.equal((await refresh(api)).ok, false)
          assert.equal(calls, 1, 'manual refresh and unrelated settings cannot bypass the wait')
          now++
          assert.equal((await refresh(api)).ok, true)
          assert.equal(calls, 2)
          stateSchema.parse(await api.getState())
        })
      } finally { gate.resolve(); Date.now = originalNow }
    })
  }
  await check(`${kind} 429 后换用新凭据或新端点时清除旧等待状态`, async () => {
    let calls = 0
    await fixture(config, async () => ++calls === 1 ? new Response('', { status: 429 }) : success(), async api => {
      await api.getState()
      if (kind === 'official') await api.setCredential('balance', 'TEST_NEW_BALANCE_KEY')
      else await api.updateConfig({ customBalances: [{ ...row('replacement'), refreshMinutes: 1 }] })
      await api.getState()
      assert.equal(calls, 2)
    })
  })
}

if (failures.length) throw new AggregateError(failures, `${failures.length} cache lifecycle regressions`)
