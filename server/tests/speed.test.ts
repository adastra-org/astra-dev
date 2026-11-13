// Tokens per second that reach the client (`done.tps`) and the usage log. The visible-text window
// (first to last delta) misses the time a reasoning model spends thinking, so counting its tokens
// over that window gave thousands of tok/s. Only the model's own timing is a real speed.
import { describe, expect, test } from 'bun:test'
import { tokensPerSecond } from '../src/chat/service.ts'
import type { LlmChunk, LlmProvider } from '../src/llm/provider.ts'
import { harness, parseSse } from './helpers.ts'

const scripted = (chunks: LlmChunk[]): LlmProvider => ({
  name: 'local',
  async *stream() {
    for (const c of chunks) yield c
  },
})

const done = async (chunks: LlmChunk[]) => {
  const h = await harness({ llm: scripted(chunks) as never })
  const res = await h.call('/chat', {
    json: { question: 'como dibujar texto en pantalla' },
  })
  return parseSse(await res.text()).find((e) => e.event === 'done')!.data
}

describe('tokensPerSecond', () => {
  test('tokens over milliseconds, one decimal', () => {
    expect(tokensPerSecond(240, 2000)).toBe(120)
    expect(tokensPerSecond(100, 3000)).toBe(33.3)
  })
  test('a window too short to measure is not a speed', () => {
    expect(tokensPerSecond(500, 10)).toBeNull()
    expect(tokensPerSecond(0, 1000)).toBeNull()
    expect(tokensPerSecond(10, 0)).toBeNull()
  })
})

describe('done.tps', () => {
  const body: LlmChunk[] = [
    { type: 'served', provider: 'local', model: 'lfm' },
    { type: 'delta', text: 'Con las nativas de texto [1].' },
    { type: 'usage', usage: { inputTokens: 900, outputTokens: 1000 } },
  ]

  test('comes from the model timings, reasoning tokens included', async () => {
    const d = await done([
      ...body,
      {
        type: 'timing',
        gpuMs: 9000,
        predictedTokens: 1000,
        predictedMs: 8000,
      },
    ])
    expect(d.tps).toBe(125)
  })

  test('absent when the provider gave no timing: never guessed from the text', async () => {
    const d = await done(body)
    expect('tps' in d).toBe(false)
  })
})
