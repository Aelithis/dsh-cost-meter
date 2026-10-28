// #429 retains the 1.9.42 balance-notice guarantees in the unified introduction.
// Real layout, skins and pointer hit testing run in the adjacent browser suites.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { sanitizeConfig } from '../lib/store.js'
const req = createRequire(resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-ui-host/node_modules', '__notice.cjs'))
const { JSDOM } = req('jsdom')
const source = readdirSync('src/client').filter(n => n.endsWith('.js')).sort().map(n => readFileSync('src/client/' + n, 'utf8')).join('')
  .replace('exports.apply = apply', 'exports.test = { DisplayOnboarding }; exports.apply = apply')
const config = sanitizeConfig({ locale: 'zh', sidebarStyle: 'compact', currency: 'USD', balance: { display: 'both' } })
const expected = { sidebarSimplePromptSeen: true, sidebarSummaryPromptSeen: true, peakProgressPromptSeen: true, quotaStrip: { promptSeen: true }, balance: { clickHintSeen: true } }
const compiled = (await build({ stdin: { contents: `
import React from ${JSON.stringify(req.resolve('react'))};import{createRoot}from ${JSON.stringify(req.resolve('react-dom/client'))};import * as ReactDOM from ${JSON.stringify(req.resolve('react-dom'))};
const require=n=>n==='react'?React:n==='react-dom'?ReactDOM:{Tooltip:({children})=>children};
require.async=async()=>{window.loads=(window.loads||0)+1;if(window.failLoad){window.failLoad=false;throw Error('chunk unavailable')}return window.notice};
window.__ModuleLoader__={load:m=>window.main=m.factory(require)};${source}
window.__ModuleLoader__={load:m=>{if(m.id!=='dsh-cost-meter'||m.chunk!=='client.notices.js')throw Error('wrong notice module registration');window.notice=m.factory(require)}};${readFileSync('src/notices/index.js', 'utf8')}
window.calls=0;window.patches=[];window.intercepts=0;window.config=window.initialConfig||${JSON.stringify(config)};
for(const type of ['pointerdown','pointerup','click','touchstart'])document.addEventListener(type,e=>{if(e.target.closest('.cm-qguide')){window.intercepts++;e.stopPropagation()}},true);
const root=createRoot(document.getElementById('root'));let generation=0;
const api={updateConfig:patch=>{window.calls++;window.patches.push(patch);if(window.mode==='throw')throw Error('sync failure');if(window.mode==='pending')return new Promise((resolve,reject)=>window.rejectSave=reject);if(window.mode==='reject')return Promise.reject(Error('offline'));if(window.mode==='ok')window.config={...window.config,...patch,balance:{...window.config.balance,...patch.balance},quotaStrip:{...window.config.quotaStrip,...patch.quotaStrip}};return Promise.resolve({config:window.config})}};
window.remount=(copies=1)=>root.render(React.createElement(React.Fragment,{key:++generation},Array.from({length:copies},(_,key)=>React.createElement(window.main.test.DisplayOnboarding,{key,api,useCost:()=>({state:{config:window.config}})}))));
window.replaceKeys=keys=>root.render(React.createElement(React.Fragment,{key:generation},keys.map(key=>React.createElement(window.main.test.DisplayOnboarding,{key,api,useCost:()=>({state:{config:window.config}})}))));
window.dispose=()=>root.unmount();window.remount();
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser' })).outputFiles[0].text
const wait = async fn => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)) } assert.ok(fn(), 'DOM lifecycle timed out') }
const pause = () => new Promise(r => setTimeout(r, 30))
const makeDOM = () => new JSDOM('<!doctype html><button id="host">Host</button><div id="root"></div>', { url: 'http://synthetic.test', runScripts: 'outside-only', pretendToBeVisual: true })
const count = w => w.document.querySelectorAll('.cm-qguide').length
const dismiss = w => [...w.document.querySelectorAll('.cm-qguide button')].find(n => n.textContent === '知道了')
for (const mode of ['ok', 'reject', 'throw', 'old', 'pending']) {
  const dom = makeDOM(), w = dom.window
  try {
    w.mode = mode; w.eval(compiled); await wait(() => count(w) === 1); await pause()
    // A concurrent preference change must not be overwritten by the guide's stale render.
    w.config.balance.display = 'settings'
    const button = dismiss(w); button.click(); button.click()
    await wait(() => !count(w)); await wait(() => w.calls === 1)
    assert.equal(w.intercepts, 0, 'window capture protects guide actions from document widgets')
    assert.deepEqual(JSON.parse(JSON.stringify(w.patches)), [expected])
    assert.equal(w.config.balance.display, 'settings'); assert.equal(w.config.sidebarStyle, 'compact'); assert.equal(w.config.currency, 'USD')
    if (mode === 'pending') w.rejectSave(Error('late failure'))
    w.remount(); await pause(); assert.equal(count(w), 0, 'remount stays dismissed after RPC failure/old schema')
    const saved = w.localStorage.getItem('dsh-cost-meter:display-onboarding-seen'); assert.equal(saved, '1')
    // A fresh JS runtime models same-origin reload instead of relying on module memory.
    const reload = makeDOM()
    try { reload.window.localStorage.setItem('dsh-cost-meter:display-onboarding-seen', saved); reload.window.eval(compiled); await pause(); assert.equal(count(reload.window), 0) }
    finally { reload.window.dispose?.(); reload.window.close() }
  } finally { w.dispose?.(); w.close() }
}
for (const unavailableStorage of [false, true]) {
  const dom = makeDOM(), w = dom.window
  try {
    w.mode = 'reject'
    if (unavailableStorage) Object.defineProperty(w, 'localStorage', { get() { throw Error('storage blocked') } })
    w.eval(compiled); w.remount(2); await wait(() => count(w) === 1); await pause()
    dismiss(w).click(); await wait(() => !count(w)); w.remount(2); await pause()
    assert.equal(count(w), 0, 'memory fallback survives duplicate slot remounts')
    assert.equal(w.calls, 1, 'one guide, one acknowledgement RPC')
  } finally { w.dispose?.(); w.close() }
}
for (const scenario of ['load-failure', 'storage-event', 'missing-markers']) {
  const dom = makeDOM(), w = dom.window
  try {
    w.mode = 'reject'
    if (scenario === 'load-failure') w.failLoad = true
    if (scenario === 'missing-markers') {
      w.initialConfig = structuredClone(config)
      for (const key of ['sidebarSimplePromptSeen', 'sidebarSummaryPromptSeen', 'peakProgressPromptSeen']) delete w.initialConfig[key]
      delete w.initialConfig.quotaStrip.promptSeen; delete w.initialConfig.balance.clickHintSeen
    }
    w.eval(compiled)
    if (scenario === 'load-failure') { await pause(); assert.equal(count(w), 0); w.remount() }
    await wait(() => count(w) === 1)
    if (scenario === 'storage-event') w.dispatchEvent(new w.StorageEvent('storage', { key: 'dsh-cost-meter:display-onboarding-seen', newValue: '1' }))
    else dismiss(w).click()
    await wait(() => !count(w)); w.remount(); await pause(); assert.equal(count(w), 0)
    if (scenario === 'load-failure') assert.equal(w.loads, 2, 'failed lazy chunk is retried on remount')
    else assert.equal(w.calls, 0, 'cross-tab dismiss and unsupported marker schemas do not send configuration')
  } finally { w.dispose?.(); w.close() }
}
// Exercise visibility/class mutations and owner cleanup with real React effects.
{
  const dom = makeDOM(), w = dom.window
  try {
    w.mode = 'reject'
    const blocker = w.document.createElement('section'); blocker.setAttribute('role', 'dialog'); blocker.className = 'open'
    blocker.getClientRects = () => blocker.className === 'open' ? [{}] : []
    w.document.body.append(blocker)
    w.eval(compiled); await wait(() => w.loads === 1); await pause(); assert.equal(count(w), 0, 'existing settings get priority')
    blocker.className = ''; await wait(() => count(w) === 1)
    blocker.className = 'open'; await wait(() => !count(w)); assert.equal(w.calls, 0, 'deferral does not acknowledge the guide')
    blocker.remove(); await wait(() => count(w) === 1)
    let hidden = true; Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => hidden })
    w.document.dispatchEvent(new w.Event('visibilitychange')); await wait(() => !count(w))
    hidden = false; w.document.dispatchEvent(new w.Event('visibilitychange')); await wait(() => count(w) === 1)
    w.replaceKeys(['owner', 'next']); await pause(); assert.equal(count(w), 1)
    w.replaceKeys(['next']); await pause(); assert.equal(count(w), 1, 'unmounting owner transfers exactly one visible guide')
    w.document.getElementById('host').focus(); w.remount(); await pause()
    assert.equal(w.document.activeElement.id, 'host', 'card does not steal focus')
    dismiss(w).focus(); dismiss(w).dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wait(() => !count(w)); assert.equal(w.document.activeElement.id, 'host', 'focused Escape restores host focus')
    assert.equal(w.calls, 1)
  } finally { w.dispose?.(); w.close() }
}
console.log('[ok] Unified notice DOM: fresh single card, exact-once marker writes, failed/old/pending RPC, reload/remount, duplicate slots, failed chunk recovery, storage fallback and preference preservation')
