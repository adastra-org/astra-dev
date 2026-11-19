// The owner dashboard: aggregates over the usage records, and who may read them.
import { describe, expect, test } from 'bun:test'
import { UsageStore, type UsageRecord } from '../src/usage/store.ts'
import { ANONYMOUS, type ViewerPort } from '../src/viewer.ts'
import { harness } from './helpers.ts'

const NOW = Date.UTC(2026, 10, 12, 15, 0, 0)
const DAY = 86_400_000

const rec = (over: Partial<UsageRecord> = {}): UsageRecord => ({
  ts: NOW,
  requestId: crypto.randomUUID(),
  route: 'chat',
  viewerId: 'u1',
  viewerHandle: 'ana',
  role: 'subscriber',
  provider: 'deepseek',
  model: 'deepseek-flash',
  fallbackUsed: false,
  inputTokens: 1000,
  outputTokens: 200,
  ttftMs: 400,
  durationMs: 2000,
  genTps: 50,
  outcome: 'ok',
  cacheHit: false,
  gpuMs: null,
  costUsdEst: 0.0002,
  ...over,
})

function seeded() {
  const s = new UsageStore(':memory:')
  s.record(rec())
  s.record(rec({ viewerId: 'u2', viewerHandle: 'bob', inputTokens: 500 }))
  s.record(
    rec({
      ts: NOW - 2 * DAY,
      provider: 'local',
      model: 'lfm2.5',
      fallbackUsed: true,
      gpuMs: 3000,
      costUsdEst: null,
      ttftMs: 1000,
      genTps: 100,
    }),
  )
  s.record(
    rec({
      outcome: 'cached',
      cacheHit: true,
      provider: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      ttftMs: null,
      genTps: null,
      costUsdEst: null,
    }),
  )
  s.record(
    rec({
      outcome: 'rate_limited',
      provider: null,
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      ttftMs: null,
      genTps: null,
      costUsdEst: null,
    }),
  )
  s.record(rec({ outcome: 'llm_unavailable', inputTokens: 0, outputTokens: 0 }))
  s.record(rec({ ts: NOW - 40 * DAY })) // outside a 30-day window
  return s
}

describe('buildReport', () => {
  test('totals, fallbacks, GPU, cache rate, limits and errors', () => {
    const r = seeded().report(30, NOW)
    expect(r.days).toBe(30)
    expect(r.to).toBe('2026-11-12')
    expect(r.from).toBe('2026-10-14')
    expect(r.totals.requests).toBe(6)
    expect(r.totals.inputTokens).toBe(1000 + 500 + 1000 + 0 + 0 + 0)
    expect(r.totals.outputTokens).toBe(200 * 3)
    expect(r.totals.gpuMs).toBe(3000)
    expect(r.totals.gpuMeasured).toBe(1)
    expect(r.totals.fallbacks).toBe(1)
    expect(r.totals.rateLimited).toBe(1)
    expect(r.totals.errors).toBe(1)
    expect(r.totals.activeViewers).toBe(2)
    expect(r.totals.cacheHits).toBe(1)
    // answered = ok x3 + cached x1 (rate_limited and llm_unavailable did not answer)
    expect(r.totals.cacheHitRate).toBeCloseTo(1 / 4, 5)
    expect(r.totals.costUsdEst).toBeCloseTo(0.0006, 6)
    expect(r.totals.avgTtftMs).not.toBeNull()
  })

  test('every day of the range appears, quiet days as zeros, last day is today', () => {
    const r = seeded().report(7, NOW)
    expect(r.daily).toHaveLength(7)
    expect(r.daily.at(-1)!.date).toBe('2026-11-12')
    expect(r.daily[0]!.date).toBe('2026-11-06')
    expect(r.daily.find((d) => d.date === '2026-11-11')!.requests).toBe(0)
    expect(r.daily.find((d) => d.date === '2026-11-10')!.requests).toBe(1)
    expect(r.daily.reduce((n, d) => n + d.requests, 0)).toBe(r.totals.requests)
  })

  test('models: grouped by provider and model, biggest first, rejections without model excluded', () => {
    const r = seeded().report(30, NOW)
    expect(r.models.map((m) => `${m.provider}/${m.model}`)).toEqual([
      'deepseek/deepseek-flash',
      'local/lfm2.5',
    ])
    const local = r.models[1]!
    expect(local.gpuMs).toBe(3000)
    expect(local.fallbacks).toBe(1)
    expect(local.avgGenTps).toBe(100)
  })

  test('top viewers by tokens, with the id, handle and role', () => {
    const r = seeded().report(30, NOW)
    expect(r.viewers[0]).toMatchObject({
      viewerId: 'u1',
      handle: 'ana',
      role: 'subscriber',
    })
    expect(r.viewers.map((v) => v.viewerId)).toEqual(['u1', 'u2'])
    expect(r.viewers[0]!.tokens).toBeGreaterThan(r.viewers[1]!.tokens)
  })

  test('outcomes are counted, and the window excludes older records', () => {
    const r = seeded().report(30, NOW)
    const by = Object.fromEntries(r.outcomes.map((o) => [o.outcome, o.count]))
    expect(by).toMatchObject({
      ok: 3,
      cached: 1,
      rate_limited: 1,
      llm_unavailable: 1,
    })
    expect(seeded().report(90, NOW).totals.requests).toBe(7)
  })

  test('an empty store gives zeros and nulls, not NaN', () => {
    const r = new UsageStore(':memory:').report(30, NOW)
    expect(r.totals.requests).toBe(0)
    expect(r.totals.cacheHitRate).toBe(0)
    expect(r.totals.avgTtftMs).toBeNull()
    expect(r.models).toEqual([])
    expect(r.daily).toHaveLength(30)
  })

  test('days is clamped to 1..180', () => {
    const s = new UsageStore(':memory:')
    expect(s.report(0, NOW).days).toBe(1)
    expect(s.report(9999, NOW).days).toBe(180)
    expect(s.report(Number.NaN, NOW).days).toBe(30)
  })
})

describe('aiUsage over GraphQL: owner only', () => {
  const query = { query: '{ aiUsage(days: 7) { days totals { requests } } }' }
  const call = async (
    opts: Parameters<typeof harness>[0],
  ): Promise<{ data?: any; errors?: { extensions?: { code?: string } }[] }> => {
    const h = await harness(opts)
    const r = await h.call('/graphql', { json: query })
    return r.json()
  }
  const signedIn = (role: 'public' | 'subscriber'): ViewerPort => ({
    resolve: () =>
      Promise.resolve({
        id: 'u',
        handle: 'u',
        role,
        emailVerified: true,
        entitlements: [],
      }),
  })

  test('anonymous: unauthenticated', async () => {
    const r = await call({
      viewers: { resolve: () => Promise.resolve(ANONYMOUS) },
      usage: seeded(),
    })
    expect(r.errors?.[0]?.extensions?.code).toBe('unauthenticated')
  })

  test('subscriber, staff: owner_required, never data', async () => {
    for (const role of ['subscriber', 'staff'] as const) {
      const r = await call({ role, usage: seeded() })
      expect(r.errors?.[0]?.extensions?.code).toBe('owner_required')
      expect(r.data?.aiUsage ?? null).toBeNull()
    }
    const r = await call({ viewers: signedIn('public'), usage: seeded() })
    expect(r.errors?.[0]?.extensions?.code).toBe('owner_required')
  })

  test('owner: gets the aggregates', async () => {
    const store = seeded()
    const h = await harness({ role: 'owner', usage: store })
    const r = await (await h.call('/graphql', { json: query })).json()
    expect(r.errors).toBeUndefined()
    expect(r.data.aiUsage.days).toBe(7)
    expect(r.data.aiUsage.totals.requests).toBe(6)
  })

  test('owner without a usage store: usage_unavailable', async () => {
    const r = await call({ role: 'owner' })
    expect(r.errors?.[0]?.extensions?.code).toBe('usage_unavailable')
  })
})
