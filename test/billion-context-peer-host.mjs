/** Real Cordis Loader lifecycle and published PluginManager scan contrast. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'
import { createBillionPeerLookup } from '../lib/billion-context-peer.js'

assert.ok(process.env.DSH_TEST_NODE_MODULES, 'set DSH_TEST_NODE_MODULES to an installed DSH host')
const require = createRequire(join(resolve(process.env.DSH_TEST_NODE_MODULES), '__peer_test.cjs'))
const imp = name => import(pathToFileURL(require.resolve(name)).href)
const { Context } = await imp('@deepseek-ai/cordis')
const { default: Loader } = await imp('@deepseek-ai/cordis-plugin-loader')
const { PluginPackages } = await imp('@deepseek-ai/dsh-app-boot')
const { default: PluginManager } = await imp('@deepseek-ai/dsh-plugin-manager')
const root = mkdtempSync(join(tmpdir(), 'cm-billion-peer-host-'))
const profile = { dir: root, installAnchor: join(root, 'installation/package.json'), startedBundles: [] }
const packageDir = join(root, 'node_modules/billion-context')
mkdirSync(packageDir, { recursive: true }); mkdirSync(join(root, 'installation'))
const packageFile = join(packageDir, 'package.json'), nativeFile = join(packageDir, 'native.js')
const writeVersion = version => writeFileSync(packageFile, JSON.stringify({ name: 'billion-context', version, type: 'module', dsh: { bundle: { patch: './patch.json' } } }))
writeVersion('0.1.208')
writeFileSync(nativeFile, `export const name = 'bili-native'; export function apply(ctx, config) { if (config.fail) throw Error('fixture native failure'); ctx.provide('fixtureNative', true) }`)
writeFileSync(join(packageDir, 'patch.json'), '[]')
const dependencies = { 'billion-context': '0.1.208' }
for (let i = 0; i < 328; i++) {
  const name = 'irrelevant-' + i; dependencies[name] = '1.0.0'; mkdirSync(join(root, 'node_modules', name))
  writeFileSync(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
}
writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module', dependencies, dsh: { profile: { bundles: ['billion-context'] } } }))
writeFileSync(profile.installAnchor, '{"name":"fixture-host","version":"0.2.1-rc.3"}')
const host = new Context(), errors = []
host.baseUrl = pathToFileURL(join(root, 'package.json')).href
host.logger = { error: error => errors.push(error), warn() {}, info() {} }
const lookup = createBillionPeerLookup(host)
try {
  await host.plugin(Loader, { baseUrl: host.baseUrl }).await()
  let revision = 0
  const rows = (disabled = false, fail = false) => [{ id: 'bili-native', name: pathToFileURL(nativeFile).href + '?revision=' + revision, disabled, config: { fail } }]
  assert.equal(await lookup.read(), null)
  await host.loader.root.update(rows()); await host.loader.await()
  assert.equal((await lookup.read()).version, '0.1.208', 'hot-installed active native fiber is discovered')
  writeVersion('0.1.209'); lookup.invalidate()
  assert.equal((await lookup.read()).version, '0.1.208', 'saved upgrade requiring restart keeps loaded identity')
  await host.loader.root.update(rows(true)); await host.loader.await()
  assert.equal(await lookup.read(), null, 'real disabled entry disappears')
  await host.loader.root.update(rows()); await host.loader.await()
  assert.equal((await lookup.read()).version, '0.1.208', 're-enable reuses Node cached module, not the upgraded on-disk version')
  const oldCallback = [...host.loader.entries()][0].fiber.runtime.callback
  await host.loader.root.update([]); await host.loader.await()
  revision++; await host.loader.root.update(rows()); await host.loader.await()
  assert.notEqual([...host.loader.entries()][0].fiber.runtime.callback, oldCallback, 'fixture must really load a new module, not merely remount a cached one')
  assert.equal((await lookup.read()).version, '0.1.209', 'a new loaded module callback observes the upgraded version')
  await host.loader.root.update([]); await host.loader.await()
  await host.loader.root.update(rows(false, true)); await host.loader.await()
  assert.equal(await lookup.read(), null, 'real startup failure is not detected as an enabled peer')
  await host.loader.root.update([]); await host.loader.await()
  await host.loader.root.update(rows()); await host.loader.await()
  assert.equal((await lookup.read()).version, '0.1.209', 'real failed-entry recovery works')
  await host.loader.root.update([]); await host.loader.await()
  assert.equal(await lookup.read(), null, 'real hot uninstall invalidates presence')
  await host.loader.root.update(rows()); await host.loader.await()
  // Published host implementation, not a recreated scanner. This is a Linux
  // operation-count/latency contrast, not a claim to reproduce Windows filters.
  let scans = 0
  const manager = { profile, ctx: host, protectsManager: () => false, declaredRows: () => ({ rows: [], overrides: [] }),
    listBundles() { scans++; return PluginManager.prototype.listBundles.call(this) } }
  host.provide('pluginManager', manager)
  const before = performance.now(); const listed = await manager.listBundles(); const scanMs = performance.now() - before
  assert.ok(listed.some(row => row.name === 'billion-context' && row.enabled && !row.error))
  scans = 0
  const start = performance.now()
  for (let i = 0; i < 1000; i++) assert.equal((await lookup.read()).version, '0.1.209')
  const lookupMs = performance.now() - start
  assert.equal(scans, 0)
  if (Object.getOwnPropertyDescriptor(PluginPackages.prototype, 'resolution')) {
    const real = join(root, 'outside-profile'), profiles = join(root, 'profiles'), profileLink = join(profiles, 'web'), mapped = join(root, 'mapped-peer')
    for (const dir of [real, profiles, mapped]) mkdirSync(dir)
    symlinkSync(real, profileLink, 'junction')
    writeFileSync(join(real, 'package.json'), '{"type":"module"}')
    writeFileSync(join(mapped, 'package.json'), '{"name":"billion-context","version":"0.1.214","type":"module"}')
    const linked = join(root, 'linked-parent'); mkdirSync(linked)
    writeFileSync(join(linked, 'package.json'), '{"name":"linked-parent","peerDependencies":{"billion-context":"*"}}')
    const resolution = { profilesDir: profiles, profileDir: profileLink, localPackageNames: [], linkedRoots: [{ name: 'linked-parent', realPath: linked }],
      entries: [{ name: 'billion-context', packageDir: mapped, version: '0.1.214', declarer: join(profileLink, 'package.json'), scope: 'profile' }] }
    const resolvedHost = new Context()
    try {
      await resolvedHost.plugin(PluginPackages, { resolution }).await()
      for (const base of [real, profileLink, linked]) {
        const baseUrl = pathToFileURL(join(base, 'cordis.yml')).href
        const expected = resolvedHost.get('pluginPackages').packageOf('billion-context', baseUrl)
        assert.equal(expected.version, '0.1.214', 'published host resolver is the comparison oracle')
        const candidate = { options: { name: 'billion-context' }, disabled: false, fiber: { state: 2, runtime: { name: 'bili-native', callback() {} } }, parent: { tree: { ctx: { baseUrl } } } }
        const resolvedLookup = createBillionPeerLookup({ get: name => name === 'loader' ? { entries: () => [candidate] } : resolvedHost.get(name) })
        try {
          const found = await resolvedLookup.read()
          if (base === linked) assert.equal(found, undefined, 'complex linked-parent interception remains explicitly unknown')
          else assert.equal(found.version, expected.version, 'symlink and canonical profile paths agree with the actual host')
        } finally { resolvedLookup.dispose() }
      }
    } finally { await resolvedHost.fiber.dispose() }
  }
  console.log(JSON.stringify({ check: 'published host peer lifecycle', host: require('@deepseek-ai/dsh-plugin-manager/package.json').version,
    installedPackages: 329, fullInventoryMs: +scanMs.toFixed(3), cachedRefreshes: 1000, cachedRefreshMs: +lookupMs.toFixed(3), fullInventoryCallsDuringRefresh: scans }))
  console.log('[ok] #432 real host: hot install, disable/re-enable, startup failure/recovery, uninstall, cached refresh without inventory')
} finally { lookup.dispose(); await host.fiber.dispose(); rmSync(root, { recursive: true, force: true }) }
