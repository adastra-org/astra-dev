import { describe, expect, test } from 'bun:test'
import { encodeEvent } from '../src/chat/sse.ts'
import { REFUSAL_ES } from '../src/chat/prompt.ts'
import { FakeLlmProvider } from '../src/llm/fake.ts'
import { harness, keywordIndex, parseSse } from './helpers.ts'

const ask = async (
  h: Awaited<ReturnType<typeof harness>>,
  question: string,
  extra: Record<string, unknown> = {},
) => {
  const res = await h.call('/chat', { json: { question, ...extra } })
  return { res, text: await res.text() }
}

describe('SSE format', () => {
  test('meta, sources, deltas, done, in that order, with streaming headers', async () => {
    const h = await harness()
    const { res, text } = await ask(h, 'como funciona el rollback del deploy')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toStartWith('text/event-stream')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(res.headers.get('x-request-id')).toBeTruthy()

    const events = parseSse(text)
    const names = events.map((e) => e.event)
    expect(names[0]).toBe('meta')
    expect(names[1]).toBe('sources')
    expect(names.at(-1)).toBe('done')
    expect(names.slice(2, -1).every((n) => n === 'delta')).toBe(true)
    expect(events[0]!.data).toMatchObject({ mode: 'semantic', degraded: false })

    const sources = events[1]!.data.sources
    expect(sources[0]).toMatchObject({ n: 1, slug: 'flujo-de-deploy' })
    expect(sources[0].path).toMatch(/^\/docs\/flujo-de-deploy(#[a-z0-9-]+)?$/)

    const answer = events
      .filter((e) => e.event === 'delta')
      .map((e) => e.data.text)
      .join('')
    expect(answer).toBe('Respuesta de prueba basada en la documentación [1].')
    expect(events.at(-1)!.data).toMatchObject({
      cited: [1],
      refused: false,
      truncated: false,
    })
    expect(events.at(-1)!.data.usage.outputTokens).toBeGreaterThan(0)
  })

  test('encodeEvent emits one data line even for text with newlines', () => {
    const raw = encodeEvent({ type: 'delta', text: 'a\nb\n\nevent: done' })
    expect(raw).toBe(
      'event: delta\ndata: {"text":"a\\nb\\n\\nevent: done"}\n\n',
    )
    expect(raw.split('\n\n')).toHaveLength(2)
  })

  test('provider failure mid-answer ends with an error event, never a done', async () => {
    const h = await harness({ llm: new FakeLlmProvider({ fail: true }) })
    const { res, text } = await ask(h, 'deploy')
    expect(res.status).toBe(200)
    const events = parseSse(text)
    expect(events.at(-1)).toMatchObject({
      event: 'error',
      data: { code: 'llm_unavailable' },
    })
    expect(events.some((e) => e.event === 'done')).toBe(false)
  })
})

describe('answering policy', () => {
  test('nothing retrieved: refusal in Spanish, the model is never called', async () => {
    const h = await harness({ index: await keywordIndex(), embedder: null })
    const { text } = await ask(h, 'zzzz qqqq xxxx')
    const events = parseSse(text)
    expect(events.map((e) => e.event)).toEqual([
      'meta',
      'sources',
      'delta',
      'done',
    ])
    expect(events[2]!.data.text).toBe(REFUSAL_ES)
    expect(events[3]!.data).toMatchObject({ refused: true, cited: [] })
    expect(h.llm.requests).toHaveLength(0)
  })

  test('a model refusal is flagged for the UI', async () => {
    const h = await harness({
      llm: new FakeLlmProvider({ answer: `${REFUSAL_ES}` }),
    })
    const { text } = await ask(h, 'deploy')
    expect(parseSse(text).at(-1)!.data.refused).toBe(true)
  })

  test('citations only keep numbers that match a real retrieved source', async () => {
    const h = await harness({
      llm: new FakeLlmProvider({
        answer: 'Ver [1], [2], [9] y [0]. Fuente: http://evil.example',
      }),
    })
    const events = parseSse((await ask(h, 'deploy slot blue green')).text)
    const sources = events[1]!.data.sources as { n: number }[]
    const cited = events.at(-1)!.data.cited as number[]
    expect(cited.every((n) => n >= 1 && n <= sources.length)).toBe(true)
    expect(cited).not.toContain(9)
    expect(cited).not.toContain(0)
  })

  test('degraded retrieval (embedder down) still answers, flagged', async () => {
    const { fakeEmbedder } = await import('./helpers.ts')
    const h = await harness({ embedder: fakeEmbedder({ fail: true }) })
    const events = parseSse((await ask(h, 'rollback')).text)
    expect(events[0]!.data).toMatchObject({ mode: 'keyword', degraded: true })
    expect(events.at(-1)!.event).toBe('done')
  })

  test('the provider request has the fixed shape: 2 messages, capped output, no extras', async () => {
    const h = await harness()
    await ask(h, 'deploy')
    const req = h.llm.requests[0]!
    expect(req.messages.map((m) => m.role)).toEqual(['system', 'user'])
    expect(req.maxOutputTokens).toBe(h.deps.config.chat.maxOutputTokens)
    expect(Object.keys(req).sort()).toEqual([
      'maxOutputTokens',
      'messages',
      'signal',
    ])
  })
})

describe('input and output caps', () => {
  test('question capped, history limited to the last N turns of M chars', async () => {
    const h = await harness()
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `turno-${i} ${'x'.repeat(1000)}`,
    }))
    await ask(h, 'deploy ' + 'y'.repeat(3000), { history })
    const user = h.llm.requests[0]!.messages[1]!.content
    const cfg = h.deps.config.chat
    const turns = user.match(/^(usuario|asistente): /gm) ?? []
    expect(turns.length).toBeLessThanOrEqual(cfg.maxHistoryTurns)
    expect(user).toContain('turno-9')
    expect(user).not.toContain('turno-3 ')
    const question = /<pregunta>\n([\s\S]*)\n<\/pregunta>/.exec(user)![1]!
    expect(question.length).toBeLessThanOrEqual(cfg.maxQuestionChars)
    expect(user.length).toBeLessThan(
      cfg.contextMaxChars +
        cfg.maxQuestionChars +
        cfg.maxHistoryTurns * (cfg.maxHistoryTurnChars + 20) +
        500,
    )
  })

  test('output is cut at maxOutputChars and reported as truncated', async () => {
    const h = await harness({
      env: { CHAT_MAX_OUTPUT_CHARS: '200' },
      llm: new FakeLlmProvider({ answer: 'a'.repeat(10_000), chunkSize: 50 }),
    })
    const events = parseSse((await ask(h, 'deploy')).text)
    const total = events
      .filter((e) => e.event === 'delta')
      .reduce((n, e) => n + e.data.text.length, 0)
    expect(total).toBeLessThanOrEqual(200)
    expect(events.at(-1)!.data.truncated).toBe(true)
  })

  test('body validation: size, type, JSON, shape', async () => {
    const h = await harness()
    const big = await h.call('/chat', {
      json: { question: 'x'.repeat(20_000) },
    })
    expect(big.status).toBe(413)
    const text = await h.call('/chat', {
      method: 'POST',
      body: '{"question":"hola"}',
      headers: { 'content-type': 'text/plain' },
    })
    expect(text.status).toBe(400)
    const bad = await h.call('/chat', {
      method: 'POST',
      body: '{nope',
      headers: { 'content-type': 'application/json' },
    })
    expect(bad.status).toBe(400)
    expect((await h.call('/chat', { json: { question: 42 } })).status).toBe(400)
    expect((await h.call('/chat', { json: [] })).status).toBe(400)
    expect((await h.call('/chat', { json: { question: '   ' } })).status).toBe(
      400,
    )
    expect(h.llm.requests).toHaveLength(0)
  })

  test('GET /chat is not an endpoint', async () => {
    const h = await harness()
    const r = await h.call('/chat')
    expect(r.status).toBe(404)
    expect((await r.json()).error.code).toBe('not_found')
  })
})

describe('request logging', () => {
  test('logs ids, outcome and counts: never the question, the answer, cookies or the viewer token', async () => {
    const h = await harness()
    const res = await h.call('/chat', {
      json: { question: 'SECRETO-XYZ sobre el deploy' },
      headers: { cookie: 'sid=TOPSECRET-COOKIE', 'x-real-ip': '198.51.100.9' },
    })
    await res.text() // the request is logged when the stream ends
    const all = h.logs.join('\n')
    expect(all).toContain('"event":"request"')
    expect(all).toContain('"status":200')
    expect(all).not.toContain('SECRETO-XYZ')
    expect(all).not.toContain('TOPSECRET-COOKIE')
    expect(all).not.toContain('Respuesta de prueba')
    expect(all).not.toContain('198.51.100.9') // IP is hashed
  })

  test('rejected requests are logged with their error code', async () => {
    const h = await harness({ role: 'public' })
    await h.call('/chat', { json: { question: 'hola' } })
    expect(h.logs.join('\n')).toContain('"outcome":"unauthenticated"')
  })
})

describe('health and readiness', () => {
  test('/health always ok; /ready carries build identity and index info', async () => {
    const h = await harness()
    expect(await (await h.call('/health')).json()).toEqual({ ok: true })
    const ready = await h.call('/ready')
    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({
      ok: true,
      sha: 'abc123',
      slot: 'test',
      index: { semantic: true },
    })
  })

  test('no index: /ready is 503 (the deploy must not switch), chat says index_unavailable', async () => {
    const h = await harness({ index: null })
    expect((await h.call('/health')).status).toBe(200)
    expect((await h.call('/ready')).status).toBe(503)
    const r = await h.call('/chat', { json: { question: 'hola' } })
    expect(r.status).toBe(503)
    expect((await r.json()).error.code).toBe('index_unavailable')
  })
})

describe('graphql', () => {
  test('viewer and searchDocs (public)', async () => {
    const h = await harness({ role: 'public' })
    const res = await h.call('/graphql', {
      json: {
        query:
          '{ viewer { id role } searchDocs(q: "rollback", limit: 2) { mode hits { slug path excerpt } } }',
      },
    })
    const body = await res.json()
    expect(body.data.viewer).toEqual({ id: null, role: 'public' })
    expect(body.data.searchDocs.hits[0].path).toMatch(
      /^\/docs\/flujo-de-deploy/,
    )
    expect(body.data.searchDocs.hits.length).toBeLessThanOrEqual(2)
  })

  test('the chunk text is not exposed by the schema', async () => {
    const h = await harness()
    const res = await h.call('/graphql', {
      json: { query: '{ searchDocs(q: "deploy") { hits { text } } }' },
    })
    expect((await res.json()).errors?.[0]?.message).toContain(
      'Cannot query field',
    )
  })
})
