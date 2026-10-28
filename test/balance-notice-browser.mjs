// Target the shipped balance-refresh notice, including failing/mismatched hosts.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { build } from 'esbuild'
import { sanitizeConfig, zeroDay } from '../lib/store.js'

if (!process.argv.includes('--baseline')) {
  const { runDisplayOnboardingBrowser } = await import('./display-onboarding-browser.mjs')
  await runDisplayOnboardingBrowser('lifecycle')
} else {
const baseline = process.argv.includes('--baseline')
const output = resolve('.tmp-balance-notice'); mkdirSync(output, { recursive: true })
const req = createRequire(resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-ui-host/node_modules', '__notice.cjs'))
const { chromium } = req('playwright-core')
const config = sanitizeConfig({ locale: 'zh', sidebarSimplePromptSeen: true, peakProgressPromptSeen: true,
  sidebarSummaryPromptSeen: true, quotaStrip: { promptSeen: true }, balance: { display: 'both', clickHintSeen: false } })
const state = { config, today: zeroDay(), month: zeroDay(), total: zeroDay(), history: [] }
const bundle = (await build({ stdin: { contents: `
import React from ${JSON.stringify(req.resolve('react'))};import{createRoot}from ${JSON.stringify(req.resolve('react-dom/client'))};import * as ReactDOM from ${JSON.stringify(req.resolve('react-dom'))};
const mainRequire=n=>n==='react'?React:n==='react-dom'?ReactDOM:{Tooltip:({children})=>children};mainRequire.async=async()=>window.noticeUI;
window.__ModuleLoader__={load:m=>window.costUI=m.factory(mainRequire)};
${readFileSync(baseline ? '.tmp-balance-notice-before.js' : 'lib/client.js', 'utf8')}
${baseline ? '' : `window.__ModuleLoader__={load:m=>{if(m.id!=='dsh-cost-meter'||m.chunk!=='client.notices.js')throw Error('wrong notice module registration');window.noticeUI=m.factory(n=>n==='react'?React:{})}};${readFileSync('lib/client.notices.js','utf8')}`}
let state=${JSON.stringify(state)};const entries=new Map(),disposers=[],services={};window.saves=0;window.saveMode='reject';window.patches=[];
services['remote.costMeter']={getLocalState:async()=>({ok:true,value:state}),getState:async()=>({ok:true,value:state}),updateConfig:async patch=>{
 window.saves++;window.patches.push(patch);if(window.saveMode==='pending')await new Promise(resolve=>window.finishSave=resolve);
 if(window.saveMode==='throw')throw Error('synthetic sync/transport failure');
 if(!['ok','old'].includes(window.saveMode))return{ok:false,error:{message:'synthetic offline'}};
 if(window.saveMode==='ok')state={...state,config:{...state.config,balance:{...state.config.balance,...patch.balance}}};return{ok:true,value:state}}};
services.slots={entries:()=>[],inject:(name,fn)=>fn(),register:(options,component)=>{entries.set(options.id,{options,component});return()=>{}}};
const ctx={fiber:{uid:1},remote:{$mount:async()=>()=>{}},on:()=>()=>{},inject:(names,fn)=>{if(names.every(n=>services[n]))fn(ctx)},get:n=>services[n],effect:fn=>{const d=fn();if(typeof d==='function')disposers.push(d)}};
await costUI.apply(ctx);await new Promise(r=>setTimeout(r,0));
const guide=entries.get('cost-meter-balance-click-guide'),injected=guide.options.inject(),store=injected.hooks.cost;
function useCost(pick){return pick(React.useSyncExternalStore(store.subscribe,store.getSnapshot))}
window.copies=1;function App(){return React.createElement(React.Fragment,null,Array.from({length:window.copies},(_,key)=>React.createElement(guide.component,{...injected,useCost,key})))}
const root=createRoot(document.getElementById('root'));let generation=0;window.remount=()=>root.render(React.createElement(App,{key:++generation}));window.remount();
window.dispose=()=>{root.unmount();for(const d of disposers.reverse())d()};window.ready=true;
`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser' })).outputFiles[0].contents
if (process.argv.includes('--compile-only')) { console.log('[ok] historical balance fixture bundled'); process.exit(0) }
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('content-type', 'text/javascript'); response.end(bundle); return }
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#aaa;--dsw-alias-border-l1:#555;--dsw-alias-bg-layer-2:#254c2c;--dsw-alias-button-elevated-fill:#303033;--dsw-alias-state-business-primary:#62c035}
body{margin:0;background:#131315;color:#eee;font:14px/1.6 system-ui}#root{pointer-events:none;-webkit-app-region:drag}#host-button{position:fixed;bottom:20px;left:20px}
html[data-skin=light]{--dsw-alias-label-primary:#172738;--dsw-alias-label-secondary:#445c73;--dsw-alias-bg-layer-2:#f0f5ff;--dsw-alias-button-elevated-fill:#eef4fa}
html[data-skin=glass]{--dsw-alias-bg-layer-2:rgba(38,76,44,.2)}html[data-skin=glass] #root{position:absolute;top:200px;left:20px;width:200px;height:60px;overflow:hidden;contain:paint;transform:translateX(30px);opacity:.5}
html[data-skin=glass] #cover{position:fixed;inset:0 0 auto;height:350px;background:#4b648055;z-index:2147483000}
html[data-desktop=yes]{--dsh-windows-titlebar-height:40px;--dsh-frame-chrome-top:40px;--dsh-frame-top-clearance:40px;--dsh-frame-overlay-top:60px}
</style></head><body><div id="cover"></div><div id="root"></div><button id="host-button" onclick="window.hostClicks=(window.hostClicks||0)+1">宿主操作</button><script>document.documentElement.dataset.skin=new URL(location).searchParams.get('skin')||'dark';document.documentElement.dataset.desktop='yes'</script><script type="module" src="/app.js"></script></body></html>`)
})
await new Promise(done => server.listen(0, '127.0.0.1', done)); const origin = `http://127.0.0.1:${server.address().port}`
if (process.argv.includes('--serve')) { console.log(origin); await new Promise(() => {}) }
const browser = await chromium.launch({ executablePath: process.env.CM_TEST_BROWSER ?? ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync), headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, hasTouch: true })
const errors = [], reports = []; page.on('pageerror', e => errors.push(e.message))
await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
const guide = () => page.getByRole('dialog', { name: '新增:余额图框点击刷新', exact: true })
const fresh = async (skin = 'dark') => { await page.goto(origin+'/?skin='+skin); await page.evaluate(()=>localStorage.clear()); await page.reload(); await guide().waitFor() }
const intercept = async () => page.evaluate(() => {
  const r=document.querySelector('.cm-qguide').getBoundingClientRect();window.intercepts=0;
  for(const type of ['pointerdown','pointerup','click','touchstart'])document.addEventListener(type,event=>{
    const x=event.clientX??event.touches?.[0]?.clientX,y=event.clientY??event.touches?.[0]?.clientY;
    if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom){window.intercepts++;event.preventDefault();event.stopPropagation()}
  },{capture:true,passive:false})
})
try {
  if (baseline) {
    await fresh(); await guide().getByRole('button',{name:'知道了',exact:true}).click(); await page.waitForFunction(()=>window.saves===1);
    await guide().waitFor(); reports.push({ case:'RPC rejection', noticeReopened:true }); await page.screenshot({path:join(output,'before-offline.png')});
    await fresh(); await intercept(); await guide().getByRole('button',{name:'知道了',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.saves),0); assert.ok(await page.evaluate(()=>window.intercepts)>0);
    await page.screenshot({path:join(output,'before-intercepted.png')}); reports.push({case:'document capture conflict',clickBlocked:true});

  }
  assert.deepEqual(errors,[]);writeFileSync(join(output,baseline?'before.json':'after.json'),JSON.stringify({baseline,reports,errors},null,2));console.log('[ok] balance-refresh notice '+(baseline?'baseline failures reproduced':'pointer/touch/keyboard, duplicate slots, offline/old RPC, persistence and layout verified'))
} finally { await page.evaluate(()=>window.dispose?.()).catch(()=>{});await browser.close();server.closeAllConnections();await new Promise(done=>server.close(done)) }

}
