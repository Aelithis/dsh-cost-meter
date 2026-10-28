import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apply } from '../lib/index.js'
import { Ledger, sanitizeConfig, applyConfigPatch } from '../lib/store.js'
import { DEFAULT_PRICE_TABLE, DEFAULT_PRICE_TABLE_CNY, providerPriceEntryFor, costOf, usdFromCost } from '../lib/pricing.js'
import { pricingConfigAt } from '../lib/billing-history.js'

// Synthetic public rates only. No account, conversation or exported billing data.
const at = Date.parse('2026-10-20T16:00:00Z'), fx = 6.7
const root = mkdtempSync(join(tmpdir(), 'cm-official-currency-'))
const oldFetch = globalThis.fetch, oldOpen = Ledger.open, oldHome = process.env.DSH_HOME
const table = currency => structuredClone(currency === 'CNY' ? DEFAULT_PRICE_TABLE_CNY : DEFAULT_PRICE_TABLE)
const quote = (config, model = 'deepseek-v4-pro') => {
  const resolved = providerPriceEntryFor('deepseek-account', model, config.prices)
  return usdFromCost(costOf({ input: 1e6 }, resolved.entry, at), resolved.currency, fx) * fx
}
const html = (currency, complete) => {
  const models = ['deepseek-flash', ...(complete ? ['deepseek-v4-pro'] : [])], prices = table(currency)
  const money = value => currency === 'CNY' ? `${value}元` : `$${value}`
  return '<table><tr><th>MODEL</th>' + models.map(id => `<th>${id}</th>`).join('') + '</tr>'
    + [['CACHE HIT', 'cacheHit'], ['CACHE MISS', 'cacheMiss'], ['OUTPUT TOKENS', 'output']].map(([label, key]) =>
      ['offPeak', 'peak'].map((tier, index) => `<tr><td>${label}</td><td>${index ? 'PEAK' : 'OFF-PEAK'}</td>`
        + models.map(id => `<td>${money(prices.models[id][tier][key])}</td>`).join('') + '</tr>').join('')).join('')
    + '</table><!--' + 'synthetic pricing fixture '.repeat(30) + '-->'
}

try {
  for (const [from, to] of [['CNY', 'USD'], ['USD', 'CNY']]) {
    const config = sanitizeConfig({ exchangeRate: fx, exchangeRateAuto: false, prices: { ...table(from), currency: from } })
    const original = JSON.stringify(config)
    for (const patch of [
      { currency: to }, { currency: to, models: table(to).models },
      { currency: to, default: table(to).default },
      { currency: to, models: table(to).models, default: { input: 1 } },
    ]) {
      const result = applyConfigPatch(config, { prices: patch })
      assert.ok(result.errors.length, 'a currency-only or incomplete patch must not relabel existing prices')
      assert.equal(result.config, config)
      assert.equal(JSON.stringify(config), original, 'rejection cannot mutate caller configuration')
    }
    const explicit = applyConfigPatch(config, { prices: { ...table(to), currency: to } })
    assert.deepEqual(explicit.errors, [], 'a complete explicit replacement table is allowed')
    assert.equal(quote(explicit.config), to === 'CNY' ? 4.5 : .66 * fx)
    const custom = applyConfigPatch(config, { prices: { currency: to, models: { 'deepseek-v4-pro': { cacheMiss: 3, cacheHit: .1, output: 9 } }, default: { cacheMiss: 2, cacheHit: .1, output: 8 } } })
    assert.deepEqual(custom.errors, [], 'explicit custom rates and intended model removals remain supported')
    assert.deepEqual(Object.keys(custom.config.prices.models), ['deepseek-v4-pro'])
    assert.equal(quote(custom.config), to === 'CNY' ? 3 : 3 * fx)
    const preference = applyConfigPatch(config, { pricingCurrency: to })
    assert.deepEqual(preference.errors, [], 'desired official-sync currency is independent of current price units')
    assert.equal(quote(preference.config), quote(config))
  }
  for (const [from, to, complete, fallback] of [
    ['CNY', 'USD', false, false], ['USD', 'CNY', false, false],
    ['CNY', 'USD', true, false], ['USD', 'CNY', true, false],
    ['CNY', 'CNY', false, false], ['USD', 'USD', false, false],
    ['CNY', 'USD', false, true],
  ]) {
    const cleanups = [], path = join(root, `${from}-${to}-${complete}-${fallback}`, 'ledger.json')
    process.env.DSH_HOME = join(root, 'home')
    const prices = { ...table(from), currency: from }
    prices.models['deepseek-flash'].multiplier = 1.5
    prices.default.multiplier = 2
    const ledger = new Ledger(sanitizeConfig({ locale: 'en', legacyAutoImportedAt: 1,
      currency: 'CNY', exchangeRate: fx, exchangeRateAuto: false,
      hideOfficialBalance: true, balance: { display: 'off' }, goQuota: { enabled: false },
      pricingCurrency: fallback ? from : to, prices }), {}, path)
    ledger.account({ input: 1e6 }, 'deepseek-v4-pro', 'synthetic-session', at, 'deepseek-account')
    Ledger.open = () => ledger
    globalThis.fetch = async url => {
      if (new URL(url).origin === 'https://api-docs.deepseek.com') {
        if (fallback && String(url).includes('/zh-cn/')) return new Response('', { status: 503 })
        return new Response(html(to, complete))
      }
      // Additional catalog refreshes remain independent and cannot mutate this fixture.
      return Response.json({ data: [] })
    }
    let api
    try {
      apply({ on: () => () => {}, inject() {}, get: () => undefined,
        effect: fn => { const cleanup = fn(); if (typeof cleanup === 'function') cleanups.push(cleanup) },
        provide: (key, value) => { if (key === 'costMeter') api = value } })
      await api.getState()
      const before = structuredClone(ledger.config), days = structuredClone(ledger.days)
      const history = JSON.stringify(ledger.pricingHistory), oldQuote = quote(pricingConfigAt(ledger.config, at))
      await assert.rejects(api.updateConfig({ prices: { currency: from === 'CNY' ? 'USD' : 'CNY' } }), /currency|币种/i)
      assert.deepEqual(ledger.config, before)
      assert.equal(JSON.stringify(ledger.pricingHistory), history, 'a rejected currency-only RPC publishes no price version')
      const result = await api.fetchPrices(), rejected = from !== to && !complete
      assert.equal(result.ok, !rejected, `${from}->${to}, complete=${complete}, fallback=${fallback}: ${result.message}`)
      assert.deepEqual(ledger.days, days, 'a price sync never rewrites recorded usage or money')
      assert.equal(quote(pricingConfigAt(ledger.config, at)), oldQuote, 'historical pricing remains unchanged')
      if (rejected) {
        assert.deepEqual(ledger.config, before, 'rejected currency switch is atomic')
        assert.equal(JSON.stringify(ledger.pricingHistory), history, 'no rejected price version is published')
        assert.match(result.message, /currency|币种/i)
        assert.equal(quote(ledger.config), from === 'CNY' ? 4.5 : .66 * fx)
      } else {
        assert.equal(ledger.config.prices.currency, to)
        assert.equal(quote(ledger.config), to === 'CNY' ? 4.5 : .66 * fx)
        assert.equal(ledger.config.prices.models['deepseek-flash'].multiplier, 1.5)
        assert.equal(ledger.config.prices.default.multiplier, 2)
        if (!complete) assert.deepEqual(ledger.config.prices.models['deepseek-v4-pro'], before.prices.models['deepseek-v4-pro'], 'same-currency partial sync retains absent models')
      }
    } finally {
      for (const cleanup of cleanups.reverse()) await cleanup()
      ledger.close()
    }
  }
} finally {
  Ledger.open = oldOpen; globalThis.fetch = oldFetch
  if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome
  rmSync(root, { recursive: true, force: true })
}
console.log('[ok] official price currency sync: partial-page rejection, complete switches, fallback, multipliers and immutable history')
