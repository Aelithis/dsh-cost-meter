import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { patchBillionRuntime } from '../scripts/billion-context-patch.mjs'
import { buildBillionCompatibility } from '../scripts/build-billion-context-compat.mjs'
import { billionVersionSupported } from '../lib/billion-context-compatibility.js'
import { installBillionContextBilling } from '../lib/billion-context-billing.js'
import { Ledger, sanitizeConfig } from '../lib/store.js'

for (const version of ['0.1.181', '0.1.197', '0.1.999', '0.2.0', '1.0.0', '2.0.0-preview.1']) assert.equal(billionVersionSupported(version), true)
for (const version of ['0.0.999', '0.1.0', '0.1.179', '0.1.180', '0.1.180-cost-meter.1']) assert.equal(billionVersionSupported(version), false)
assert.equal(billionVersionSupported('unknown'), null)
const proxy = `
async function fetchWithTimeout(url, opts, timeoutMs, signal) { return { response: await fetch(url, opts), clearTimer() {} }; }
async function fetchWithRetry(url, opts) { for (let attempt = 1; ; attempt++) { return await fetchWithTimeout(url, opts); } }
async function requestSummaryBody(deps, body) { for (let attempt = 1; ; attempt++) { return await fetchWithTimeout(deps.url, { method: 'POST', body }); } }
async function handle(request, response, settings) { return settings.work(); }
function createSummaryHttpCandidate(target) { return { summarize: work => target(work) }; }
`
const native = `function installNativeFetchIntercept(renamedState) { installFetchChain(send => async (input, init) => send(input, init)); }`
const patched = patchBillionRuntime(proxy, 'proxy')
assert.equal(patched.capabilities.summaryCandidate, true)
assert.equal(patchBillionRuntime(native, 'native').capabilities.nativeSends, 1)
assert.equal(patchBillionRuntime(proxy.replace(/function createSummaryHttpCandidate[^\n]+/, ''), 'proxy').capabilities.summaryCandidate, false)
for (const changed of [proxy.replace('response: await fetch(url, opts)', 'body: await fetch(url, opts)'), proxy.replace('let attempt = 1', 'let retry = 1'), proxy + proxy]) {
  assert.throws(() => patchBillionRuntime(changed, 'proxy'), { code: 'BILLION_LOGIC_CHANGED' })
}
assert.throws(() => patchBillionRuntime(native.replace('send(input, init)', 'fetch(input, init)'), 'native'), { code: 'BILLION_LOGIC_CHANGED' })
assert.throws(() => patchBillionRuntime(patched.source, 'proxy'), { code: 'BILLION_LOGIC_CHANGED' })
const root = mkdtempSync(join(tmpdir(), 'cm-billion-compatibility-'))
let bridge, ledger
try {
  const pkg = join(root, 'original'), effects = []
  mkdirSync(join(pkg, 'dist/agent'), { recursive: true })
  writeFileSync(join(pkg, 'dist/index.js'), proxy)
  writeFileSync(join(pkg, 'dist/agent/dsh-native.js'), native)
  // A future release with unchanged interfaces is accepted without a new allowlist.
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'billion-context', version: '9.8.7', author: 'original author' }))
  const built = await buildBillionCompatibility(pkg, root, { pack: false })
  const metadata = JSON.parse(readFileSync(join(built.directory, 'package.json'), 'utf8'))
  assert.equal(metadata.version, '9.8.7-cost-meter.1')
  assert.equal(metadata.author, 'original author')
  assert.equal(metadata.dshCostMeterCompatibility.baseVersion, '9.8.7')
  assert.equal(metadata.dshCostMeterCompatibility.sourceHashes['dist/index.js'].length, 64)
  assert.equal(readFileSync(join(pkg, 'dist/index.js'), 'utf8'), proxy, 'the input package is unchanged')
  rmSync(join(built.directory, '..'), { recursive: true, force: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'billion-context', version: '0.1.180' }))
  await assert.rejects(buildBillionCompatibility(pkg, root, { pack: false }), { code: 'BILLION_VERSION_TOO_OLD' })
  let version = '0.1.180'
  ledger = new Ledger(sanitizeConfig({}), {}, join(root, 'ledger.json'))
  const peerDir = join(root, 'node_modules/billion-context')
  mkdirSync(peerDir, { recursive: true })
  const peer = { options: { name: 'billion-context' }, disabled: false, fiber: { state: 2 }, parent: { tree: { ctx: { baseUrl: pathToFileURL(join(root, 'package.json')).href } } } }
  const publishPeer = () => { writeFileSync(join(peerDir, 'package.json'), JSON.stringify({ name: 'billion-context', version })); peer.fiber = { state: 2 } }
  publishPeer()
  const ctx = { effect(register) { effects.push(register()) }, on() {}, get: name => name === 'loader' ? { entries: () => [peer] } : undefined }
  bridge = installBillionContextBilling(ctx, ledger)
  await bridge.refreshPeer()
  assert.equal(bridge.status().compatibility, 'needs_update')
  assert.equal(bridge.status().noticeId, 'needs_update:0.1.180')
  version = '0.1.999'; publishPeer(); await bridge.refreshPeer(true)
  assert.equal(bridge.status().compatibility, 'unknown', 'a version bump alone never means an incompatible interface')
  assert.equal(bridge.status().noticeId, '')
  const scope = bridge.createScope({ sessionId: 'local', provider: 'fixture', model: 'main' }, Date.now())
  scope.run(() => bridge.unsupported())
  assert.equal(bridge.status().compatibility, 'changed')
  assert.equal(bridge.status().noticeId, 'changed:0.1.999')
  const group = scope.run(() => bridge.begin('http://127.0.0.1:12345/bili/test'))
  bridge.ack(group, true)
  assert.equal(bridge.status().compatibility, 'ready')
  assert.equal(bridge.status().noticeId, '')
  scope.run(() => bridge.unsupported({ changed: false }))
  assert.equal(bridge.status().noticeId, '', 'a transient transport failure is not an interface-change alert')
  for (const dispose of effects) dispose?.()
  console.log('[ok] billion-context compatibility: capability-based future releases, source preservation, old-version upgrade, interface-change notice and recovery')
} finally {
  bridge?.dispose(); ledger?.close(); rmSync(root, { recursive: true, force: true })
}
