// Complexity metric per repo: files, source lines, doc lines and churn, as a time series committed
// in `docs/project/complexity.json` (the Proyecto page reads it from GitHub).
//
//   bun run complexity                       # add (or replace) the point for HEAD's date
//   bun run complexity -- --backfill         # one point per ISO week of history, plus HEAD
//   bun run complexity -- --backfill --step daily
//   bun run complexity -- --cwd <other repo> --out docs/project/complexity.json
//
// Everything comes from git objects (`ls-tree`, `cat-file --batch`, `log --numstat`), never from the
// working tree, so a dirty checkout does not change the numbers. Dates are UTC.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export interface Point {
  date: string
  sha: string
  files: number
  lines: number
  docLines: number
  /** Lines added + deleted in the 7 days up to `date`. */
  churn: number
}

export interface Series {
  version: 1
  repo: string
  series: Point[]
}

const CODE_EXT = new Set([
  'ts',
  'tsx',
  'js',
  'mjs',
  'cjs',
  'css',
  'html',
  'sh',
  'yml',
  'yaml',
  'json',
])
const DOC_EXT = new Set(['md'])
/** Generated, vendored or copied: they say nothing about how complex our own code is. */
const SKIP_DIR =
  /(^|\/)(node_modules|dist|\.git|\.claude|content\/generated|public)\//
const SKIP_FILE =
  /(^|\/)(bun\.lock|package-lock\.json|tokens\.css|tokens\.json)$|\.min\.(js|css)$|\.lock$/

export type Kind = 'code' | 'doc'

/** What a path counts as, or `null` when it is not measured. */
export function classify(path: string): Kind | null {
  if (SKIP_DIR.test(path) || SKIP_FILE.test(path)) return null
  const ext = path.split('.').at(-1)?.toLowerCase() ?? ''
  if (CODE_EXT.has(ext)) return 'code'
  if (DOC_EXT.has(ext)) return 'doc'
  return null
}

/** Lines of a text blob (a final line without `\n` counts). Binary content (NUL) counts as 0. */
export function countLines(buf: Uint8Array): number {
  if (buf.length === 0) return 0
  let n = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0) return 0
    if (buf[i] === 10) n++
  }
  return buf[buf.length - 1] === 10 ? n : n + 1
}

const DAY = 86_400_000
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export interface ChurnEntry {
  ms: number
  lines: number
}

/** Lines changed in the 7 days ending at the end of `date`. */
export function churnUpTo(
  entries: readonly ChurnEntry[],
  date: string,
): number {
  const end = Date.parse(`${date}T00:00:00Z`) + DAY
  const start = end - 7 * DAY
  let sum = 0
  for (const e of entries) if (e.ms >= start && e.ms < end) sum += e.lines
  return sum
}

/** ISO year-week key (`2026-W46`) of a UTC date. */
export function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3) // Thursday of this week
  const year = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const week =
    1 +
    Math.round(
      ((d.getTime() - jan4.getTime()) / DAY -
        3 +
        ((jan4.getUTCDay() + 6) % 7)) /
        7,
    )
  return `${year}-W${String(week).padStart(2, '0')}`
}

export interface CommitRef {
  sha: string
  ms: number
}

/** The last commit of each period (week or day), oldest first. Input in any order. */
export function samplePoints(
  commits: readonly CommitRef[],
  step: 'weekly' | 'daily',
): CommitRef[] {
  const last = new Map<string, CommitRef>()
  for (const c of [...commits].sort((a, b) => a.ms - b.ms)) {
    const d = dayOf(c.ms)
    last.set(step === 'daily' ? d : weekKey(d), c)
  }
  return [...last.values()]
}

/** Replaces points with the same date, keeps the rest, sorted. */
export function mergeSeries(
  existing: readonly Point[],
  incoming: readonly Point[],
): Point[] {
  const byDate = new Map(existing.map((p) => [p.date, p]))
  for (const p of incoming) byDate.set(p.date, p)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// ---- git ---------------------------------------------------------------------------------------

function git(cwd: string, args: string[], input?: Uint8Array): Buffer {
  const r = Bun.spawnSync(['git', ...args], {
    cwd,
    stdin: input,
    stdout: 'pipe',
    stderr: 'pipe',
    maxBuffer: 512 * 1024 * 1024,
  })
  if (r.exitCode !== 0)
    throw new Error(`git ${args[0]} failed: ${r.stderr.toString().trim()}`)
  return r.stdout
}

/** Line counts of blobs, via one `cat-file --batch`. */
function blobLines(cwd: string, shas: string[]): Map<string, number> {
  const out = new Map<string, number>()
  if (shas.length === 0) return out
  const buf = git(
    cwd,
    ['cat-file', '--batch'],
    new TextEncoder().encode(shas.join('\n') + '\n'),
  )
  let pos = 0
  while (pos < buf.length) {
    const nl = buf.indexOf(10, pos)
    if (nl < 0) break
    const [sha, , sizeText] = buf.subarray(pos, nl).toString('utf8').split(' ')
    const size = Number(sizeText)
    if (!sha || !Number.isFinite(size)) break
    const start = nl + 1
    out.set(sha, countLines(buf.subarray(start, start + size)))
    pos = start + size + 1
  }
  return out
}

export interface Snapshot {
  files: number
  lines: number
  docLines: number
}

export function snapshot(
  cwd: string,
  commit: string,
  cache: Map<string, number>,
): Snapshot {
  const tree = git(cwd, ['ls-tree', '-r', '--full-tree', commit]).toString(
    'utf8',
  )
  const entries: { sha: string; kind: Kind }[] = []
  for (const line of tree.split('\n')) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line)
    if (!m) continue
    const kind = classify(m[2]!)
    if (kind) entries.push({ sha: m[1]!, kind })
  }
  const missing = [...new Set(entries.map((e) => e.sha))].filter(
    (s) => !cache.has(s),
  )
  for (const [sha, n] of blobLines(cwd, missing)) cache.set(sha, n)
  const snap: Snapshot = { files: 0, lines: 0, docLines: 0 }
  for (const e of entries) {
    snap.files++
    if (e.kind === 'code') snap.lines += cache.get(e.sha) ?? 0
    else snap.docLines += cache.get(e.sha) ?? 0
  }
  return snap
}

/** Every non-merge commit reachable from `ref`: author time and measured lines changed. */
export function history(
  cwd: string,
  ref: string,
): { commits: CommitRef[]; churn: ChurnEntry[] } {
  const text = git(cwd, [
    'log',
    ref,
    '--no-renames',
    '--numstat',
    '--format=@@%H %at',
  ]).toString('utf8')
  const commits: CommitRef[] = []
  const churn: ChurnEntry[] = []
  let cur: ChurnEntry | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('@@')) {
      const [sha, at] = line.slice(2).split(' ')
      const ms = Number(at) * 1000
      commits.push({ sha: sha!, ms })
      cur = { ms, lines: 0 }
      churn.push(cur)
      continue
    }
    const m = /^(\d+)\t(\d+)\t(.+)$/.exec(line)
    if (m && cur && classify(m[3]!)) cur.lines += Number(m[1]) + Number(m[2])
  }
  return { commits, churn }
}

function repoName(cwd: string): string {
  try {
    const url = git(cwd, ['remote', 'get-url', 'origin'])
      .toString('utf8')
      .trim()
    const m = /[:/]([^/:]+\/[^/]+?)(\.git)?$/.exec(url)
    if (m) return m[1]!
  } catch {
    // no remote
  }
  return resolve(cwd).split(/[\\/]/).at(-1) ?? 'repo'
}

export function measure(opts: {
  cwd: string
  ref: string
  backfill: boolean
  step: 'weekly' | 'daily'
}): Point[] {
  const { commits, churn } = history(opts.cwd, opts.ref)
  if (commits.length === 0) return []
  const head = commits[0]! // `git log` lists the tip first
  const chosen = opts.backfill ? samplePoints(commits, opts.step) : []
  // HEAD always gets a point, and wins over the last sample of its own period.
  const targets = [
    ...chosen.filter((c) => dayOf(c.ms) !== dayOf(head.ms)),
    head,
  ]
  const cache = new Map<string, number>()
  return targets.map((c) => {
    const date = dayOf(c.ms)
    return {
      date,
      sha: c.sha.slice(0, 12),
      ...snapshot(opts.cwd, c.sha, cache),
      churn: churnUpTo(churn, date),
    }
  })
}

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const cwd = resolve(arg(args, '--cwd') ?? '.')
  const out = resolve(cwd, arg(args, '--out') ?? 'docs/project/complexity.json')
  const step = arg(args, '--step') === 'daily' ? 'daily' : 'weekly'
  const points = measure({
    cwd,
    ref: arg(args, '--ref') ?? 'HEAD',
    backfill: args.includes('--backfill'),
    step,
  })
  let existing: Series | null = null
  try {
    existing = JSON.parse(readFileSync(out, 'utf8')) as Series
  } catch {
    // first run
  }
  const series: Series = {
    version: 1,
    repo: arg(args, '--repo') ?? existing?.repo ?? repoName(cwd),
    series: mergeSeries(existing?.series ?? [], points),
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(series, null, 2) + '\n')
  const last = series.series.at(-1)
  console.log(
    `${series.repo}: ${series.series.length} points, last ${last?.date} ` +
      `(${last?.files} files, ${last?.lines} lines, ${last?.docLines} doc lines, churn ${last?.churn})`,
  )
}
