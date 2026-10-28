// Inspect published packages as data. Never import upstream code or run its scripts.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, tokenizer } from 'acorn'
import { patchBillionRuntime } from '../lib/billion-context-patch.js'

export const targets = ['billion-context', 'dsh-codex-subscription', 'dsh-codex-connect']
const baselinePath = new URL('../docs/plugin-compatibility-baseline.json', import.meta.url)
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const canonical = source => [...tokenizer(source, { ecmaVersion: 'latest' })].map(token => [token.type.label, typeof token.value === 'bigint' ? String(token.value) : token.value])
const entry = value => typeof value === 'string' ? value : value?.default
const member = path => {
  if (typeof path !== 'string' || !/^(?:\.\/)?[\w./-]+$/.test(path) || path.split('/').includes('..') || path.startsWith('/')) throw Error('invalid package entry')
  return 'package/' + path.replace(/^\.\//, '')
}
export function inspectPlugin(name, pkg, read) {
  const problems = [], contracts = {}, functions = {}
  const inspect = (path, names) => {
    const source = read(member(path))
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
    for (const name of names) {
      const fn = ast.body.map(node => node.type === 'ExportNamedDeclaration' ? node.declaration : node).find(node => node?.type === 'FunctionDeclaration' && node.id?.name === name)
      if (!fn) problems.push('function missing: ' + name)
      else functions[name] = hash(canonical(source.slice(fn.start, fn.end)))
    }
    return source
  }
  const required = (source, values) => { for (const value of values) if (!source.includes(value)) problems.push('contract marker missing: ' + value) }
  if (name === 'billion-context') {
    for (const [kind, file, names] of [['proxy', 'dist/index.js', ['fetchWithTimeout', 'handle', 'requestSummaryBody', 'fetchWithRetry']], ['native', 'dist/agent/dsh-native.js', ['installNativeFetchIntercept']]]) {
      const source = inspect(file, names)
      try { contracts[kind] = patchBillionRuntime(source, kind).capabilities }
      catch (error) { problems.push(kind + ': ' + error.message) }
    }
  } else {
    const source = inspect(pkg.main ?? entry(pkg.exports?.['.']), name === 'dsh-codex-subscription'
      ? ['registerSubscriptionTransport', 'createSubscriptionRpcHandler', 'parseCodexUsage', 'createCodexUsageReader']
      : ['registerOpenAICodexAuthRoutes', 'parseOpenAICodexUsage'])
    required(source, ['rateLimits', 'remainingPercent', 'windowSeconds'])
    if (name === 'dsh-codex-subscription') required(source, ['codex-subscription/', '/api/', '"usage"'])
    else required(source, ['/plugins/dsh-openai-codex/auth/status', 'signed-in'])
    contracts.fields = ['rateLimits', 'remainingPercent', 'windowSeconds']
  }
  const signature = { main: pkg.main, exports: pkg.exports, compatibility: pkg.dsh?.compatibility,
    hostDependencies: Object.fromEntries(Object.entries({ ...pkg.dependencies, ...pkg.peerDependencies }).filter(([name]) => name.startsWith('@deepseek-ai/')).sort()), contracts, functions }
  return { name, version: pkg.version, signature, interfaceHash: hash(signature), problems }
}
export function comparePlugin(current, previous) {
  return { ...current, versionChanged: current.version !== previous?.version, interfaceChanged: current.interfaceHash !== previous?.interfaceHash,
    changedFunctions: Object.keys({ ...previous?.signature?.functions, ...current.signature.functions }).filter(name => previous?.signature?.functions?.[name] !== current.signature.functions[name]) }
}
async function download(url, maxBytes) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'registry.npmjs.org') throw Error('unexpected registry origin')
  const response = await fetch(parsed, { signal: AbortSignal.timeout(60_000), redirect: 'error' })
  if (!response.ok) throw Error('registry HTTP ' + response.status)
  const chunks = []; let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > maxBytes) throw Error('registry size limit exceeded')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
export async function inspectLatest(name, directory) {
  const pkg = JSON.parse(await download('https://registry.npmjs.org/' + name + '/latest', 4 * 1024 * 1024))
  if (pkg.name !== name || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version)) throw Error('invalid registry metadata')
  const bytes = await download(pkg.dist.tarball, 64 * 1024 * 1024)
  const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64')
  if (integrity !== pkg.dist.integrity) throw Error('package integrity mismatch')
  const archive = resolve(directory, name + '.tgz'); writeFileSync(archive, bytes)
  const read = path => execFileSync('tar', ['-xOf', archive, path], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] })
  const packaged = JSON.parse(read('package/package.json'))
  if (packaged.name !== name || packaged.version !== pkg.version) throw Error('package identity mismatch')
  return { ...inspectPlugin(name, packaged, read), integrity, packageUrl: pkg.dist.tarball }
}
export function observationId(row) {
  return hash([row.version, row.interfaceHash, row.problems, row.error])
}
export function reportBody(row, baseline, runUrl) {
  const marker = '<!-- dsh-cost-meter:compatibility:' + row.name + ' -->'
  return [marker, '<!-- observation:' + observationId(row) + ' -->', '## 上游插件兼容性检查', '',
    '- 插件：`' + row.name + '`', '- 基线版本：`' + (baseline?.version ?? '无') + '`', '- 当前 npm latest：`' + (row.version ?? '查询失败') + '`',
    '- 接口指纹变化：' + (row.interfaceChanged ? '是' : '否'), '- 静态契约检查：' + (row.error ? '未完成' : row.problems.length ? '需要修复或核对' : '匹配'),
    ...(row.changedFunctions?.length ? ['- 变化的接入函数：' + row.changedFunctions.map(name => '`' + name + '`').join('、')] : []),
    ...row.problems.map(problem => '- ' + problem), ...(row.error ? ['- 检查错误：' + row.error] : []), '',
    '这项检查读取公开发布包，不执行上游代码。静态契约匹配不代表全部运行行为一致；更新版本或接口后，仍需跑相应兼容回归，再人工更新基线。', '',
    '[npm 版本](https://www.npmjs.com/package/' + row.name + '?activeTab=versions)', runUrl ? '[运行日志与报告](' + runUrl + ')' : ''].join('\n')
}
export async function notify(rows, baseline, api) {
  for (const row of rows.filter(row => row.versionChanged || row.interfaceChanged || row.error || row.problems.length)) {
    const marker = '<!-- dsh-cost-meter:compatibility:' + row.name + ' -->'
    const existing = await api.find(marker)
    if (existing?.body?.includes('<!-- observation:' + observationId(row) + ' -->')) continue
    const body = reportBody(row, baseline[row.name], api.runUrl)
    const title = '[兼容性监控] ' + row.name + ': ' + (row.error ? '检查失败' : row.problems.length ? '接口需要核对' : row.version)
    if (existing) await api.update(existing.number, { title, body })
    else await api.create({ title, body })
  }
}
async function githubApi() {
  const token = process.env.GITHUB_TOKEN, repository = process.env.GITHUB_REPOSITORY
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw Error('GitHub workflow credentials missing')
  const call = async (path, method = 'GET', body) => {
    const response = await fetch('https://api.github.com/repos/' + repository + path, { method,
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw Error('GitHub HTTP ' + response.status)
    return response.json()
  }
  const open = []
  for (let page = 1; ; page++) {
    const items = await call('/issues?state=open&per_page=100&page=' + page)
    open.push(...items.filter(item => !item.pull_request && item.user?.login === 'github-actions[bot]'))
    if (items.length < 100) break
  }
  return { runUrl: 'https://github.com/' + repository + '/actions/runs/' + process.env.GITHUB_RUN_ID,
    find: async marker => open.find(issue => issue.body?.includes(marker)),
    update: (number, body) => call('/issues/' + number, 'PATCH', body), create: body => call('/issues', 'POST', body) }
}
async function main() {
  const directory = resolve('.tmp-compatibility-watch'); mkdirSync(directory, { recursive: true })
  const record = process.argv.includes('--record')
  let baseline = {}
  try { baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).plugins } catch { if (!record) throw Error('compatibility baseline missing') }
  const rows = []
  for (const name of targets) {
    try { rows.push(comparePlugin(await inspectLatest(name, directory), baseline[name])) }
    catch (error) { rows.push({ name, problems: [], error: String(error.message).slice(0, 240) }) }
  }
  writeFileSync(resolve(directory, 'report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), rows }, null, 2) + '\n')
  console.log(JSON.stringify(rows.map(({ name, version, problems, error, versionChanged, interfaceChanged }) => ({ name, version, problems, error, versionChanged, interfaceChanged })), null, 2))
  if (record) {
    if (rows.some(row => row.error || row.problems.length)) throw Error('cannot record an incomplete or incompatible baseline; see report')
    writeFileSync(baselinePath, JSON.stringify({ recordedAt: new Date().toISOString(), plugins: Object.fromEntries(rows.map(({ name, version, signature, interfaceHash, integrity }) => [name, { version, signature, interfaceHash, integrity }])) }, null, 2) + '\n')
  }
  const report = rows.map(row => reportBody(row, baseline[row.name], '')).join('\n\n---\n\n')
  writeFileSync(resolve(directory, 'report.md'), report + '\n')
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  if (process.argv.includes('--notify')) await notify(rows, baseline, await githubApi())
  if (rows.some(row => row.error || row.problems.length)) process.exitCode = 1
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
