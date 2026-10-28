// #429, reported by L33Z22L11: https://github.com/Han-1413141/dsh-cost-meter/issues/429
// Shared replacement for the five legacy visual-introduction browser fixtures.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { build } from 'esbuild'
import { sanitizeConfig, zeroDay } from '../lib/store.js'

export async function runDisplayOnboardingBrowser(suite = 'all') {
const req = createRequire(resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-context-host/node_modules', '__onboarding.cjs'))
const { chromium } = req('playwright-core')
const output = resolve(suite === 'geometry' ? '.tmp-sidebar-guide-browser' : suite === 'migration' ? '.tmp-notice-layer' : '.tmp-balance-notice'); mkdirSync(output, { recursive: true })
const initial = { config: sanitizeConfig({ locale: 'zh', sidebarSimple: true, sidebarStyle: 'compact', peakStyle: 'classic',
  sidebarSimplePromptSeen: false, sidebarSummaryPromptSeen: false, peakProgressPromptSeen: false,
  quotaStrip: { enabled: false, promptSeen: false }, balance: { display: 'both', clickHintSeen: false } }),
  today: zeroDay(), month: zeroDay(), total: zeroDay(), history: [] }
const expectedPatch = { sidebarSimplePromptSeen: true, sidebarSummaryPromptSeen: true, peakProgressPromptSeen: true, quotaStrip: { promptSeen: true }, balance: { clickHintSeen: true } }
const code = `
import React from ${JSON.stringify(req.resolve('react'))};import{createRoot}from ${JSON.stringify(req.resolve('react-dom/client'))};import * as ReactDOM from ${JSON.stringify(req.resolve('react-dom'))};
const mainRequire=n=>n==='react'?React:n==='react-dom'?ReactDOM:{Tooltip:({children})=>children};mainRequire.async=async()=>window.noticeUI;
window.__ModuleLoader__={load:m=>window.costUI=m.factory(mainRequire)};
${readFileSync('lib/client.js', 'utf8')}
window.__ModuleLoader__={load:m=>{if(m.id!=='dsh-cost-meter'||m.chunk!=='client.notices.js')throw Error('wrong notice module registration');window.noticeUI=m.factory(n=>n==='react'?React:{})}};
${readFileSync('lib/client.notices.js', 'utf8')}
let state=${JSON.stringify(initial)};const params=new URL(location).searchParams,entries=new Map(),disposers=[],services={};
const marker=params.get('marker');if(marker){const keys=marker.split('.');if(keys.length===2)state.config[keys[0]][keys[1]]=true;else state.config[marker]=true}
if(params.has('old'))delete state.config.sidebarSummaryPromptSeen;
if(params.get('locale')==='en')state.config.locale='en';
window.saves=0;window.saveMode='reject';window.patches=[];window.initialConfig=JSON.parse(JSON.stringify(state.config));
services['remote.costMeter']={getLocalState:async()=>({ok:true,value:state}),getState:async()=>({ok:true,value:state}),updateConfig:patch=>{
 window.saves++;window.patches.push(patch);if(params.has('old')&&Object.hasOwn(patch,'sidebarSummaryPromptSeen'))throw Error('unknown old-host field');
 if(window.saveMode==='throw')throw Error('synthetic sync/transport failure');
 const finish=()=>{if(!['ok','old'].includes(window.saveMode))return{ok:false,error:{message:'synthetic offline'}};
 if(window.saveMode==='ok')state={...state,config:{...state.config,...patch,quotaStrip:{...state.config.quotaStrip,...patch.quotaStrip},balance:{...state.config.balance,...patch.balance}}};return{ok:true,value:state}};
 if(window.saveMode==='pending')return new Promise(resolve=>window.finishSave=()=>resolve(finish()));return Promise.resolve(finish())}};
services.slots={entries:()=>[],inject:(name,fn)=>fn(),register:(options,component)=>{entries.set(options.id,{options,component});return()=>{}}};
const ctx={fiber:{uid:1},remote:{$mount:async()=>()=>{}},on:()=>()=>{},inject:(names,fn)=>{if(names.every(n=>services[n]))fn(ctx)},get:n=>services[n],effect:fn=>{const d=fn();if(typeof d==='function')disposers.push(d)}};
await costUI.apply(ctx);await new Promise(r=>setTimeout(r,0));
window.guideIds=[...entries.keys()].filter(id=>/guide|onboarding/.test(id));
const guide=entries.get('cost-meter-display-onboarding'),injected=guide.options.inject(),store=injected.hooks.cost;
function useCost(pick){return pick(React.useSyncExternalStore(store.subscribe,store.getSnapshot))}
window.copies=1;function App(){return React.createElement(React.Fragment,null,Array.from({length:window.copies},(_,key)=>React.createElement(guide.component,{...injected,useCost,key})))}
const root=createRoot(document.getElementById('root'));let generation=0;window.remount=()=>root.render(React.createElement(App,{key:++generation}));window.remount();
window.dispose=()=>{root.unmount();for(const d of disposers.reverse())d()};window.guideConfig=()=>store.getSnapshot().state.config;window.ready=true;
`
const compiled = (await build({ stdin: { contents: code, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser' })).outputFiles[0].contents
if (process.argv.includes('--compile-only')) { console.log('[ok] unified onboarding fixture bundled (' + suite + ')'); return }
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('content-type', 'text/javascript'); response.end(compiled); return }
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    :root{--dsw-alias-label-primary:#eee;--dsw-alias-label-secondary:#aaa;--dsw-alias-border-l1:#444;--dsw-alias-bg-layer-2:#252527;--dsw-alias-button-elevated-fill:#303033;--dsw-alias-interactive-bg-hover:#404043;--dsw-alias-state-business-primary:#6a83ff}
    html[data-env=windows],html[data-env=fullscreen]{--dsh-windows-titlebar-height:40px;--dsh-frame-chrome-top:40px;--dsh-frame-top-clearance:40px;--dsh-frame-overlay-top:60px}
    html[data-env=fullscreen]{--dsh-frame-chrome-top:0px;--dsh-frame-overlay-top:20px}
    html[data-env=darwin]{--dsh-frame-top-clearance:48px;--dsh-frame-overlay-top:68px}
    body{margin:0;background:#131315;color:#eee;font:14px/1.6 system-ui}#caption{position:fixed;inset:0 0 auto;height:40px;z-index:2147483647;-webkit-app-region:drag;background:#303033}html[data-env=darwin] #caption{height:48px}html[data-env=web] #caption,html[data-env=fullscreen] #caption{display:none}
    #root{pointer-events:none;-webkit-app-region:drag}#page-action{position:fixed;left:16px;bottom:20px}
    #host-blocker{position:fixed;inset:var(--dsh-frame-overlay-top,60px) auto auto 24px;margin:0;box-sizing:border-box;max-width:calc(100vw - 48px);padding:20px;border:1px solid #555;background:#252527;color:#eee;z-index:100;-webkit-app-region:no-drag}
    html[data-skin=light]{--dsw-alias-bg-layer-2:rgba(242,246,255,.2);--dsw-alias-label-primary:#172738;--dsw-alias-label-secondary:#445c73;--dsw-alias-button-elevated-fill:#eef4fa}
    html[data-skin=translucent]{--dsw-alias-bg-layer-2:rgba(25,31,48,.15);--dsw-alias-label-primary:#a6ffe3;--dsw-alias-label-secondary:#adc5df}
    html[data-skin=translucent] #root{position:absolute;left:20px;top:150px;width:240px;height:70px;overflow:hidden;contain:paint;transform:translateX(50px);filter:blur(0);opacity:.4}
    #plugin-cover{display:none;position:fixed;inset:0 0 auto;height:240px;background:#4b648055;z-index:2147483000;pointer-events:auto}html[data-skin=translucent] #plugin-cover{display:block}
    </style><div id="caption">DSH desktop titlebar</div><div id="plugin-cover"></div><button id="page-action" onclick="window.pageClicks=(window.pageClicks||0)+1">页面操作</button><div id="root"></div><script>const params=new URL(location).searchParams;document.documentElement.dataset.env=params.get('env')||'windows';document.documentElement.dataset.skin=params.get('skin')||'dark';if(params.has('legacyKey'))localStorage.setItem(params.get('legacyKey'),'1');window.fixtureHidden=params.has('hidden');if(window.fixtureHidden)Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.fixtureHidden});window.openBlocker=kind=>{const blocker=document.createElement(kind==='modal'?'dialog':'section');blocker.id='host-blocker';blocker.setAttribute('role','dialog');blocker.setAttribute('aria-label','Existing settings');const close=document.createElement('button');close.textContent='Close existing settings';close.onclick=()=>{blocker.close?.();blocker.remove()};blocker.append(close);document.body.append(blocker);if(kind==='modal')blocker.showModal()};if(params.has('blocked'))window.openBlocker(params.get('blocked'))</script><script type="module" src="/app.js"></script>`)
})
await new Promise(done => server.listen(0, '127.0.0.1', done)); const origin = `http://127.0.0.1:${server.address().port}`
let browser, context, page
const errors = [], external = [], reports = []
try {
  browser = await chromium.launch({ executablePath: process.env.CM_TEST_BROWSER ?? ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync), headless: true })
  // browser.newPage() owns a one-page convenience context; multi-tab storage tests
  // need an explicitly owned context with auditing installed before either page opens.
  context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true })
  context.on('page', opened => opened.on('pageerror', error => errors.push(error.message)))
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (external.push(route.request().url()), route.abort()))
  page = await context.newPage()
  assert.equal(page.context(), context, 'the main page belongs to the explicitly shared context')
  page.setDefaultTimeout(5000)
const guide = () => page.getByRole('dialog', { name: /按需设置费用显示|Set up your cost display/ })
const settled = async () => { await page.waitForFunction(() => window.ready); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.waitForTimeout(40) }
const fresh = async (query = '', visible = true) => {
  await page.goto(origin + '/?' + query); await page.evaluate(() => localStorage.clear()); await page.reload(); await settled()
  if (visible) await guide().waitFor()
}
const dismiss = async (action = '知道了') => { await guide().getByRole('button', { name: action, exact: true }).click(); await guide().waitFor({ state: 'detached' }); await page.waitForFunction(() => window.saves === 1) }
const intercept = async () => page.evaluate(() => {
  const r = document.querySelector('.cm-qguide').getBoundingClientRect(); window.intercepts = 0; window.interceptedTypes = []
  for (const type of ['pointerdown', 'pointerup', 'click', 'touchstart']) document.addEventListener(type, event => {
    const x = event.clientX ?? event.touches?.[0]?.clientX, y = event.clientY ?? event.touches?.[0]?.clientY
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { window.intercepts++; window.interceptedTypes.push(event.type); event.preventDefault(); event.stopPropagation() }
  }, { capture: true, passive: false })
})
  if (suite === 'all' || suite === 'geometry') {
    for (const skin of ['dark', 'light', 'translucent']) for (const [env, width, height] of [['windows',1280,800],['windows',900,600],['darwin',1280,800],['fullscreen',900,600],['web',390,700],['web',390,320]]) {
      await page.setViewportSize({ width, height }); await fresh('env=' + env + '&skin=' + skin)
      const close = guide().getByRole('button', { name: '关闭提示', exact: true })
      const hit = await close.evaluate(node => {
        const r = node.getBoundingClientRect(), card = node.closest('.cm-qguide'), caption = document.getElementById('caption')
        const canvas = document.createElement('canvas'), paint = canvas.getContext('2d'); paint.fillStyle = getComputedStyle(card).backgroundColor; paint.fillRect(0,0,1,1)
        return { top:r.top, bottom:card.getBoundingClientRect().bottom, chrome:getComputedStyle(caption).display==='none'?0:caption.getBoundingClientRect().bottom,
          popover:card.matches(':popover-open'), appRegion:getComputedStyle(card).webkitAppRegion, pointer:getComputedStyle(card).pointerEvents,
          alpha:paint.getImageData(0,0,1,1).data[3], overflow:card.scrollWidth>card.clientWidth,
          reachable:[[r.left+2,r.top+2],[r.right-2,r.top+2],[r.left+r.width/2,r.bottom-2]].every(([x,y])=>node.contains(document.elementFromPoint(x,y))) }
      })
      assert.ok(hit.top >= hit.chrome); assert.ok(hit.bottom <= height,'short screens scroll the card instead of clipping its actions'); assert.equal(hit.popover,true); assert.equal(hit.appRegion,'no-drag'); assert.equal(hit.pointer,'auto'); assert.equal(hit.alpha,255); assert.equal(hit.reachable,true); assert.equal(hit.overflow,false)
      // On a short phone viewport the floating card may physically cover the host button,
      // but it must not make that host control inert or trap keyboard focus.
      if (height < 400) { await page.locator('#page-action').focus(); await page.keyboard.press('Enter') }
      else await page.locator('#page-action').click()
      assert.equal(await page.evaluate(()=>window.pageClicks),1); assert.equal(await guide().count(),1)
      await page.screenshot({path:join(output,skin+'-'+env+'-'+width+'.png')})
      await close.click({position:{x:3,y:3}}); await guide().waitFor({state:'detached'}); await page.waitForFunction(()=>window.saves===1)
      await page.evaluate(()=>window.remount()); await settled(); assert.equal(await guide().count(),0)
      await page.reload(); await settled(); assert.equal(await guide().count(),0)
      reports.push({skin,env,width,height,...hit})
    }
  }
  if (suite === 'all' || suite === 'lifecycle') {
    for (const mode of ['reject','ok','old','throw','pending']) {
      await fresh(); await intercept(); await page.evaluate(mode=>window.saveMode=mode,mode)
      await guide().getByRole('button',{name:'知道了',exact:true}).evaluate(node=>{node.click();node.click()})
      await guide().waitFor({state:'detached'}); await page.waitForFunction(()=>window.saves===1)
      assert.deepEqual(await page.evaluate(()=>window.patches),[expectedPatch]); assert.equal(await page.evaluate(()=>window.intercepts),0)
      if (mode==='pending') await page.evaluate(()=>{window.saveMode='reject';window.finishSave()})
      if (mode==='ok') {
        const actual=await page.evaluate(()=>window.guideConfig())
        for (const key of ['sidebarSimple','sidebarStyle','peakStyle','peakTimeDisplay']) assert.deepEqual(actual[key],initial.config[key],key+' preference unchanged')
        assert.equal(actual.quotaStrip.enabled,initial.config.quotaStrip.enabled); assert.equal(actual.balance.display,initial.config.balance.display)
      }
      await page.evaluate(()=>window.remount()); await settled(); assert.equal(await guide().count(),0)
      await page.reload(); await settled(); assert.equal(await guide().count(),0); reports.push({mode,exactlyOnce:true,persistent:true})
    }
    await fresh(); await page.evaluate(()=>{window.copies=2;window.remount()}); await settled(); assert.equal(await guide().count(),1,'one introduction owns concurrent slots')
    await dismiss(); await page.evaluate(()=>window.remount()); await settled(); assert.equal(await guide().count(),0)
    await fresh(); await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('unavailable')}}); await dismiss(); await page.evaluate(()=>window.remount()); await settled(); assert.equal(await guide().count(),0)
    await fresh(); await page.locator('#page-action').focus(); await page.evaluate(()=>window.remount()); await settled();
    assert.equal(await page.locator('#page-action').evaluate(node=>node===document.activeElement),true,'optional introduction never steals focus');
    await guide().getByRole('button',{name:'知道了',exact:true}).focus(); await page.keyboard.press('Escape'); await guide().waitFor({state:'detached'});
    assert.equal(await page.locator('#page-action').evaluate(node=>node===document.activeElement),true,'Escape restores the preceding host focus')
    for (const action of ['关闭提示','知道了']) {
      await fresh(); await intercept(); await dismiss(action); assert.equal(await page.evaluate(()=>window.intercepts),0)
      await page.locator('#page-action').click(); assert.equal(await page.evaluate(()=>window.pageClicks),1)
    }
    await fresh(); await intercept(); await guide().getByRole('button',{name:'知道了',exact:true}).tap(); await guide().waitFor({state:'detached'}); assert.equal(await page.evaluate(()=>window.intercepts),0)
    await fresh(); await intercept()
    const outside=await page.locator('#page-action').boundingBox(), close=await guide().getByRole('button',{name:'关闭提示',exact:true}).boundingBox()
    await page.mouse.move(outside.x+outside.width/2,outside.y+outside.height/2); await page.mouse.down(); await page.mouse.move(close.x+close.width/2,close.y+close.height/2); await page.mouse.up()
    assert.ok((await page.evaluate(()=>window.interceptedTypes)).includes('pointerup'),'outside drag remains owned by its original widget'); assert.equal(await guide().count(),1)
    await dismiss()
  }
  if (suite === 'all' || suite === 'migration') {
    await fresh(); assert.deepEqual(await page.evaluate(()=>window.guideIds),['cost-meter-display-onboarding'],'five legacy automatic entries are retired')
    assert.match(await guide().innerText(),/设置.*费用.*显示/); assert.match(await guide().innerText(),/刷新/)
    await page.evaluate(()=>{HTMLElement.prototype.showPopover=undefined;window.remount()}); await settled()
    assert.equal(await guide().evaluate(node=>node.parentElement===document.body&&!node.hasAttribute('popover')),true,'legacy browser retains interactive body portal')
    await dismiss()
    await fresh('old=1'); await dismiss(); const oldPatch=await page.evaluate(()=>window.patches[0]); assert.equal(Object.hasOwn(oldPatch,'sidebarSummaryPromptSeen'),false)
    await fresh('locale=en'); assert.match(await guide().innerText(),/Settings.*Cost.*Display/); await dismiss('Got it')
    for (const marker of ['sidebarSimplePromptSeen','sidebarSummaryPromptSeen','peakProgressPromptSeen','quotaStrip.promptSeen','balance.clickHintSeen']) {
      await fresh('marker='+marker,false); assert.equal(await guide().count(),0,marker+' migrates without another introduction'); assert.equal(await page.evaluate(()=>window.saves),0)
    }
    for (const key of ['dsh-cost-meter:simple-guide-dismissed','dsh-cost-meter:peak-progress-intro-v1','dsh-cost-meter:sidebar-summary-intro-v1','dsh-cost-meter:balance-click-hint-seen','dsh-cost-meter:display-onboarding-seen']) {
      await fresh('legacyKey='+encodeURIComponent(key),false); assert.equal(await guide().count(),0,key+' dismissal survives upgrade'); assert.equal(await page.evaluate(()=>window.saves),0)
    }
    for (const kind of ['modal','role']) {
      await fresh('blocked='+kind,false); assert.equal(await guide().count(),0,'existing '+kind+' gets priority over optional introduction'); assert.equal(await page.evaluate(()=>window.saves),0)
      const closeSettings=page.getByRole('button',{name:'Close existing settings',exact:true})
      const control=await closeSettings.evaluate(node=>{const r=node.getBoundingClientRect(),caption=document.getElementById('caption');return{top:r.top,chrome:getComputedStyle(caption).display==='none'?0:caption.getBoundingClientRect().bottom,reachable:node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}})
      assert.ok(control.top>=control.chrome&&control.reachable,'existing '+kind+' settings controls clear the desktop titlebar and receive real clicks')
      await closeSettings.click(); await guide().waitFor()
      await page.evaluate(()=>window.openBlocker('modal')); await guide().waitFor({state:'detached'})
      assert.equal(await page.evaluate(()=>window.saves),0,'temporary deferral never persists a dismissal')
      assert.equal(await page.evaluate(()=>localStorage.getItem('dsh-cost-meter:display-onboarding-seen')),null)
      await page.getByRole('button',{name:'Close existing settings',exact:true}).click(); await guide().waitFor(); await dismiss()
    }
    await fresh('hidden=1',false); assert.equal(await guide().count(),0,'hidden tab does not introduce settings')
    await page.evaluate(()=>{window.fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'))}); await guide().waitFor()
    await page.evaluate(()=>{window.fixtureHidden=true;document.dispatchEvent(new Event('visibilitychange'))}); await guide().waitFor({state:'detached'}); assert.equal(await page.evaluate(()=>window.saves),0)
    await page.evaluate(()=>{window.fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'))}); await guide().waitFor(); await dismiss()
    // Another same-origin tab dismissing the entry propagates without forcing a reload.
    await fresh()
    await page.evaluate(() => {
      window.onboardingStorageEvents = 0
      window.addEventListener('storage', event => {
        if (event.key === 'dsh-cost-meter:display-onboarding-seen' && event.newValue === '1' && event.storageArea === localStorage) window.onboardingStorageEvents++
      })
    })
    const other = await context.newPage()
    try {
      assert.equal(other.context(), context, 'both tabs share the same storage context')
      await other.goto(origin); await other.waitForFunction(() => window.ready)
      await page.bringToFront(); await settled()
      assert.equal(await page.evaluate(() => document.hidden), false)
      assert.equal(await guide().count(), 1, 'opening another tab must not count as dismissal')
      await other.evaluate(() => localStorage.setItem('dsh-cost-meter:display-onboarding-seen', '1'))
      await page.waitForFunction(() => window.onboardingStorageEvents === 1)
      await page.bringToFront(); await settled(); await guide().waitFor({ state: 'detached' })
      assert.equal(await page.evaluate(() => localStorage.getItem('dsh-cost-meter:display-onboarding-seen')), '1')
      assert.equal(await page.evaluate(() => window.saves), 0, 'cross-tab acknowledgement does not issue a settings RPC')
      await page.evaluate(() => window.remount()); await settled()
      assert.equal(await guide().count(), 0, 'foreground remount remains dismissed after the real storage event')
    } finally { await other.close().catch(()=>{}) }
    reports.push({legacyConfigMarkers:5,legacyStorageKeys:5,oldHost:true,legacyBrowser:true,crossTab:true,existingDialogPriority:true,hiddenTabDeferral:true})
  }
  assert.deepEqual(errors,[]); assert.deepEqual(external,[])
  writeFileSync(join(output,'onboarding-'+suite+'.json'),JSON.stringify({suite,reports,errors,external},null,2))
  console.log('[ok] Unified onboarding browser '+suite+': skin-safe non-modal entry, dismissal persistence and retained preferences')
} catch (error) {
  if (page) await page.screenshot({path:join(output,'onboarding-'+suite+'-failure.png')}).catch(()=>{})
  throw error
} finally {
  if (page) await page.evaluate(()=>window.dispose?.()).catch(()=>{})
  if (context) await context.close().catch(()=>{})
  if (browser) await browser.close().catch(()=>{})
  server.closeAllConnections(); await new Promise(done=>server.close(done))
}
}
if (process.argv[1]?.endsWith('/display-onboarding-browser.mjs')) await runDisplayOnboardingBrowser()
