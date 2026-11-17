import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PROVIDER_PRICE_TABLE, upgradeProviderPriceCatalog20261015, providerPriceEntryFor, costOf } from '../lib/pricing.js'
import { PROVIDER_PRICES_2026_10_03 } from '../lib/provider-prices.js'
import { defaultConfig, sanitizeConfig, Ledger } from '../lib/store.js'
import { planProviderIdOf, billingClassOf, enabledPlanSetOf } from '../lib/plan-billing.js'
const config=defaultConfig(), now=Date.parse('2026-10-15T12:00:00Z')
const quote=(p,id)=>providerPriceEntryFor(p,id,config.prices).entry
for(const route of ['anthropic','opencode-zen','opencode-go']) {
 const haiku=quote(route,'claude-haiku-5-5')
 assert.equal(haiku.longContext.aboveInputTokens,100000)
 assert.ok(Math.abs(costOf({input:20000,cacheRead:40000,cacheWrite:40000,output:1000},haiku,now)-.0079)<1e-10)
 assert.ok(Math.abs(costOf({input:20001,cacheRead:40000,cacheWrite:40000,output:1000},haiku,now)-.0395005)<1e-10)
}
assert.equal(quote('anthropic','claude-sonnet-5-5').cacheHit,.1)
assert.equal(quote('opencode-zen','claude-sonnet-5-5').cacheHit,.2)
assert.equal(quote('openai','gpt-6.1-sol').cacheHit,.1)
assert.equal(quote('opencode-zen','gpt-6.1-sol').cacheHit,.1)
for(const [p,id,rates] of [
 ['google','gemini-4-argon',[2,.1,10]], ['mistral','mistral-large-4',[.68,.07,2.09]],
 ['openai','gpt-rosalind-research',[5,.5,25]],['openai','gpt-rosalind-discovery',[5,.5,25]],['openai','gpt-5.6-cyber',[12.5,1.25,75]],
]) { const entry=quote(p,id); assert.deepEqual([entry.cacheMiss,entry.cacheHit,entry.output],rates) }
assert.equal(quote('google','gemini-4-argon').cacheWrite,undefined,'implicit cache is not storage/cache creation')
assert.equal(providerPriceEntryFor('custom-api','cat-jam-free',config.prices).priced,false,'gateway free promotion cannot leak')
assert.deepEqual(quote('opencode-go-plus','claude-haiku-5-5'),quote('opencode-go','claude-haiku-5-5'))
const custom={input:2,cachedInput:.17,cacheWrite:2.5,output:10}
const old=structuredClone(PROVIDER_PRICES_2026_10_03)
delete old.anthropic.models['claude-opus-5-5']
old['opencode-zen'].models['gpt-6.1-sol']=custom
const upgraded={prices:{providers:old}}
upgradeProviderPriceCatalog20261015(upgraded)
assert.equal(upgraded.prices.providers.anthropic.models['claude-sonnet-5-5'].cachedInput,.1)
assert.ok(upgraded.prices.providers.anthropic.models['claude-haiku-5-5'])
assert.equal(upgraded.prices.providers.anthropic.models['claude-opus-5-5'],undefined)
assert.deepEqual(upgraded.prices.providers['opencode-zen'].models['gpt-6.1-sol'],custom)
const root=mkdtempSync(join(tmpdir(),'cm-catalog-1015-')), path=join(root,'ledger.json')
try {
 const initial=new Ledger(sanitizeConfig({prices:{providers:PROVIDER_PRICES_2026_10_03}}),{},path,['provider-catalog-2026-10-03'])
 initial.scheduleWrite();initial.flush();initial.close()
 const first=Ledger.load(path)
 assert.equal(first.config.prices.providers.anthropic.models['claude-sonnet-5-5'].cachedInput,.1)
 assert.ok(first.config.prices.providers.anthropic.models['claude-haiku-5-5'])
 delete first.config.prices.providers.anthropic.models['claude-haiku-5-5']
 first.scheduleWrite();first.flush();first.close()
 const second=Ledger.load(path)
 assert.equal(second.config.prices.providers.anthropic.models['claude-haiku-5-5'],undefined)
 second.close()
} finally {rmSync(root,{recursive:true,force:true})}
for(const [p,id] of [['tencent-coding-plan','tencent-coding'],['tencent-token-plan','tencent-token'],['ark-agent-plan','volcengine-agent'],['baidu-coding-plan','baidu-coding']]) {
 assert.equal(planProviderIdOf(p),id)
 assert.equal(billingClassOf(p,'m',config.planBilling,enabledPlanSetOf(config)),'plan')
 assert.equal(billingClassOf(p,'m',{...config.planBilling,models:{[p+':m']:'api'}},enabledPlanSetOf(config)),'api')
}
const on={...config,codexQuotaEnabled:true}
assert.equal(billingClassOf('openai-codex','gpt-6.1-sol',on.planBilling,enabledPlanSetOf(on)),'plan')
assert.equal(billingClassOf('openai','gpt-6.1-sol',on.planBilling,enabledPlanSetOf(on)),'api')
assert.equal(billingClassOf('baidu','ernie',on.planBilling,enabledPlanSetOf(on)),'api')
assert.equal(billingClassOf('tencent','hy3',on.planBilling,enabledPlanSetOf(on)),'api')
console.log('[ok] October 15 catalog: prices, 100K cache-inclusive boundary, route isolation, safe upgrade/restart, subscription families')
