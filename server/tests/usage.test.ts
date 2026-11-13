// Usage records: one row per request, nothing from the content, and never a reason to fail a request.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunTelemetry } from '../src/chat/service.ts'
import { UsageCollector } from '../src/usage/collector.ts'
import {
  UsageStore,
  type UsageRecord,
  type UsageSink,
} from '../src/usage/store.ts'
import { ANONYMOUS, type ViewerPort } from '../src/viewer.ts'
import { harness, parseSse, testConfig } from './helpers.ts'

interface Row {
  request_id: string
  route: string
  viewer_id: string | null
  role: string
  provider: string | null
  outcome: string
  cache_hit: number
  input_tokens: number
  output_tokens: number
  duration_ms: number
  gpu_ms: number | null
  cost_usd_est: number | null
}

const rows = (s: UsageStore) =>
  s.query<Row>('SELECT * FROM usage_events ORDER BY id')

const signedIn = (role: 'public' | 'subscriber'): ViewerPort => ({
  resolve: () =>
    Promise.resolve({
      id: 'u-1',
      handle: 'ana',
      role,
      emailVerified: true,
      entitlements: [],
    }),
})

describe('usage records over HTTP', () => {
  test('one row per request: answer, cached answer and rejections', async () => {
    const store = new UsageStore(':memory:')
    const h = await harness({
      role: 'staff',
      usage: store,
      env: { RATE_CHAT_VIEWER_PER_MIN: '2' },
    })
    const ask = (q: string) => h.call('/chat', { json: { question: q } })
    await (await ask('deploy')).text()
    await (await ask('deploy')).text() // same question: cache hit
    const limited = await ask('deploy')
    expect(limited.status).toBe(429)
    await limited.text()

    const r = rows(store)
    expect(r.map((x) => x.outcome)).toEqual(['ok', 'cached', 'rate_limited'])
    expect(r.map((x) => x.cache_hit)).toEqual([0, 1, 0])
    expect(r[0]!.role).toBe('staff')
    expect(r[0]!.route).toBe('chat')
    expect(r[0]!.output_tokens).toBeGreaterThan(0)
    expect(r[1]!.input_tokens + r[1]!.output_tokens).toBe(0)
    expect(r[2]!.input_tokens + r[2]!.output_tokens).toBe(0)
    expect(r[2]!.provider).toBeNull()
    expect(new Set(r.map((x) => x.request_id)).size).toBe(3)
  })

  test('a signed-in viewer without access is recorded as subscription_required', async () => {
    const store = new UsageStore(':memory:')
    const h = await harness({ viewers: signedIn('public'), usage: store })
    const r = await h.call('/chat', { json: { question: 'deploy' } })
    expect(r.status).toBe(403)
    expect(rows(store).map((x) => [x.outcome, x.role])).toEqual([
      ['subscription_required', 'public'],
    ])
  })

  test('anonymous requests are not recorded', async () => {
    const store = new UsageStore(':memory:')
    const h = await harness({
      viewers: { resolve: () => Promise.resolve(ANONYMOUS) },
      usage: store,
    })
    const r = await h.call('/chat', { json: { question: 'deploy' } })
    expect(r.status).toBe(401)
    expect(rows(store)).toHaveLength(0)
  })

  test('neither the question nor the answer is stored, in any column', async () => {
    const store = new UsageStore(':memory:')
    const h = await harness({ role: 'staff', usage: store })
    const question = 'zzquestionmarker deploy rollback'
    const body = await (await h.call('/chat', { json: { question } })).text()
    const answer = parseSse(body)
      .filter((e) => e.event === 'delta')
      .map((e) => e.data.text as string)
      .join('')
    expect(answer.length).toBeGreaterThan(10)
    const dump = JSON.stringify(
      store.query('SELECT * FROM usage_events'),
    ).toLowerCase()
    expect(dump).not.toContain('zzquestionmarker')
    expect(dump).not.toContain(answer.slice(0, 20).toLowerCase())
    // Only these columns exist: none can hold text from the conversation.
    const cols = store
      .query<{ name: string }>(
        "SELECT name FROM pragma_table_info('usage_events')",
      )
      .map((c) => c.name)
    expect(cols).toEqual([
      'id',
      'ts',
      'day',
      'request_id',
      'route',
      'viewer_id',
      'viewer_handle',
      'role',
      'provider',
      'model',
      'fallback_used',
      'input_tokens',
      'output_tokens',
      'ttft_ms',
      'duration_ms',
      'gen_tps',
      'outcome',
      'cache_hit',
      'gpu_ms',
      'cost_usd_est',
    ])
  })

  test('a failing store does not break the response', async () => {
    const store = new UsageStore(':memory:')
    // Writes now fail (the table is gone); the request must not notice.
    store.query('DROP TABLE usage_events')
    const h = await harness({ role: 'staff', usage: store })
    const r = await h.call('/chat', { json: { question: 'deploy' } })
    expect(r.status).toBe(200)
    expect(parseSse(await r.text()).map((e) => e.event)).toContain('done')
    expect(store.writeErrors).toBeGreaterThan(0)
  })

  test('a sink that throws does not break the response either', async () => {
    const sink: UsageSink = {
      record() {
        throw new Error('disk full')
      },
    }
    const h = await harness({ role: 'staff', usage: sink })
    const r = await h.call('/chat', { json: { question: 'deploy' } })
    expect(r.status).toBe(200)
    await r.text()
  })
})

describe('usage store', () => {
  let dir = ''
  afterEach(() => {
    try {
      if (dir)
        rmSync(dir, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 50,
        })
    } catch {
      // Windows can keep the WAL files locked for a moment; the temp dir is disposable.
    }
    dir = ''
  })
  const rec = (over: Partial<UsageRecord> = {}): UsageRecord => ({
    ts: Date.now(),
    requestId: crypto.randomUUID(),
    route: 'chat',
    viewerId: 'u',
    viewerHandle: 'u',
    role: 'staff',
    provider: null,
    model: null,
    fallbackUsed: false,
    inputTokens: 0,
    outputTokens: 0,
    ttftMs: null,
    durationMs: 1,
    genTps: null,
    outcome: 'ok',
    cacheHit: false,
    gpuMs: null,
    costUsdEst: null,
    ...over,
  })

  test('two connections to the same file (blue and green) write without SQLITE_BUSY', () => {
    dir = mkdtempSync(join(tmpdir(), 'usage-'))
    const path = join(dir, 'nested', 'usage.sqlite')
    const a = new UsageStore(path)
    const b = new UsageStore(path)
    for (let i = 0; i < 100; i++) {
      a.record(rec())
      b.record(rec())
    }
    expect(a.writeErrors + b.writeErrors).toBe(0)
    expect(
      a.query<{ n: number }>('SELECT COUNT(*) n FROM usage_events')[0]!.n,
    ).toBe(200)
    a.close()
    b.close()
  })

  test('purge removes only what is older than the retention', () => {
    const s = new UsageStore(':memory:')
    const now = Date.UTC(2026, 10, 12)
    s.record(rec({ ts: now - 200 * 86_400_000 }))
    s.record(rec({ ts: now - 10 * 86_400_000 }))
    expect(s.purge(180, now)).toBe(1)
    expect(rows(s)).toHaveLength(1)
  })
})

describe('usage collector', () => {
  const run = (
    over: Partial<RunTelemetry>,
    tokens = { input: 100, output: 50 },
  ) => {
    const out: UsageRecord[] = []
    const cfg = testConfig({ LLM_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'k' })
    const c = new UsageCollector(
      { record: (r) => out.push(r) },
      cfg,
      'rid',
      'chat',
      1000,
    )
    c.who = { id: 'u', handle: 'ana', role: 'owner' }
    c.tokens = tokens
    c.telemetry = {
      provider: null,
      model: null,
      gpuMs: null,
      ttftMs: null,
      genMs: null,
      ...over,
    }
    c.finish(500)
    return out[0]!
  }

  test('hosted model: estimated cost from tokens, no GPU time', () => {
    const r = run({ provider: 'deepseek', model: 'deepseek-flash', gpuMs: 999 })
    expect(r.gpuMs).toBeNull()
    expect(r.costUsdEst).toBeCloseTo((100 * 0.14 + 50 * 0.28) / 1e6, 10)
    expect(r.fallbackUsed).toBe(false)
  })

  test('local model: GPU time kept, no cost, and it counts as a fallback when deepseek is primary', () => {
    const r = run({ provider: 'local', model: 'lfm2', gpuMs: 421, genMs: 1000 })
    expect(r.gpuMs).toBe(421)
    expect(r.costUsdEst).toBeNull()
    expect(r.fallbackUsed).toBe(true)
    expect(r.genTps).toBe(50)
  })

  test('local model without timings: GPU time stays null, never invented', () => {
    expect(run({ provider: 'local', model: 'lfm2' }).gpuMs).toBeNull()
  })
})
