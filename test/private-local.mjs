import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChildProcess } from 'node:child_process'
import { channel } from 'node:diagnostics_channel'

const scratch = mkdtempSync(join(tmpdir(), 'dsh-cost-private-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = scratch
const originalFetch = globalThis.fetch
const originalSpawn = ChildProcess.prototype.spawn
const requests = [], credentials = [], effects = [], listeners = new Map(), services = new Map()
const modelReads = []
const channels = ['undici:request:create', 'undici:request:headers', 'undici:request:error', 'undici:request:trailers']
const subscriptions = () => channels.map(name => channel(name).hasSubscribers)
const originalSubscriptions = subscriptions()
const fetchTrap = async (...args) => { requests.push(args[0]); throw new Error('Unexpected network request') }
globalThis.fetch = fetchTrap
const ctx = {
  get(name) {
    if (name === 'credentials') return {
      async describe(ref) { credentials.push(ref); return { configured: true, source: 'test' } },
      async get(ref) { credentials.push(ref); return 'PRIVATE_TEST_KEY' },
      async resolve(ref) { credentials.push(ref); return { value: 'PRIVATE_TEST_KEY' } },
    }
    if (name === 'llm') return {
      listConfigurableProviders() { modelReads.push('providers'); return [] },
      async listModels() { modelReads.push('models'); return [] },
    }
    return services.get(name)
  },
  on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name) },
  effect(run) { const stop = run(); if (typeof stop === 'function') effects.push(stop) },
  inject() { return () => {} },
  provide(name, service) { services.set(name, service) },
}
try {
  const { defaultConfig } = await import('../lib/store.js')
  const config = defaultConfig()
  assert.equal(config.balance.display, 'off')
  assert.equal(config.goQuota.enabled, false)
  assert.equal(config.exchangeRateAuto, false)
  const { apply } = await import('../lib/bootstrap.js')
  apply(ctx)
  assert.equal(ChildProcess.prototype.spawn, originalSpawn, 'startup must not hook child processes')
  const service = services.get('costMeter')
  assert.ok(service, 'cost service is available')
  const state = await service.getState()
  assert.ok(state.today)
  assert.equal(state.config.balance.display, 'off')
  assert.equal(state.config.goQuota.enabled, false)
  await service.updateConfig({
    queryAccounts: { balance: { selected: 'default', accounts: [{ id: 'a-fixture', label: '隔离账号' }] } },
    priceOverrides: { 'private-test:test-model': '__custom__' },
    prices: { custom: { 'private-test:test-model': { cacheMiss: 2, cacheHit: .2, output: 4, currency: 'USD' } } },
  })
  const usage = { type: 'usage', usage: { inputTokens: 1_000_000, outputTokens: 500_000 } }
  const stream = listeners.get('llm/stream')(
    { provider: 'private-test', model: 'test-model', sessionId: 'private-fixture' },
    async function* () { yield usage },
  )
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  assert.deepEqual(chunks, [usage], 'billing preserves the original model stream')
  const billed = await service.getState()
  assert.equal(billed.config.queryAccounts.balance.accounts.length, 1)
  assert.equal(billed.total.input, 1_000_000)
  assert.equal(billed.total.output, 500_000)
  assert.equal(billed.total.cost, 4, 'usage is priced from the explicit gateway rates')
  await new Promise(resolve => setTimeout(resolve, 5500))
  await service.getState()
  listeners.get('llm/adapters-updated')?.()
  listeners.get('settings/document-updated')?.('llm-deepseek')
  await service.getState()
  assert.deepEqual(requests, [], 'startup and first panel do not query remote providers')
  assert.deepEqual(credentials, [], 'disabled quota panels do not discover credentials')
  assert.deepEqual(modelReads, [], 'disabled balances and state reads do not discover model routes')
  assert.equal(ChildProcess.prototype.spawn, originalSpawn)
  assert.equal(globalThis.fetch, fetchTrap, 'plugin does not wrap global fetch')
  assert.deepEqual(subscriptions(), originalSubscriptions, 'plugin does not install global Undici observers')
  console.log('private local billing: startup/state do not contact providers or inspect credentials')
} finally {
  for (const stop of effects.reverse()) await stop()
  globalThis.fetch = originalFetch
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  rmSync(scratch, { recursive: true, force: true })
}
