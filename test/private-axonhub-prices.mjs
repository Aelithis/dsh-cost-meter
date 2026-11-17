import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sanitizeConfig, applyConfigPatch } from '../lib/store.js'
import { providerPriceEntryFor, costOf } from '../lib/pricing.js'
import { stateSchema } from '../lib/typert.host.js'

// Only the delivered price table is copied into this fixture; no profile or credential is read.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/private-axonhub-prices.json', import.meta.url), 'utf8'))
const applied = applyConfigPatch(sanitizeConfig({}), fixture)
assert.deepEqual(applied.errors, [])
const config = applied.config
stateSchema.shape.config.parse(config)
assert.equal(Object.keys(config.priceOverrides).length, 17)
assert.equal(config.currency, 'USD')
assert.equal(config.exchangeRate, 1)
assert.equal(config.includeSubagentCost, true)
const source = readFileSync(new URL('../src/client/02-validators-helpers-sidebar.js', import.meta.url), 'utf8')
const start = source.indexOf('function priceEntryFor(modelId, table)'), end = source.indexOf('function makeStore(initial,')
const client = new Function(source.slice(start, end) + '\nreturn { resolveClientPrice }')()
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
let zeroModels = 0, longModels = 0
for (const [key, target] of Object.entries(config.priceOverrides)) {
  const [provider, model] = key.split(':')
  const [targetProvider, targetModel] = target.split(':')
  assert.equal(targetProvider, 'axonhub-usd')
  const quote = fixture.prices.providers[targetProvider].models[targetModel]
  const server = providerPriceEntryFor(provider, model, config.prices, { overrides: config.priceOverrides })
  const browser = client.resolveClientPrice(provider, model, config)
  for (const result of [server, browser]) {
    assert.equal(result.priced, true, key)
    assert.equal(result.billingMode, 'flat', key)
    for (const field of ['cacheMiss', 'cacheHit', 'cacheWrite', 'output']) assert.equal(result.entry[field], quote[field], `${key}:${field}`)
    const buckets = { input: 100, cacheRead: 200, cacheWrite: 300, output: 400 }
    near(costOf(buckets, result.entry), (100 * quote.cacheMiss + 200 * quote.cacheHit + 300 * quote.cacheWrite + 400 * quote.output) / 1e6)
    if (quote.longContext) {
      assert.equal(result.entry.longContext.aboveInputTokens, 272000)
      for (const total of [271999, 272000, 272001]) {
        const tokens = { input: 1, cacheRead: total - 2, cacheWrite: 1, output: 10 }
        const tier = total > 272000 ? quote.longContext : quote
        near(costOf(tokens, result.entry), (tier.cacheMiss + (total - 2) * tier.cacheHit + tier.cacheWrite + 10 * tier.output) / 1e6)
      }
    }
  }
  if (quote.longContext) longModels++
  if (quote.cacheMiss === 0 && quote.output === 0) zeroModels++
}
assert.equal(longModels, 3)
assert.equal(zeroModels, 3)
assert.deepEqual(config.priceOverrides, fixture.priceOverrides)
assert.deepEqual(config.prices.providers['axonhub-usd'], fixture.prices.providers['axonhub-usd'])
console.log('private AxonHub: 17 explicit server/client prices, 3 long-context boundaries and 3 zero-price models passed')
