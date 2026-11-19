import { describe, expect, test } from 'bun:test'
import { AppError } from '../src/errors.ts'
import { RateLimiter, TokenBudget, estimateTokens } from '../src/limits.ts'
import { harness } from './helpers.ts'

const code = (f: () => void) => {
  try {
    f()
  } catch (e) {
    return (e as AppError).code
  }
  return null
}

describe('RateLimiter', () => {
  test('allows `limit` hits per window, then rate_limited with retryAfter', () => {
    const rl = new RateLimiter(3, 60_000)
    for (let i = 0; i < 3; i++) rl.hit('a', 1000 + i)
    expect(code(() => rl.hit('a', 2000))).toBe('rate_limited')
    try {
      rl.hit('a', 2000)
    } catch (e) {
      expect((e as AppError).retryAfter).toBe(59)
    }
    rl.hit('b', 2000) // other keys are independent
  })

  test('the window slides', () => {
    const rl = new RateLimiter(1, 1000)
    rl.hit('k', 0)
    expect(code(() => rl.hit('k', 500))).toBe('rate_limited')
    expect(code(() => rl.hit('k', 1001))).toBeNull()
  })
})

describe('TokenBudget', () => {
  test('per-viewer cap, and settle returns unused tokens', () => {
    const b = new TokenBudget(1000, 100_000)
    b.reserve('u', 800, 0)
    expect(code(() => b.reserve('u', 300, 0))).toBe('budget_exceeded')
    b.settle('u', 800, 200, 0) // actually used only 200
    b.reserve('u', 300, 0)
    expect(b.usage('u').viewer).toBe(500)
  })

  test('global cap applies across viewers', () => {
    const b = new TokenBudget(1000, 1500)
    b.reserve('a', 900, 0)
    expect(code(() => b.reserve('b', 900, 0))).toBe('budget_exceeded')
  })

  test('resets at 00:00 UTC and reports seconds until then', () => {
    const b = new TokenBudget(100, 1000)
    const late = Date.UTC(2026, 0, 1, 23, 59, 0)
    b.reserve('u', 100, late)
    try {
      b.reserve('u', 1, late)
    } catch (e) {
      expect((e as AppError).retryAfter).toBe(60)
    }
    b.reserve('u', 100, Date.UTC(2026, 0, 2, 0, 0, 1))
  })

  test('estimate is pessimistic', () => {
    expect(estimateTokens(300)).toBe(100)
  })
})

describe('limits on the HTTP route', () => {
  test('per-viewer limit: 429 with Retry-After and a stable code', async () => {
    const h = await harness({ env: { RATE_CHAT_VIEWER_PER_MIN: '2' } })
    for (let i = 0; i < 2; i++) {
      const r = await h.call('/chat', { json: { question: 'deploy' } })
      expect(r.status).toBe(200)
      await r.text()
    }
    const r = await h.call('/chat', { json: { question: 'deploy' } })
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await r.json()).error.code).toBe('rate_limited')
  })

  test('per-IP limit applies even across viewers (X-Real-IP behind nginx)', async () => {
    const h = await harness({
      env: { RATE_CHAT_IP_PER_MIN: '1', TRUST_PROXY: 'true' },
    })
    const headers = { 'x-real-ip': '203.0.113.7' }
    const a = await h.call('/chat', { json: { question: 'deploy' }, headers })
    await a.text()
    const b = await h.call('/chat', { json: { question: 'deploy' }, headers })
    expect(b.status).toBe(429)
    const other = await h.call('/chat', {
      json: { question: 'deploy' },
      headers: { 'x-real-ip': '203.0.113.8' },
    })
    expect(other.status).toBe(200)
    await other.text()
  })

  test('X-Real-IP is ignored unless the proxy is trusted', async () => {
    const h = await harness({
      env: { RATE_CHAT_IP_PER_MIN: '1', TRUST_PROXY: 'false' },
    })
    const a = await h.call('/chat', {
      json: { question: 'deploy' },
      headers: { 'x-real-ip': '1.1.1.1' },
    })
    await a.text()
    // A spoofed different header must not buy a fresh bucket.
    const b = await h.call('/chat', {
      json: { question: 'deploy' },
      headers: { 'x-real-ip': '2.2.2.2' },
    })
    expect(b.status).toBe(429)
  })

  test('daily budget: 429 budget_exceeded before the model is called', async () => {
    const h = await harness({ env: { DAILY_TOKENS_VIEWER: '1000' } })
    // One request reserves input estimate + 700 output tokens, which already exceeds 1000.
    const r = await h.call('/chat', { json: { question: 'deploy' } })
    expect(r.status).toBe(429)
    expect((await r.json()).error.code).toBe('budget_exceeded')
    expect(h.llm.requests).toHaveLength(0)
  })

  test('public search is limited per IP', async () => {
    const h = await harness({ env: { RATE_SEARCH_IP_PER_MIN: '1' } })
    const q = { query: '{ searchDocs(q: "deploy") { hits { slug } } }' }
    const post = () =>
      h.call('/graphql', {
        json: q,
        headers: { 'content-type': 'application/json' },
      })
    const a = await (await post()).json()
    expect(a.data.searchDocs.hits.length).toBeGreaterThan(0)
    const b = await (await post()).json()
    expect(b.errors[0].extensions.code).toBe('rate_limited')
  })
})
