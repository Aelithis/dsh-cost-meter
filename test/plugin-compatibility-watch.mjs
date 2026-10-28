import assert from 'node:assert/strict'
import { inspectPlugin, comparePlugin, notify, targets } from '../scripts/watch-plugin-compatibility.mjs'

assert.deepEqual(targets, ['billion-context', 'dsh-codex-subscription', 'dsh-codex-connect'])
const fixture = `
function registerSubscriptionTransport(){return '/api/codex-subscription/usage'}
function createSubscriptionRpcHandler(endpoint){if(endpoint === "usage")return {rateLimits:[]}}
function parseCodexUsage(){return {rateLimits:[{remainingPercent:80,windowSeconds:18000}]}}
function createCodexUsageReader(){return {read:()=>({force:false})}}
`
const pkg = { name: 'dsh-codex-subscription', version: '3.0.1', main: './lib/index.js' }
const inspect = source => inspectPlugin(pkg.name, pkg, path => { assert.equal(path, 'package/lib/index.js'); return source })
const baseline = inspect(fixture)
assert.deepEqual(baseline.problems, [])
assert.equal(inspect(fixture.replaceAll('return', '/* formatting */ return')).interfaceHash, baseline.interfaceHash, 'comments do not create interface changes')
const unchanged = comparePlugin(inspect(fixture), baseline)
assert.equal(unchanged.versionChanged, false); assert.equal(unchanged.interfaceChanged, false)
const changed = comparePlugin(inspect(fixture.replace('remainingPercent:80', 'remainingPercent:90')), baseline)
assert.deepEqual(changed.changedFunctions, ['parseCodexUsage'])
assert.equal(changed.interfaceChanged, true)
const readerChanged = comparePlugin(inspect(fixture.replace('force:false', 'force:true')), baseline)
assert.deepEqual(readerChanged.changedFunctions, ['createCodexUsageReader'], 'reader lifecycle drift is detected even when parser/RPC signatures stay unchanged')
assert.equal(readerChanged.interfaceChanged, true)
assert.deepEqual(readerChanged.problems, [], 'static fields can still match despite changed reader behavior')
assert.ok(inspect(fixture.replace('function createCodexUsageReader', 'function removedReader')).problems.some(item => item.includes('createCodexUsageReader')))

const broken = comparePlugin(inspect(fixture.replaceAll('remainingPercent', 'remainingQuota')), baseline)
assert.match(broken.problems.join(' '), /remainingPercent/)
assert.ok(inspect(fixture.replace('function registerSubscriptionTransport', 'function newTransport')).problems.some(item => item.includes('registerSubscriptionTransport')))
assert.throws(() => inspectPlugin(pkg.name, { ...pkg, main: '../../unrelated.js' }, () => ''), /invalid package entry/)

let issue, creates = 0, updates = 0
const api = { find: async marker => issue?.body.includes(marker) ? issue : null,
  create: async value => { creates++; issue = { number: 1, ...value } }, update: async (_id, value) => { updates++; issue = { number: 1, ...value } } }
const known = { [pkg.name]: baseline }
await notify([unchanged], known, api)
assert.equal(creates, 0, 'unchanged versions stay quiet')
await notify([changed], known, api)
assert.equal(creates, 1)
await notify([changed], known, api)
assert.equal(updates, 0, 'same observation never repeats an issue or notification')
await notify([broken], known, api)
assert.equal(updates, 1, 'new interface findings update the same tracking issue')
await notify([{ name: pkg.name, problems: [], error: 'registry HTTP 503' }], known, api)
assert.equal(updates, 2, 'incomplete checks are reported instead of called compatible')
assert.match(issue.body, /未完成/)
console.log('[ok] plugin compatibility watcher: structural changes, formatting stability, invalid entries, one issue and quiet unchanged runs')
