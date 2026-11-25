import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import * as zlib from 'node:zlib'
import { listSessionLogs, importLegacyHistory, backfillLegacyLedger, recomputeLedgerPricingBasis, repairForkSeed, replaySessionRecords } from '../lib/backfill.js'
import { createSessionRecordSource } from '../lib/session-storage-compat.js'
import { getSessionBilling, sessionUsageRecords, turnCostFromRecords } from '../lib/turn-cost.js'
import { runStartupImports } from '../lib/index.js'
import { sessionLogGeneration } from '../lib/session-log-files.js'
import { Ledger, sanitizeConfig, localDayKey } from '../lib/store.js'

const root = mkdtempSync(join(tmpdir(), 'cm-generations-'))
const at = Date.parse('2026-09-10T06:00:00Z'), date = localDayKey(at)
const rows = (id, input, createdAt = at - 1000, parentSession) => [
  { type: 'session', version: 3, id, createdAt, parentSession },
  { type: 'request/header', seq: 0, time: at, data: { header: { config: { provider: 'deepseek', model: 'test' } } } },
  { type: 'assistant/chunk', seq: 1, time: at + 1, data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: input, outputTokens: 10, cacheReadTokens: 2, cacheWriteTokens: 1, reasoningTokens: 0 } } } },
]
const config = sanitizeConfig({ peakEnabled: false, prices: { models: { test: { cacheHit: 1, cacheMiss: 10, output: 20 } } } })
const ledger = () => {
  const value = new Ledger(structuredClone(config), {}, '')
  value.scheduleWrite = () => {}
  return value
}
const save = (id, name, records, logRoot = root) => {
  const path = join(logRoot, 'project', id, name)
  mkdirSync(dirname(path), { recursive: true })
  const text = Buffer.from(records.map(r => JSON.stringify(r)).join('\n') + '\n')
  writeFileSync(path, name.endsWith('.zstd') ? zlib.zstdCompressSync(text) : text)
  return path
}
const previousHome = process.env.DSH_HOME
try {
  for (const name of ['session.v0.jsonl', 'session.v03.jsonl', 'session.V3.jsonl', 'session.v3.jsonl.tmp', 'session.v3.jsonl.zstd.bak', 'other.jsonl', 'session.v9007199254740992.jsonl']) assert.equal(sessionLogGeneration(name), null, name)
  save('multiple', 'session.jsonl', rows('multiple', 1))
  save('multiple', 'session.v2.jsonl', rows('multiple', 2))
  save('multiple', 'session.v3.jsonl', rows('multiple', 3))
  const newest = save('multiple', 'session.v10.jsonl', rows('multiple', 100))
  save('multiple', 'session.v999.jsonl.bak', rows('multiple', 999))
  let selected = newest
  if (typeof zlib.zstdCompressSync === 'function') selected = save('multiple', 'session.v10.jsonl.zstd', rows('multiple', 100))
  const plain = save('plain', 'session.v3.jsonl', rows('plain', 30))
  const legacy = save('legacy', 'session.jsonl', rows('legacy', 5))
  const snapshot = readFileSync(selected)
  assert.deepEqual(new Set(listSessionLogs(root)), new Set([selected, plain, legacy]))
  assert.deepEqual(listSessionLogs(root, new Set(['multiple'])), [selected])
  assert.deepEqual(listSessionLogs(join(root, 'missing')), [])
  const imported = ledger()
  assert.equal((await importLegacyHistory(imported, root)).sessions, 3)
  assert.equal(imported.days[date].input, 135, 'one latest generation per session, no prefix duplication')
  assert.equal(imported.days[date].calls, 3)
  assert.equal((await importLegacyHistory(imported, root)).sessions, 0, 'manual rerun is idempotent')
  const filled = ledger()
  filled.days = structuredClone(imported.days)
  delete filled.days[date].byProviderModel
  for (const row of filled.days[date].sessions) delete row.byProviderModel
  assert.ok((await backfillLegacyLedger(filled, root)).days > 0)
  assert.equal(filled.days[date].byProviderModel['deepseek:test'].input, 135)
  const oldCost = imported.days[date].cost
  imported.config.prices.models.test.cacheMiss = 20
  const changed = await recomputeLedgerPricingBasis(imported, root, undefined, null, true)
  assert.equal(changed.recostedSessions, 3, 'versioned sources also reach currency/price reconstruction')
  assert.ok(imported.days[date].cost > oldCost)
  assert.equal(imported.days[date].input, 135)
  const fork = ledger()
  save('fork', 'session.v3.jsonl', rows('fork', 70, at + 1000, 'parent'))
  fork.account({ input: 70, output: 10, cacheRead: 2, cacheWrite: 1, reasoning: 0 }, 'test', 'fork', at, 'deepseek')
  assert.equal((await repairForkSeed(fork, root)).sessions, 1)
  assert.equal(fork.days[date].calls, 0, 'fork seed cleanup sees the new filename too')
  assert.deepEqual(readFileSync(selected), snapshot, 'all billing paths keep host logs read-only')
  const home = join(root, 'dsh-v4')
  process.env.DSH_HOME = home
  const forkLogs = join(home, 'sessions'), id = 'jsonl-fork'
  const header = { type: 'session', id, version: 4, isSeeded: true, createdAt: at }
  const boundary = seq => ({ type: 'session/end-seed', seq, time: at, data: { inherited: true } })
  const turn = (seq, turn, input, time = at) => [
    { type: 'turn/start', seq, time, data: { turn } },
    { type: 'step/start', seq: seq + 1, time, data: { turn, step: 1 } },
    { type: 'assistant/message', seq: seq + 2, time, data: { turn, step: 1, usage: { inputTokens: input } } },
    { type: 'turn/end', seq: seq + 3, time, data: { turn } },
  ]
  const route = rows(id, 0)[1]
  const nested = [header, route, ...turn(1, 1, 100), boundary(5), ...turn(6, 2, 50), boundary(10),
    ...turn(11, 3, 20), { type: 'session/end-seed', seq: 15, time: at, data: {} }]
  const path = save(id, 'session.v4.jsonl', nested, forkLogs)
  const original = readFileSync(path)
  const source = createSessionRecordSource(null, forkLogs)
  const logs = await source.readRecords(id)
  assert.equal(logs[0].seedLength, undefined)
  const byModel = result => result.days[date]['deepseek:test'].input
  assert.equal(byModel(replaySessionRecords(logs, config)), 20, 'nested forks exclude every inherited turn')
  const skewed = logs.map(row => row.seq >= 11 ? { ...row, time: at - 1 } : row)
  const own = replaySessionRecords(skewed, config, null, true)
  assert.equal(byModel(own), 20, 'own events before createdAt are recognized by sequence')
  assert.equal(own.samples.find(row => !row.seed).pricedAtMs, at - 1)

  const oldSource = {
    listSessions: source.listSessions,
    readRecords: async () => logs.filter(row => row.type !== 'session/end-seed')
      .map(row => row === logs[0] ? { ...row, isSeeded: undefined } : row),
  }
  const persisted = new Ledger(structuredClone(config), {}, join(home, 'billing.json'))
  try {
    await importLegacyHistory(persisted, forkLogs, oldSource)
    persisted.config.legacyAutoImportedAt = at + 1
    persisted.flush(5000)
    assert.equal(persisted.days[date].input, 170)
    const unmatched = ledger()
    unmatched.days = structuredClone(persisted.days)
    unmatched.days[date].sessions[0].input++
    assert.equal((await importLegacyHistory(unmatched, forkLogs)).skipped, 1)
    assert.equal(unmatched.days[date].sessions[0].input, 171, 'unmatched rows are retained')
    await runStartupImports(persisted, forkLogs, source)
    assert.ok(persisted.migrations.includes('dsh-023-fork-prefix-v1'))
    assert.equal(persisted.days[date].input, 20)
    assert.equal(persisted.days[date].calls, 1)
    assert.equal((await importLegacyHistory(persisted, forkLogs)).forks, undefined)
    assert.equal(persisted.days[date].input, 20)

    const cached = await sessionUsageRecords(null, id, persisted.path)
    assert.equal(turnCostFromRecords(cached, config, 6, 9).inherited, true)
    assert.equal(turnCostFromRecords(cached, config, 11, 14).calls[0].rows.find(row => row.bucket === 'input').tokens, 20)
    const detailed = await getSessionBilling(persisted, null, { sessionId: id, from: date, to: date })
    assert.deepEqual(detailed.turns.map(row => row.turn), [3], 'detailed billing excludes empty inherited turn entries')
    assert.deepEqual(readFileSync(path), original)
  } finally {
    await persisted.close()
  }
  console.log('版本化会话日志：代际选择、历史入口、嵌套 fork、旧账修复及幂等回归通过')
} finally {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  assert.equal(dirname(root), tmpdir())
  rmSync(root, { recursive: true, force: true })
}
