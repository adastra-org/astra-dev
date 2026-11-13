import { describe, expect, test } from 'bun:test'
import { AppError } from '../src/errors.ts'
import { DeepSeekProvider } from '../src/llm/deepseek.ts'
import { FakeLlmProvider } from '../src/llm/fake.ts'
import type { LlmChunk } from '../src/llm/provider.ts'

const collect = async (it: AsyncIterable<LlmChunk>) => {
  const out: LlmChunk[] = []
  for await (const c of it) out.push(c)
  return out
}

const sseBody = (lines: string[]) =>
  new Response(lines.map((l) => `${l}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })

describe('FakeLlmProvider', () => {
  test('streams the scripted answer in deltas, then usage, and records the request', async () => {
    const llm = new FakeLlmProvider({ answer: 'hola mundo', chunkSize: 4 })
    const out = await collect(
      llm.stream({
        messages: [{ role: 'user', content: 'x' }],
        maxOutputTokens: 10,
      }),
    )
    expect(
      out
        .filter((c) => c.type === 'delta')
        .map((c) => (c as { text: string }).text),
    ).toEqual(['hola', ' mun', 'do'])
    expect(out.at(-1)?.type).toBe('usage')
    expect(llm.requests).toHaveLength(1)
  })

  test('fail option raises llm_unavailable', async () => {
    const llm = new FakeLlmProvider({ fail: true })
    expect(
      collect(llm.stream({ messages: [], maxOutputTokens: 1 })),
    ).rejects.toMatchObject({
      code: 'llm_unavailable',
    })
  })
})

describe('DeepSeekProvider', () => {
  const make = (fetchImpl: typeof fetch) =>
    new DeepSeekProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://llm.example',
      model: 'deepseek-flash',
      timeoutMs: 5000,
      fetch: fetchImpl,
    })

  test('sends a plain completion (no tools), key only in the header, to the configured base URL', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const llm = make((async (url: string, init: RequestInit) => {
      seen = { url, init }
      return sseBody([
        'data: {"choices":[{"delta":{"content":"Ho"}}]}',
        'data: {"choices":[{"delta":{"content":"la"}}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2}}',
        'data: [DONE]',
      ])
    }) as unknown as typeof fetch)
    const out = await collect(
      llm.stream({
        messages: [{ role: 'user', content: 'q' }],
        maxOutputTokens: 50,
      }),
    )
    expect(seen!.url).toBe('https://llm.example/chat/completions')
    const body = JSON.parse(String(seen!.init.body))
    expect(body).toMatchObject({
      model: 'deepseek-flash',
      max_tokens: 50,
      stream: true,
    })
    expect(Object.keys(body)).not.toContain('tools')
    expect(Object.keys(body)).not.toContain('tool_choice')
    expect(Object.keys(body)).not.toContain('chat_template_kwargs')
    expect(JSON.stringify(body)).not.toContain('sk-test')
    expect((seen!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer sk-test',
    )
    expect(out).toEqual([
      { type: 'delta', text: 'Ho' },
      { type: 'delta', text: 'la' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } },
    ])
  })

  test('HTTP error and network failure become llm_unavailable without leaking details', async () => {
    const down = make(
      (async () =>
        new Response('boom sk-test', {
          status: 500,
        })) as unknown as typeof fetch,
    )
    const err = await collect(
      down.stream({ messages: [], maxOutputTokens: 1 }),
    ).catch((e) => e)
    expect(err).toBeInstanceOf(AppError)
    expect(err.code).toBe('llm_unavailable')
    expect(err.message).not.toContain('sk-test')

    const dead = make((async () => {
      throw new TypeError('ECONNREFUSED')
    }) as unknown as typeof fetch)
    expect(
      collect(dead.stream({ messages: [], maxOutputTokens: 1 })),
    ).rejects.toMatchObject({ code: 'llm_unavailable' })
  })

  test('ignores malformed lines in the stream', async () => {
    const llm = make((async () =>
      sseBody([
        ': keep-alive',
        'data: not json',
        'data: {"choices":[{"delta":{"content":"ok"}}]}',
      ])) as unknown as typeof fetch)
    const out = await collect(llm.stream({ messages: [], maxOutputTokens: 1 }))
    expect(out).toEqual([{ type: 'delta', text: 'ok' }])
  })
})

describe('DeepSeekProvider as a local server', () => {
  test('no key means no Authorization header, and the name is local', async () => {
    let seen: RequestInit | undefined
    const llm = new DeepSeekProvider({
      name: 'local',
      apiKey: '',
      baseUrl: 'http://127.0.0.1:8080/v1',
      model: 'lfm2',
      timeoutMs: 5000,
      fetch: (async (_u: string, init: RequestInit) => {
        seen = init
        return sseBody([
          'data: {"choices":[{"delta":{"content":"ok"}}]}',
          'data: [DONE]',
        ])
      }) as unknown as typeof fetch,
    })
    expect(llm.name).toBe('local')
    const out = await collect(llm.stream({ messages: [], maxOutputTokens: 5 }))
    expect(out).toEqual([{ type: 'delta', text: 'ok' }])
    expect(Object.keys(seen!.headers as object)).not.toContain('authorization')
    expect(JSON.parse(String(seen!.body)).chat_template_kwargs).toEqual({
      enable_thinking: false,
    })
  })
})
