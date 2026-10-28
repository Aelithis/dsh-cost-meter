// Issue #355: real dsh-claude-style 0.16.3 bundle, including its DOM classifiers.
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { createServer } from 'node:http'
import { brotliDecompressSync } from 'node:zlib'
import { build } from 'esbuild'
import { sanitizeConfig, zeroDay } from '../lib/store.js'
import { javascriptLiteral as literal } from '../scripts/javascript-literal.mjs'

const skin = resolve(process.env.CM_CLAUDE_SKIN ?? '.tmp/claude-style')
assert.equal(JSON.parse(readFileSync(join(skin, 'package.json'))).version, '0.16.3')
const req = createRequire(resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-context-host/node_modules', '__notice.cjs'))
const { chromium } = req('playwright-core')
const output = resolve('.tmp-notice-skin'); mkdirSync(output, { recursive: true })
const main = readdirSync('src/client').filter(n => n.endsWith('.js')).sort().map(n => readFileSync('src/client/' + n, 'utf8')).join('')
  .replace('exports.apply = apply', 'exports.test = { DisplayOnboarding, peakView, peakPhaseAt, phaseLabelKeys, countdownText, resolveLocale, makeT, Tooltip, FloatingCard, renderSidebarFooter, css }; exports.apply = apply')
const config = sanitizeConfig({ locale: 'zh', sidebar: true, sidebarSummaryPromptSeen: false, peakProgressPromptSeen: false,
  peakEnabled: true, sidebarSimplePromptSeen: false, quotaStrip: { promptSeen: false }, balance: { clickHintSeen: false } })
const state = { config, today: zeroDay(), month: zeroDay(), total: zeroDay(), history: [], codingPlans: {} }
const entry = baseline => `
import * as ReactDOMPortal from ${literal(req.resolve('react-dom'))};import React from ${literal(req.resolve('react'))};import * as ReactDOM from ${literal(req.resolve('react-dom/client'))};
const require=name=>name==='react'?React:name==='react-dom/client'?ReactDOM:name==='react-dom'?ReactDOMPortal:{Tooltip:({children})=>children};
window.__ModuleLoader__={load:mod=>window.skinUI=mod.factory(require)};
${readFileSync(join(skin, 'lib/client.js'), 'utf8')}
window.skinErrors=[];const disposers=[];
const ctx={get:()=>undefined,inject:()=>{},on:()=>()=>{},effect:fn=>{const d=fn();if(typeof d==='function')disposers.push(d)},logger:{warn:()=>{},error:()=>{}}};
window.skinUI.apply(ctx);
const costRequire=name=>name==='react'?React:name==='react-dom'?ReactDOMPortal:{Tooltip:({children})=>children};costRequire.async=async()=>window.noticeUI;
window.__ModuleLoader__={load:mod=>window.mainUI=mod.factory(costRequire)};
${main}
window.__ModuleLoader__={load:mod=>window.noticeUI=mod.factory(require)};
${readFileSync(baseline ? 'test/fixtures/peak-intro-1.9.16.js' : 'lib/client.notices.js', 'utf8')}
const {DisplayOnboarding,css}=window.mainUI.test;const LegacyGuide=${baseline ? 'window.noticeUI.mount(window.mainUI.test)' : 'null'};const initial=${literal(state)};
window.clicks=0;window.saved=[];window.variant='summary';
function App(){const [state,setState]=React.useState(initial);const useCost=()=>({state});const api={updateConfig:async patch=>{window.saved.push(patch);const next={...state,config:{...state.config,...patch}};setState(next);return next}};
return React.createElement(React.Fragment,null,React.createElement('style',null,css),React.createElement('div',{id:'host-scroller',style:{height:300,overflow:'auto',width:220}},React.createElement('button',{id:'host-action',onClick:()=>window.clicks++},'宿主按钮'),React.createElement('div',{style:{height:1600}},'宿主会话')),React.createElement(${baseline ? 'LegacyGuide' : 'DisplayOnboarding'},{useCost,api,config:state.config,state,view:'summary-guide'}))}
const root=ReactDOM.createRoot(document.getElementById('root'));window.remount=()=>root.render(React.createElement(App,{key:Math.random()}));window.remount();window.ready=true;
`
const bundles = {}
for (const variant of ['before', 'after']) bundles[variant] = (await build({ stdin: { contents: entry(variant === 'before'), resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife', platform: 'browser' })).outputFiles[0].contents
if (process.argv.includes('--compile-only')) { console.log('[ok] real skin before/after fixtures bundled'); process.exit(0) }
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  if (/^\/(before|after)\.js$/.test(pathname)) { response.setHeader('content-type', 'text/javascript'); response.end(bundles[pathname.slice(1, -3)]); return }
  if (/^\/dsh-claude-style\/assets\/[a-f\d]+\.(js|svg)$/.test(pathname)) {
    const path = join(skin, 'lib/assets', pathname.split('/').at(-1) + '.br')
    response.setHeader('content-type', pathname.endsWith('.js') ? 'text/javascript' : 'image/svg+xml')
    response.end(brotliDecompressSync(readFileSync(path))); return
  }
  if (pathname.startsWith('/dsh-claude-style/')) { response.writeHead(404); response.end(); return }
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(`<!doctype html><html><head><meta charset="utf-8"><style>${readFileSync('test/fixtures/peak-theme.css', 'utf8')}</style></head><body><div id="root"></div><script src="/${pathname.includes('before') ? 'before' : 'after'}.js"></script></body></html>`)
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const url = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ executablePath: process.env.CM_TEST_BROWSER ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync), headless: true })
const page = await browser.newPage({ viewport: { width: 1294, height: 828 }, deviceScaleFactor: 1.5 })
const errors = [], reports = []
page.on('pageerror', e => errors.push(e.message))
await page.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort())
try {
  for (const variant of ['before', 'after']) {
    await page.goto(url + '/' + variant)
    await page.waitForFunction(() => window.ready && document.body.hasAttribute('data-dsh-claude-style'))
    const notice = page.locator(variant === 'before' ? 'dialog[open]' : '.cm-qguide')
    await notice.waitFor({ state: 'attached' })
    // Allow the actual skin's scheduled DOM classification to observe the notice.
    await page.waitForTimeout(400)
    const scene = await notice.evaluate(d => ({ open: d.open, modal: d.matches(':modal'), display: getComputedStyle(d).display, attributes: d.getAttributeNames().map(k => [k, d.getAttribute(k)]) }))
    reports.push({ variant, ...scene })
    if (variant === 'before') {
      assert.equal(scene.modal, true)
      // Record whether this complete plugin-only fixture reproduces the report directly.
      // Also restore the exact reported hidden-modal state, independently of other plugins.
      if (scene.display !== 'none') await page.addStyleTag({ content: 'body[data-dsh-claude-style] dialog.cm-peak-intro { display:none!important }' })
      assert.equal(await page.evaluate(() => document.elementFromPoint(10, 10).tagName), 'HTML', 'hidden old modal makes the host inert')
      await page.screenshot({ path: join(output, 'before.png') })
    } else {
      assert.equal(scene.modal, false, 'update notices never put the host into a modal state')
      await page.getByRole('dialog', { name: '按需设置费用显示' }).waitFor({ state: 'visible' })
      await page.locator('#host-action').click()
      assert.equal(await page.evaluate(() => window.clicks), 1, 'host remains clickable while the notice is open')
      await page.locator('#host-scroller').hover(); await page.mouse.wheel(0, 250)
      await page.waitForFunction(() => document.getElementById('host-scroller').scrollTop > 0)
      await page.screenshot({ path: join(output, 'after.png') })
      await page.getByRole('button', { name: '关闭提示', exact: true }).focus()
      await page.keyboard.press('Escape')
      await notice.waitFor({ state: 'detached' })
      await page.evaluate(() => localStorage.clear()); await page.reload()
      await page.locator('.cm-qguide').waitFor({ state: 'attached' })
      await page.addStyleTag({ content: 'body[data-dsh-claude-style] .cm-qguide { display:none!important }' })
      await page.locator('#host-action').click()
      assert.equal(await page.evaluate(() => window.clicks), 1, 'a skin hiding an already-open notice cannot lock the host')
      await page.evaluate(() => { localStorage.clear(); window.remount() })
      await page.locator('.cm-qguide').waitFor({ state: 'hidden' })
      assert.equal(await page.locator(':modal').count(),0,'hidden introduction never makes the page inert')
      assert.equal(await page.evaluate(() => window.saved.filter(p => p.sidebarSummaryPromptSeen).length), 0, 'invisible notices are not persisted as read')
    }
  }
  assert.deepEqual(errors, [])
  writeFileSync(join(output, 'report.json'), JSON.stringify({ skinVersion: '0.16.3', skinCommit: '3f1a5aaf5cb11e64e07020fc08372466652155c8', reports, errors, hiddenModalReproduced: true, hostClickAndScrollPassed: true }, null, 2))
  console.log('[ok] Actual Claude skin + 1.9.16 notice: hidden modal reproduced; unified card preserves host clicks/scroll, Escape, and hidden-at-open safety')
} catch (error) {
  console.error({ errors, reports, body: (await page.locator('body').innerText()).slice(0, 1000) })
  throw error
} finally { await browser.close(); server.closeAllConnections(); await new Promise(done => server.close(done)) }
