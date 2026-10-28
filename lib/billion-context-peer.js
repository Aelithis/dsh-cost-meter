/** Targeted, asynchronous discovery of the *running* native billing peer.
 * Never call pluginManager.listBundles(): it synchronously scans every package.
 */
import { open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MAX_MANIFEST = 256 * 1024, MAX_CANDIDATES = 16, MAX_PATHS = 64
const within = (path, root) => {
  if (typeof path !== 'string' || typeof root !== 'string' || !root) return false
  const child = relative(root, path)
  return child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child)
}
const nativeSpecifier = name => name === 'billion-context' || name === 'billion-context/dsh'
const barePackage = name => /^(?:@[^/.][^/]*\/)?[^./][^/]*/.exec(name)?.[0]

async function readManifest(path) {
  let file
  try {
    file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0))
    const info = await file.stat()
    if (!info.isFile() || info.size > MAX_MANIFEST) throw Error('Invalid peer manifest size')
    // Bound both allocation and parsing even if the file grows after stat().
    const buffer = Buffer.alloc(Math.min(MAX_MANIFEST, info.size) + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > info.size || length > MAX_MANIFEST) throw Error('Peer manifest changed while reading')
    return JSON.parse(buffer.toString('utf8', 0, length))
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined
    throw error
  } finally { await file?.close() }
}

function snapshot(ctx) {
  const loader = ctx.get?.('loader')
  if (typeof loader?.entries !== 'function') return undefined
  const profile = ctx.get?.('profileContext') ?? ctx.get?.('pluginManager')?.profile
  const peers = []
  for (const entry of loader.entries()) {
    const name = entry.options?.name
    // The separately enabled compaction gate is not a running native proxy.
    if (entry.options?.group || entry.disabled || entry.fiber?.state !== 2 || typeof name !== 'string') continue
    if (!nativeSpecifier(name) && entry.fiber.runtime?.name !== 'bili-native') continue
    if (peers.length >= MAX_CANDIDATES) break
    peers.push({ entry, fiber: entry.fiber, name, base: entry.parent?.tree?.ctx?.baseUrl ?? ctx.baseUrl,
      installAnchor: profile?.installAnchor, profileDir: profile?.dir, resolution: ctx.get?.('pluginPackages')?.resolution })
  }
  return peers
}
const sameSource = (a, b) => a?.name === b?.name && a?.base === b?.base
  && a?.installAnchor === b?.installAnchor && a?.profileDir === b?.profileDir
const same = (a, b) => a?.entry === b?.entry && a?.fiber === b?.fiber && sameSource(a, b)

async function identify(peer) {
  const paths = new Set()
  const add = path => { if (paths.size < MAX_PATHS) paths.add(path) }
  const local = peer.name.startsWith('file:') || peer.name.startsWith('.') || isAbsolute(peer.name)
  if (local) {
    let url
    try { url = isAbsolute(peer.name) ? pathToFileURL(peer.name) : new URL(peer.name, peer.base) } catch { return null }
    if (url.protocol !== 'file:') return null
    let directory
    try { directory = dirname(await realpath(fileURLToPath(url))) } catch { return undefined }
    // File URL / relative / symlink installs use the nearest owning package.
    for (let depth = 0; depth < MAX_PATHS; depth++) {
      const info = await readManifest(join(directory, 'package.json'))
      if (info !== undefined) return info.name === 'billion-context' ? { version: typeof info.version === 'string' ? info.version.slice(0, 100) : '' } : null
      const parent = dirname(directory)
      if (parent === directory) break
      directory = parent
    }
    return undefined
  }
  const name = barePackage(peer.name)
  if (!name) return null
  // The runtime entry's parent, not the bundle declaration, controls Node
  // resolution. A profile-local package can override an installation bundle.
  // rc.3 publishes its in-memory interception table; only profile-local paths
  // precede that table. No packageOf/metaOf call (both can perform sync I/O).
  let basePath
  try { basePath = fileURLToPath(peer.base) } catch {}
  const resolution = peer.resolution
  let canonicalBase = basePath, canonicalProfile = resolution?.profileDir
  if (resolution && basePath) {
    try { canonicalBase = await realpath(basePath) } catch {
      // Loader base URLs can name virtual/not-yet-written config files. On
      // Windows their parent may use an 8.3 path while realpath(profile) uses
      // its long spelling; canonicalize the existing directory independently.
      try { canonicalBase = join(await realpath(dirname(basePath)), basename(basePath)) } catch {}
    }
    if (typeof canonicalProfile === 'string') try { canonicalProfile = await realpath(canonicalProfile) } catch {}
  }
  const profileRoots = [resolution?.profileDir, canonicalProfile].filter(Boolean)
  const scoped = basePath && profileRoots.some(root => within(basePath, root) || within(canonicalBase, root))
  // External linked parents have peer-dependency interception rules. Without
  // an exact package identity, retain unknown rather than guessing a version
  // from a different ancestor or invoking the host's synchronous resolver.
  if (!scoped && Array.isArray(resolution?.linkedRoots) && resolution.linkedRoots.some(root =>
    within(basePath, root.realPath) || within(canonicalBase, root.realPath))) return undefined
  const mapped = scoped && !resolution?.localPackageNames?.includes(name) && Array.isArray(resolution?.entries)
    ? resolution.entries.find(row => row.name === name) : null
  const anchors = [mapped && canonicalBase ? pathToFileURL(canonicalBase).href : peer.base, peer.profileDir && join(peer.profileDir, 'package.json'), peer.installAnchor]
  for (const anchor of new Set(anchors.filter(value => typeof value === 'string' && value))) {
    try {
      for (const directory of createRequire(anchor).resolve.paths(name) ?? []) {
        if (mapped && !profileRoots.some(root => within(directory, root))) continue
        add(join(directory, name, 'package.json'))
      }
    } catch {}
    if (mapped) break
  }
  if (mapped && typeof mapped.packageDir === 'string') add(join(mapped.packageDir, 'package.json'))
  for (const path of paths) {
    const info = await readManifest(path)
    if (info !== undefined) return info.name === 'billion-context' ? { version: typeof info.version === 'string' ? info.version.slice(0, 100) : '' } : null
  }
  return undefined
}

export function createBillionPeerLookup(ctx) {
  let cache = new WeakMap(), generation = 0, pending, stopped = false
  const invalidate = () => { generation++ }
  // A saved enable/upgrade can require restart. Cache successful metadata by
  // loaded module callback, not the changed on-disk version. A new fiber can
  // reuse Node's module cache; only a new module callback means a code reload.
  // Minimal embedders without runtime metadata fall back to fiber identity.
  // Failed reads retry, rather than making a transient error permanent.
  const read = () => {
    if (stopped) return Promise.resolve(undefined)
    if (pending) return pending
    pending = (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const epoch = generation, peers = snapshot(ctx)
        if (peers === undefined) return undefined // embedded hosts: trust adapter receipts, never invent absence
        let result = null, unknown = false
        for (const peer of peers) {
          const module = typeof peer.fiber.runtime?.callback === 'function' ? peer.fiber.runtime.callback : null
          const identity = module ?? peer.fiber
          let cached = cache.get(identity)
          if (!cached || !module && !sameSource(cached.peer, peer) || !cached.value && (cached.generation !== generation || Date.now() - cached.at >= 10000)) {
            let value
            try { value = await identify(peer) } catch { value = undefined }
            cached = { peer, value, at: Date.now(), generation }; cache.set(identity, cached)
          }
          if (cached.value === undefined) unknown = true
          if (cached.value) { result = { ...cached.value, enabled: true }; break }
        }
        if (stopped) return undefined
        const current = snapshot(ctx)
        if (epoch === generation && current?.length === peers.length && peers.every((peer, i) => same(peer, current[i]))) return result ?? (unknown ? undefined : null)
      }
      return undefined // a changing loader is unknown, not a false removal
    })().finally(() => { pending = undefined })
    return pending
  }
  return { read, invalidate, dispose() { stopped = true; generation++; cache = new WeakMap() } }
}
