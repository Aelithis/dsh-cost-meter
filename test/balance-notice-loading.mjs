import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
for (const file of ['src/notices/index.js', 'lib/client.notices.js']) {
  let registered
  vm.runInNewContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:spec=>{registered=spec}}}})
  assert.equal(registered.id,'dsh-cost-meter',file+': package-local chunks retain the package module id')
  assert.equal(registered.chunk,'client.notices.js',file+': require.async resolves the exact chunk filename')
  const registry=new Map([[registered.id+'/'+registered.chunk, registered.factory]])
  const loader=async path=>registry.get('dsh-cost-meter/'+path.replace(/^\.\//,''))
  assert.equal(await loader('./client.notices.js'),registered.factory)
  const React={createElement:(type,props,...children)=>({type,props,children}),useRef:value=>({current:value}),useState:value=>[typeof value==='function'?value():value,()=>{}],useEffect:()=>{}}
  const Component=registered.factory(()=>React).mount({makeT:()=>key=>key,resolveLocale:()=> 'en'})
  assert.equal(typeof Component,'function')
  assert.equal(Component({}),null,'missing state does not render a notice')
}
console.log('[ok] Unified notice source/bundle: package-local chunk registration and renderable lazy mount')
