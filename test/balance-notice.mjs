// DOM lifecycle regression for the exact balance notice; layout is tested separately in Chromium.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { sanitizeConfig } from '../lib/store.js'
const req = createRequire(resolve(process.env.DSH_TEST_UI_MODULES ?? '.tmp-ui-host/node_modules', '__notice.cjs'))
const { JSDOM } = req('jsdom')
const source = readdirSync('src/client').filter(n=>n.endsWith('.js')).sort().map(n=>readFileSync('src/client/'+n,'utf8')).join('')
  .replace('exports.apply = apply', 'exports.test = { BalanceClickGuide }; exports.apply = apply')
const cfg = sanitizeConfig({locale:'zh',sidebarSimplePromptSeen:true,quotaStrip:{promptSeen:true},balance:{display:'both',clickHintSeen:false}})
const code = (await build({stdin:{contents:`
import React from ${JSON.stringify(req.resolve('react'))};import{createRoot}from ${JSON.stringify(req.resolve('react-dom/client'))};import * as ReactDOM from ${JSON.stringify(req.resolve('react-dom'))};
const require=n=>n==='react'?React:n==='react-dom'?ReactDOM:{Tooltip:({children})=>children};require.async=async()=>window.notice;
window.__ModuleLoader__={load:m=>window.main=m.factory(require)};${source}
window.__ModuleLoader__={load:m=>{if(m.id!=='dsh-cost-meter'||m.chunk!=='client.notices.js')throw Error('wrong notice module registration');window.notice=m.factory(require)}};${readFileSync('src/notices/index.js','utf8')}
window.calls=0;window.patches=[];window.intercepts=0;window.config=${JSON.stringify(cfg)};
for(const type of ['pointerdown','pointerup','click','touchstart'])document.addEventListener(type,e=>{if(e.target.closest('.cm-qguide')){window.intercepts++;e.stopPropagation()}},true);
const root=createRoot(document.getElementById('root'));let generation=0;
const api={updateConfig:patch=>{window.calls++;window.patches.push(patch);if(window.mode==='throw')throw Error('sync failure');if(window.mode==='pending')return new Promise((resolve,reject)=>window.rejectSave=reject);if(window.mode==='reject')return Promise.reject(Error('offline'));if(window.mode==='ok')window.config={...window.config,balance:{...window.config.balance,...patch.balance}};return Promise.resolve({config:window.config})}};
window.remount=(copies=1)=>root.render(React.createElement(React.Fragment,{key:++generation},Array.from({length:copies},(_,key)=>React.createElement(window.main.test.BalanceClickGuide,{key,api,useCost:()=>({state:{config:window.config}})}))));
window.dispose=()=>root.unmount();window.remount();
`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'})).outputFiles[0].text
const wait = async fn => { for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}assert.ok(fn(),'DOM lifecycle timed out') }
for(const mode of ['ok','reject','throw','old','pending']){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://synthetic.test',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
  try{
    w.mode=mode;w.eval(code);await wait(()=>w.document.querySelector('.cm-qguide button'));await new Promise(r=>setTimeout(r,30));
    const button=[...w.document.querySelectorAll('button')].find(n=>n.textContent==='知道了');button.click();button.click();
    await wait(()=>!w.document.querySelector('.cm-qguide'));await wait(()=>w.calls===1);
    assert.equal(w.intercepts,0,'window capture protects card actions from document widgets');
    assert.deepEqual(JSON.parse(JSON.stringify(w.patches)),[{balance:{clickHintSeen:true}}]);
    if(mode==='pending')w.rejectSave(Error('late failure'));
    w.remount();await new Promise(r=>setTimeout(r,30));assert.equal(w.document.querySelector('.cm-qguide'),null,'remount stays dismissed');
    assert.equal(w.localStorage.getItem('dsh-cost-meter:balance-click-hint-seen'),'1');
    if(mode==='ok')assert.equal(w.config.balance.clickHintSeen,true);
  }finally{w.dispose?.();w.close()}
}
for(const unavailableStorage of [false,true]){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'http://synthetic.test',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
  try{
    w.mode='reject';if(unavailableStorage)Object.defineProperty(w,'localStorage',{get(){throw Error('storage blocked')}});
    w.eval(code);w.remount(2);await wait(()=>w.document.querySelectorAll('.cm-qguide').length===2);await new Promise(r=>setTimeout(r,30));
    [...w.document.querySelectorAll('.cm-qguide button')].find(n=>n.textContent==='知道了').click();
    await wait(()=>!w.document.querySelector('.cm-qguide'));w.remount(2);await new Promise(r=>setTimeout(r,30));assert.equal(w.document.querySelectorAll('.cm-qguide').length,0);
    assert.equal(w.calls,1,'one click dismisses duplicate slots with one RPC');
  }finally{w.dispose?.();w.close()}
}
console.log('[ok] Balance notice DOM: failed/synchronous/old/pending RPC, exact-once clicks, capture conflict, memory/local dismissal and duplicate remounts')
