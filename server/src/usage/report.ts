// Aggregates over the usage records for the owner dashboard. Pure SQL over `usage_events`; nothing
// here sees conversation text because the table has none.
import type { UsageStore } from './store.ts'

export const MAX_REPORT_DAYS = 180

/** Outcomes that mean the request failed for a reason on our side (not a limit and not a refusal). */
const ERROR_OUTCOMES = [
  'llm_unavailable',
  'viewer_unavailable',
  'index_unavailable',
  'internal',
  'aborted',
]

export interface UsageTotals {
  requests: number
  cacheHits: number
  /** 0 to 1, over requests that reached the answer stage. */
  cacheHitRate: number
  inputTokens: number
  outputTokens: number
  /** Local model time. Requests that were not measured add nothing, see `gpuMeasured`. */
  gpuMs: number
  gpuMeasured: number
  costUsdEst: number
  avgTtftMs: number | null
  avgGenTps: number | null
  rateLimited: number
  budgetExceeded: number
  errors: number
  fallbacks: number
  activeViewers: number
}

export interface UsageDay {
  date: string
  requests: number
  inputTokens: number
  outputTokens: number
  gpuMs: number
  costUsdEst: number
}

export interface UsageModel {
  provider: string
  model: string
  requests: number
  inputTokens: number
  outputTokens: number
  gpuMs: number
  costUsdEst: number
  avgTtftMs: number | null
  avgGenTps: number | null
  fallbacks: number
}

export interface UsageViewer {
  viewerId: string
  handle: string | null
  role: string
  requests: number
  tokens: number
  gpuMs: number
}

export interface UsageOutcome {
  outcome: string
  count: number
}

export interface UsageReport {
  days: number
  from: string
  to: string
  generatedAt: string
  totals: UsageTotals
  daily: UsageDay[]
  models: UsageModel[]
  viewers: UsageViewer[]
  outcomes: UsageOutcome[]
  /** Records lost since this process booted (failed or dropped writes). */
  lostRecords: number
}

const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const round = (n: number | null, d = 0) =>
  n === null ? null : Math.round(n * 10 ** d) / 10 ** d

/** Whole UTC days, the last one being today. `days` is clamped to 1..MAX_REPORT_DAYS. */
export function buildReport(
  store: UsageStore,
  daysRaw: number,
  now = Date.now(),
): UsageReport {
  const days = Math.min(
    MAX_REPORT_DAYS,
    Math.max(1, Math.trunc(Number.isFinite(daysRaw) ? daysRaw : 30)),
  )
  const to = dayStr(now)
  const from = dayStr(now - (days - 1) * 86_400_000)

  const errorList = ERROR_OUTCOMES.map(() => '?').join(',')
  const t = store.query<{
    requests: number
    cache_hits: number
    answered: number
    input_tokens: number
    output_tokens: number
    gpu_ms: number
    gpu_measured: number
    cost: number
    ttft: number | null
    tps: number | null
    rate_limited: number
    budget_exceeded: number
    errors: number
    fallbacks: number
    viewers: number
  }>(
    `SELECT COUNT(*) requests,
            COALESCE(SUM(cache_hit),0) cache_hits,
            COALESCE(SUM(CASE WHEN outcome IN ('ok','cached','refused','truncated') THEN 1 ELSE 0 END),0) answered,
            COALESCE(SUM(input_tokens),0) input_tokens,
            COALESCE(SUM(output_tokens),0) output_tokens,
            COALESCE(SUM(gpu_ms),0) gpu_ms,
            COALESCE(SUM(CASE WHEN gpu_ms IS NOT NULL THEN 1 ELSE 0 END),0) gpu_measured,
            COALESCE(SUM(cost_usd_est),0) cost,
            AVG(ttft_ms) ttft,
            AVG(gen_tps) tps,
            COALESCE(SUM(CASE WHEN outcome='rate_limited' THEN 1 ELSE 0 END),0) rate_limited,
            COALESCE(SUM(CASE WHEN outcome='budget_exceeded' THEN 1 ELSE 0 END),0) budget_exceeded,
            COALESCE(SUM(CASE WHEN outcome IN (${errorList}) THEN 1 ELSE 0 END),0) errors,
            COALESCE(SUM(fallback_used),0) fallbacks,
            COUNT(DISTINCT viewer_id) viewers
       FROM usage_events WHERE day >= ? AND day <= ?`,
    ...ERROR_OUTCOMES,
    from,
    to,
  )[0]!

  const perDay = new Map(
    store
      .query<{
        day: string
        requests: number
        i: number
        o: number
        g: number
        c: number
      }>(
        `SELECT day, COUNT(*) requests, SUM(input_tokens) i, SUM(output_tokens) o,
                COALESCE(SUM(gpu_ms),0) g, COALESCE(SUM(cost_usd_est),0) c
           FROM usage_events WHERE day >= ? AND day <= ? GROUP BY day`,
        from,
        to,
      )
      .map((r) => [r.day, r]),
  )
  // Every day of the range appears, so a quiet day is a zero bar and not a gap.
  const daily: UsageDay[] = []
  for (let i = 0; i < days; i++) {
    const date = dayStr(now - (days - 1 - i) * 86_400_000)
    const r = perDay.get(date)
    daily.push({
      date,
      requests: r?.requests ?? 0,
      inputTokens: r?.i ?? 0,
      outputTokens: r?.o ?? 0,
      gpuMs: r?.g ?? 0,
      costUsdEst: r?.c ?? 0,
    })
  }

  const models = store
    .query<{
      provider: string
      model: string | null
      requests: number
      i: number
      o: number
      g: number
      c: number
      ttft: number | null
      tps: number | null
      fb: number
    }>(
      `SELECT provider, model, COUNT(*) requests, SUM(input_tokens) i, SUM(output_tokens) o,
              COALESCE(SUM(gpu_ms),0) g, COALESCE(SUM(cost_usd_est),0) c,
              AVG(ttft_ms) ttft, AVG(gen_tps) tps, COALESCE(SUM(fallback_used),0) fb
         FROM usage_events
        WHERE day >= ? AND day <= ? AND provider IS NOT NULL
        GROUP BY provider, model ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC`,
      from,
      to,
    )
    .map((r) => ({
      provider: r.provider,
      model: r.model ?? '',
      requests: r.requests,
      inputTokens: r.i,
      outputTokens: r.o,
      gpuMs: r.g,
      costUsdEst: r.c,
      avgTtftMs: round(r.ttft),
      avgGenTps: round(r.tps, 1),
      fallbacks: r.fb,
    }))

  const viewers = store
    .query<{
      viewer_id: string
      handle: string | null
      role: string
      requests: number
      tokens: number
      g: number
    }>(
      // The latest handle and role seen for the id: they can change over time.
      `SELECT viewer_id, handle, role, requests, tokens, g FROM (
         SELECT viewer_id, COUNT(*) requests,
                SUM(input_tokens + output_tokens) tokens, COALESCE(SUM(gpu_ms),0) g,
                (SELECT viewer_handle FROM usage_events u2 WHERE u2.viewer_id = u.viewer_id ORDER BY ts DESC LIMIT 1) handle,
                (SELECT role FROM usage_events u2 WHERE u2.viewer_id = u.viewer_id ORDER BY ts DESC LIMIT 1) role
           FROM usage_events u
          WHERE day >= ? AND day <= ? AND viewer_id IS NOT NULL
          GROUP BY viewer_id
       ) ORDER BY tokens DESC, requests DESC LIMIT 10`,
      from,
      to,
    )
    .map((r) => ({
      viewerId: r.viewer_id,
      handle: r.handle,
      role: r.role,
      requests: r.requests,
      tokens: r.tokens,
      gpuMs: r.g,
    }))

  const outcomes = store
    .query<{ outcome: string; n: number }>(
      `SELECT outcome, COUNT(*) n FROM usage_events WHERE day >= ? AND day <= ?
        GROUP BY outcome ORDER BY n DESC`,
      from,
      to,
    )
    .map((r) => ({ outcome: r.outcome, count: r.n }))

  return {
    days,
    from,
    to,
    generatedAt: new Date(now).toISOString(),
    totals: {
      requests: t.requests,
      cacheHits: t.cache_hits,
      cacheHitRate: t.answered > 0 ? t.cache_hits / t.answered : 0,
      inputTokens: t.input_tokens,
      outputTokens: t.output_tokens,
      gpuMs: t.gpu_ms,
      gpuMeasured: t.gpu_measured,
      costUsdEst: t.cost,
      avgTtftMs: round(t.ttft),
      avgGenTps: round(t.tps, 1),
      rateLimited: t.rate_limited,
      budgetExceeded: t.budget_exceeded,
      errors: t.errors,
      fallbacks: t.fallbacks,
      activeViewers: t.viewers,
    },
    daily,
    models,
    viewers,
    outcomes,
    lostRecords: store.writeErrors,
  }
}
