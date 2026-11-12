// Reads and validates the committed complexity series (`docs/project/complexity.json`, written by
// `scripts/project/complexity.ts` at the repo root). Fails closed: anything off-shape is `null`.
import type { ComplexityPoint } from './types.ts'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const MAX_POINTS = 2000

const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9
    ? Math.round(v)
    : null

export function parseComplexity(
  text: string,
): { repo: string; series: ComplexityPoint[] } | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as { repo?: unknown; series?: unknown }
  if (typeof r.repo !== 'string' || !Array.isArray(r.series)) return null
  const series: ComplexityPoint[] = []
  for (const p of r.series.slice(-MAX_POINTS)) {
    if (p === null || typeof p !== 'object') continue
    const q = p as Record<string, unknown>
    const files = count(q.files)
    const lines = count(q.lines)
    const docLines = count(q.docLines)
    const churn = count(q.churn)
    if (
      typeof q.date !== 'string' ||
      !DATE.test(q.date) ||
      typeof q.sha !== 'string' ||
      files === null ||
      lines === null ||
      docLines === null ||
      churn === null
    )
      continue
    series.push({
      date: q.date,
      sha: q.sha.slice(0, 12),
      files,
      lines,
      docLines,
      churn,
    })
  }
  series.sort((a, b) => a.date.localeCompare(b.date))
  return { repo: r.repo.slice(0, 100), series }
}
