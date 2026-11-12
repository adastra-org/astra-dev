import { describe, expect, test } from 'bun:test'
import { AnswerCache, cacheKey, normalizeQuestion } from '../src/chat/cache.ts'
import { FakeLlmProvider } from '../src/llm/fake.ts'
import { DevStubViewerPort } from '../src/viewer.ts'
import { harness, parseSse } from './helpers.ts'

const ask = async (
  h: Awaited<ReturnType<typeof harness>>,
  question: string,
  extra: Record<string, unknown> = {},
) => {
  const res = await h.call('/chat', { json: { question, ...extra } })
  return { res, events: parseSse(await res.text()) }
}

const answerOf = (events: { event: string; data: any }[]) =>
  events
    .filter((e) => e.event === 'delta')
    .map((e) => e.data.text)
    .join('')

describe('normalizeQuestion', () => {
  test('ignores case, accents, ornamental punctuation and spacing', () => {
    expect(normalizeQuestion('¿Cómo  funciona el ROLLBACK?')).toBe(
      'como funciona el rollback',
    )
    expect(normalizeQuestion('como funciona el rollback')).toBe(
      'como funciona el rollback',
    )
  })
})

describe('AnswerCache', () => {
  const value = { text: 'a', cited: [1], refused: false }

  test('stores, expires after the TTL', () => {
    let t = 1000
    const c = new AnswerCache({ maxEntries: 10, ttlMs: 500, now: () => t })
    c.set('k', value)
    expect(c.get('k')).toEqual(value)
    t += 499
    expect(c.get('k')).toEqual(value)
    t += 2
    expect(c.get('k')).toBeNull()
    expect(c.size).toBe(0)
  })

  test('is bounded and evicts the least recently used entry', () => {
    const c = new AnswerCache({ maxEntries: 2, ttlMs: 60_000 })
    c.set('a', value)
    c.set('b', value)
    expect(c.get('a')).not.toBeNull() // a is now the most recent
    c.set('c', value) // evicts b
    expect(c.get('b')).toBeNull()
    expect(c.get('a')).not.toBeNull()
    expect(c.get('c')).not.toBeNull()
    expect(c.size).toBe(2)
  })

  test('maxEntries 0 or ttl 0 disables it', () => {
    for (const c of [
      new AnswerCache({ maxEntries: 0, ttlMs: 1000 }),
      new AnswerCache({ maxEntries: 5, ttlMs: 0 }),
    ]) {
      expect(c.enabled).toBe(false)
      c.set('k', value)
      expect(c.get('k')).toBeNull()
    }
  })
})

describe('cacheKey', () => {
  const base = {
    role: 'subscriber' as const,
    question: 'Cómo funciona el rollback?',
    history: [],
    sourceIds: ['a', 'b'],
  }
  test('same question, role and sources: same key (normalized)', () => {
    expect(cacheKey({ ...base, question: 'como funciona el rollback' })).toBe(
      cacheKey(base),
    )
  })
  test('role, sources, order and history change the key', () => {
    const k = cacheKey(base)
    expect(cacheKey({ ...base, role: 'staff' })).not.toBe(k)
    expect(cacheKey({ ...base, sourceIds: ['a'] })).not.toBe(k)
    expect(cacheKey({ ...base, sourceIds: ['b', 'a'] })).not.toBe(k)
    expect(
      cacheKey({
        ...base,
        history: [{ role: 'user', content: 'antes' }],
      }),
    ).not.toBe(k)
  })
})

describe('chat answer cache', () => {
  test('the second identical question is served from the cache: no model call', async () => {
    const h = await harness()
    const first = await ask(h, 'como funciona el rollback del deploy')
    expect(h.llm.requests).toHaveLength(1)
    expect(first.events.at(-1)!.data.cached).toBeUndefined()

    // Different case, accents and punctuation: same normalized question.
    const second = await ask(h, '¿Cómo funciona el ROLLBACK del deploy?')
    expect(h.llm.requests).toHaveLength(1)
    const done = second.events.at(-1)!
    expect(done.event).toBe('done')
    expect(done.data).toMatchObject({
      cached: true,
      refused: false,
      truncated: false,
      cited: [1],
      usage: { inputTokens: 0, outputTokens: 0 },
    })
    expect(answerOf(second.events)).toBe(answerOf(first.events))
    expect(second.events.map((e) => e.event).slice(0, 2)).toEqual([
      'meta',
      'sources',
    ])
    // Scores can differ slightly between phrasings; the sources themselves are the same.
    const paths = (e: { data: any }[]) =>
      e.map((x) => x.data.sources?.map((s: any) => s.path))
    expect(paths([second.events[1]!])).toEqual(paths([first.events[1]!]))
  })

  test('a hit does not spend the daily token budget', async () => {
    // Enough for exactly one live answer.
    const h = await harness({ env: { DAILY_TOKENS_VIEWER: '1800' } })
    expect((await ask(h, 'rollback del deploy')).res.status).toBe(200)
    for (let i = 0; i < 3; i++) {
      const r = await ask(h, 'rollback del deploy')
      expect(r.res.status).toBe(200)
      expect(r.events.at(-1)!.data.cached).toBe(true)
    }
    expect(h.llm.requests).toHaveLength(1)
  })

  test('still rate limited: a hit counts as a request', async () => {
    const h = await harness({ env: { RATE_CHAT_VIEWER_PER_MIN: '2' } })
    await ask(h, 'rollback del deploy')
    expect((await ask(h, 'rollback del deploy')).res.status).toBe(200)
    const res = await h.call('/chat', {
      json: { question: 'rollback del deploy' },
    })
    expect(res.status).toBe(429)
  })

  test('a different question or different history misses', async () => {
    const h = await harness()
    await ask(h, 'rollback del deploy')
    await ask(h, 'dibujar texto en pantalla')
    expect(h.llm.requests).toHaveLength(2)
    await ask(h, 'rollback del deploy', {
      history: [{ role: 'user', content: 'hablemos de deploy' }],
    })
    expect(h.llm.requests).toHaveLength(3)
  })

  test('roles do not share cached answers (shared cache, each role pays its first)', async () => {
    const shared = new AnswerCache({ maxEntries: 10, ttlMs: 60_000 })
    const llm = new FakeLlmProvider()
    const sub = await harness({
      cache: shared,
      llm,
      viewers: new DevStubViewerPort('subscriber'),
    })
    const staff = await harness({
      cache: shared,
      llm,
      viewers: new DevStubViewerPort('staff'),
    })
    await ask(sub, 'rollback del deploy')
    await ask(staff, 'rollback del deploy')
    expect(llm.requests).toHaveLength(2)
    await ask(staff, 'rollback del deploy')
    expect(llm.requests).toHaveLength(2)
  })

  test('failed answers are not cached', async () => {
    const h = await harness({ llm: new FakeLlmProvider({ fail: true }) })
    await ask(h, 'rollback del deploy')
    await ask(h, 'rollback del deploy')
    expect(h.llm.requests).toHaveLength(2)
  })

  test('truncated answers are not cached', async () => {
    const h = await harness({
      env: { CHAT_MAX_OUTPUT_CHARS: '200' },
      llm: new FakeLlmProvider({ answer: 'x'.repeat(600) }),
    })
    const first = await ask(h, 'rollback del deploy')
    expect(first.events.at(-1)!.data.truncated).toBe(true)
    await ask(h, 'rollback del deploy')
    expect(h.llm.requests).toHaveLength(2)
  })

  test('CHAT_CACHE_TTL_SECONDS=0 turns it off', async () => {
    const h = await harness({ env: { CHAT_CACHE_TTL_SECONDS: '0' } })
    await ask(h, 'rollback del deploy')
    await ask(h, 'rollback del deploy')
    expect(h.llm.requests).toHaveLength(2)
  })

  test('the request log marks hit/miss and never carries the question or the answer', async () => {
    const h = await harness()
    await ask(h, 'rollback del deploy secreto')
    await ask(h, 'rollback del deploy secreto')
    const lines = h.logs.map((l) => JSON.parse(l)).filter((l) => l.cache)
    expect(lines.map((l) => l.cache)).toEqual(['miss', 'hit'])
    const raw = h.logs.join('\n')
    expect(raw).not.toContain('secreto')
    expect(raw).not.toContain('Respuesta de prueba')
  })
})
