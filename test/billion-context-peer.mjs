import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { createBillionPeerLookup } from '../lib/billion-context-peer.js'
import { installBillionContextBilling } from '../lib/billion-context-billing.js'
import { Ledger, sanitizeConfig } from '../lib/store.js'

const root = mkdtempSync(join(tmpdir(), 'cm-billion-peer-'))
const originalOpen = fs.open, originalRealpath = fs.realpath
let opens = 0, active = 0, maxActive = 0, scans = 0, pause, release
const seen = [], effects = [], events = new Map()
fs.open = async (...args) => {
  opens++; seen.push(String(args[0])); active++; maxActive = Math.max(maxActive, active)
  try { if (pause) { pause = false; await new Promise(resolve => { release = resolve }) }; return await originalOpen(...args) }
  finally { active-- }
}
syncBuiltinESMExports()
const anchor = pathToFileURL(join(root, 'profile/package.json')).href
const profile = { dir: join(root, 'profile'), installAnchor: join(root, 'installation/package.json') }
let entries = [], resolution
const services = { loader: { entries: () => entries }, pluginManager: { profile, listBundles() { scans++; throw Error('Full inventory must never run') } },
  profileContext: profile, pluginPackages: { get resolution() { return resolution } } }
const ctx = { get: name => services[name], baseUrl: anchor, on(name, fn) { events.set(name, fn) }, effect(fn) { effects.push(fn()) } }
const pkg = (directory, version = '0.1.208', name = 'billion-context') => {
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version, type: 'module' }))
  writeFileSync(join(directory, 'native.js'), '')
  return directory
}
const entry = (name = 'billion-context', base = anchor) => ({ options: { name }, disabled: false,
  fiber: { state: 2, runtime: { name: 'bili-native' } }, parent: { tree: { ctx: { baseUrl: base } } } })
const local = pkg(join(profile.dir, 'node_modules/billion-context'))
const lookup = createBillionPeerLookup(ctx)
let ledger, bridge
const originalInterval = globalThis.setInterval, originalNow = Date.now
const intervals = []
try {
  for (let i = 0; i < 328; i++) pkg(join(profile.dir, 'node_modules/irrelevant-' + i), '1.0.0', 'irrelevant-' + i)
  assert.equal(await lookup.read(), null, 'installed metadata alone cannot enable a peer')
  assert.equal(opens, 0, 'absent runtime never scans manifests')
  const native = entry(); entries = [native]
  assert.equal((await lookup.read()).version, '0.1.208')
  assert.equal(seen.some(path => path.includes('irrelevant-')), false)
  const coldOpens = opens, start = performance.now()
  for (let i = 0; i < 1000; i++) assert.equal((await lookup.read()).version, '0.1.208')
  const warmMs = performance.now() - start
  assert.equal(opens, coldOpens, 'idle ticks use a loaded-module cache, no filesystem reads')
  pkg(local, '0.1.209'); lookup.invalidate()
  assert.equal((await lookup.read()).version, '0.1.208', 'restart-required saved upgrade does not change the running peer version')
  native.fiber = { state: 2, runtime: { name: 'bili-native' } }
  assert.equal((await lookup.read()).version, '0.1.209', 'hot remount observes the upgraded version')
  for (const state of [0, 1, 3, 4, 5]) { native.fiber.state = state; assert.equal(await lookup.read(), null, 'pending/loading/failed/unloading/disposed is not active') }
  native.fiber.state = 2; native.disabled = true
  assert.equal(await lookup.read(), null, 'effective disabled state wins over selected bundle metadata')
  native.disabled = false
  entries = [{ ...entry('billion-context/dsh-compaction-gate'), fiber: { state: 2, runtime: { name: 'bili-compaction-gate' } } }]
  assert.equal(await lookup.read(), null, 'the always-on compaction gate is not the native proxy')

  // The actual loader parent wins over an installation's shadowed copy.
  pkg(join(root, 'installation/node_modules/billion-context'), '0.1.181')
  entries = [entry()]
  assert.equal((await lookup.read()).version, '0.1.209')
  // Newer host interception can resolve a package outside Node's native paths.
  const mapped = pkg(join(root, 'mapped-package'), '0.1.210')
  const otherProfile = join(root, 'other-profile'); mkdirSync(otherProfile)
  resolution = { profileDir: otherProfile, entries: [{ name: 'billion-context', packageDir: mapped, version: '0.1.210', scope: 'installation' }] }
  entries = [entry('billion-context', pathToFileURL(join(otherProfile, 'cordis.yml')).href)]
  assert.equal((await lookup.read()).version, '0.1.210')
  const profileLink = join(root, 'profile-link'); symlinkSync(otherProfile, profileLink, 'junction')
  resolution = { profileDir: profileLink, localPackageNames: [], linkedRoots: [], entries: [{ name: 'billion-context', packageDir: mapped, scope: 'profile' }] }
  entries = [entry('billion-context', pathToFileURL(join(otherProfile, 'cordis.yml')).href)]
  assert.equal((await lookup.read()).version, '0.1.210', 'canonical base under symlinked profile uses the published mapping')
  const anchorAlias = join(root, 'anchor-alias'); symlinkSync(otherProfile, anchorAlias, 'junction')
  entries = [entry('billion-context', pathToFileURL(join(anchorAlias, 'not-yet-written.yml')).href)]
  assert.equal((await lookup.read()).version, '0.1.210', 'virtual anchor under a different directory alias resolves its canonical parent')
  pkg(join(otherProfile, 'node_modules/billion-context'), '0.1.215')
  entries = [entry('billion-context', pathToFileURL(join(anchorAlias, 'not-yet-written.yml')).href)]
  assert.equal((await lookup.read()).version, '0.1.215', 'canonical local dependency retains priority over an intercepted mapping')
  resolution = { profileDir: otherProfile, linkedRoots: [{ name: 'external', realPath: root }], entries: [{ name: 'billion-context', packageDir: mapped, scope: 'profile' }] }
  entries = [entry('billion-context', pathToFileURL(join(root, 'external.js')).href)]
  assert.equal(await lookup.read(), undefined, 'unresolved external peer interception is unknown, never a guessed version')
  resolution = undefined

  // pnpm links, package aliases and absolute/file URL entries retain identity.
  const aliased = pkg(join(root, 'linked-package'), '0.1.211')
  symlinkSync(aliased, join(profile.dir, 'node_modules/native-alias'), 'junction')
  entries = [entry('native-alias')]
  assert.equal((await lookup.read()).version, '0.1.211')
  let linkedFile = join(root, 'linked-native.js')
  try { symlinkSync(join(aliased, 'native.js'), linkedFile) }
  catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error
    // Directory junctions preserve canonical package ownership without Windows file-symlink privileges.
    const linkedDir = join(root, 'linked-native-package')
    symlinkSync(aliased, linkedDir, 'junction'); linkedFile = join(linkedDir, 'native.js')
  }
  entries = [entry(pathToFileURL(linkedFile).href)]
  assert.equal((await lookup.read()).version, '0.1.211', 'file symlink resolves owning real package')
  entries = [entry(join(aliased, 'native.js'))]
  assert.equal((await lookup.read()).version, '0.1.211')
  pkg(aliased, '1.0.0', 'not-billion-context'); entries = [entry(pathToFileURL(join(aliased, 'native.js')).href)]
  assert.equal(await lookup.read(), null, 'a similarly named runtime cannot spoof the package identity')
  pkg(aliased, '0.1.212'); lookup.invalidate()
  assert.equal((await lookup.read()).version, '0.1.212', 'manifest error/absence can recover without a process restart')
  writeFileSync(join(aliased, 'package.json'), '{'); entries[0].fiber = { state: 2, runtime: { name: 'bili-native' } }
  assert.equal(await lookup.read(), undefined, 'unreadable live metadata is unknown rather than a false unload')
  writeFileSync(join(aliased, 'package.json'), ' '.repeat(300 * 1024)); lookup.invalidate()
  assert.equal(await lookup.read(), undefined, 'oversized manifests are rejected before parse')
  if (process.platform !== 'win32') {
    rmSync(join(aliased, 'package.json'))
    assert.equal(spawnSync('mkfifo', [join(aliased, 'package.json')]).status, 0)
    lookup.invalidate()
    await Promise.race([lookup.read(), new Promise((_, reject) => setTimeout(() => reject(Error('FIFO blocked discovery')), 1000).unref())])
    rmSync(join(aliased, 'package.json'))
  }
  pkg(aliased, '0.1.213'); entries = [entry(pathToFileURL(join(aliased, 'native.js')).href)]
  pause = true
  const slow = lookup.read(), joined = lookup.read()
  assert.equal(slow, joined, 'concurrent refreshes are single-flight')
  await new Promise(resolve => setImmediate(resolve));
  while (!release) await new Promise(resolve => setImmediate(resolve))
  let heartbeat = false
  await new Promise(resolve => setTimeout(() => { heartbeat = true; resolve() }, 1))
  assert.equal(heartbeat, true, 'slow filesystem discovery yields the host event loop')
  entries = []; lookup.invalidate(); release(); release = undefined
  assert.equal(await slow, null, 'unloaded peer cannot reappear from stale asynchronous discovery')
  entries = [entry(pathToFileURL(join(aliased, 'native.js')).href)]; pause = true
  const stopping = lookup.read()
  while (!release) await new Promise(resolve => setImmediate(resolve))
  lookup.dispose(); release(); release = undefined
  assert.equal(await stopping, undefined, 'dispose invalidates in-flight discovery')

  // Discovery failure does not prevent durable usage/host-fallback billing.
  ledger = new Ledger(sanitizeConfig({}), {}, join(root, 'ledger.json'))
  globalThis.setInterval = (callback, delay) => { const timer = { callback, delay, unref() {} }; intervals.push(timer); return timer }
  bridge = installBillionContextBilling(ctx, ledger)
  globalThis.setInterval = originalInterval
  await bridge.refreshPeer(true)
  assert.equal(bridge.status().version, '0.1.213')
  const billingTimer = intervals.find(timer => timer.delay === 3000)
  assert.ok(billingTimer, 'exercise the actual scheduled billing timer callback')
  const timerOpens = opens
  let clock = Date.now(); Date.now = () => clock
  for (let tick = 0; tick < 24; tick++) { clock += 3000; billingTimer.callback(); await bridge.refreshPeer(); await bridge.ingest() }
  Date.now = originalNow
  assert.equal(opens, timerOpens, '72 simulated idle seconds cause no peer manifest reads')
  assert.equal(scans, 0, 'all 24 actual timer callbacks avoid the full host inventory')
  entries = []; await bridge.refreshPeer(true)
  assert.equal(bridge.status().detected, false)
  assert.equal(bridge.status().version, '')
  const scope = bridge.createScope({ sessionId: 'no-peer', provider: 'fixture', model: 'main' }, Date.now())
  assert.equal(await scope.finish({ input: 10, output: 2 }), false, 'host billing remains eligible with no discovered peer')
  assert.equal(scans, 0, 'no listBundles fallback, including invalid manifests, hot changes and errors')
  assert.equal(maxActive, 1, 'target discovery reads at most one file concurrently')
  console.log(JSON.stringify({ check: 'billion-context peer discovery', unrelatedPackages: 328, coldManifestOpens: coldOpens,
    idleRefreshes: 1000, scheduledTicks: 24, simulatedIdleSeconds: 72, idleManifestOpens: 0, idleRefreshMs: +warmMs.toFixed(3), listBundlesCalls: scans, maxConcurrentOpens: maxActive }))
  console.log('[ok] #432 async peer discovery: active lifecycle, runtime resolution, aliases, bounded I/O, no idle scan, errors and disposal')
} finally {
  globalThis.setInterval = originalInterval; Date.now = originalNow
  lookup.dispose(); for (const dispose of effects) dispose?.(); bridge?.dispose(); await ledger?.close()
  fs.open = originalOpen; fs.realpath = originalRealpath; syncBuiltinESMExports()
  rmSync(root, { recursive: true, force: true })
}
