// Steps and thinking in the chat stream: what the pipeline did, and the model's reasoning for staff only.
import { describe, expect, test } from 'bun:test'
import { FakeLlmProvider } from '../src/llm/fake.ts'
import { harness, parseSse } from './helpers.ts'

const ask = async (
  h: Awaited<ReturnType<typeof harness>>,
  question = 'rollback del deploy',
) => {
  const res = await h.call('/chat', {
    json: { question },
    headers: { origin: 'http://localhost:5173' },
  })
  return { res, events: parseSse(await res.text(), { steps: true }) }
}

describe('step events', () => {
  test('search runs before the answer and carries counts, not content', async () => {
    const h = await harness()
    const { events } = await ask(h)
    const types = events.map((e) => e.event)
    expect(types[0]).toBe('meta')
    expect(types[1]).toBe('step')
    expect(types.indexOf('sources')).toBeGreaterThan(types.lastIndexOf('step'))
    const search = events.find((e) => e.data.step?.id === 'search')!.data.step
    expect(search.mode).toBe('semantic')
    expect(search.docs).toBeGreaterThan(0)
    expect(typeof search.ms).toBe('number')
    expect(
      JSON.stringify(events.filter((e) => e.event === 'step')),
    ).not.toMatch(/rollback del deploy|symlink/)
  })

  test('a gate step is reported when the gate decides', async () => {
    const h = await harness({
      gate: { select: async (_q, hits) => hits.slice(0, 1) },
    })
    const { events } = await ask(h)
    const gate = events.find((e) => e.data.step?.id === 'gate')!.data.step
    expect(gate.kept).toBe(1)
    expect(gate.total).toBeGreaterThan(0)
  })

  test('a cache hit says so instead of replaying the pipeline timings', async () => {
    const h = await harness()
    await ask(h)
    const { events } = await ask(h)
    expect(events.find((e) => e.data.step?.id === 'cache')).toBeDefined()
  })
})

describe('thinking events', () => {
  const llm = () =>
    new FakeLlmProvider({ thinking: 'Veo el slot anterior. '.repeat(4) })

  test('staff sees the reasoning, in order and apart from the answer', async () => {
    const h = await harness({ role: 'staff', llm: llm() })
    const { events } = await ask(h)
    const thinking = events.filter((e) => e.event === 'thinking')
    expect(thinking.length).toBeGreaterThan(0)
    expect(thinking.map((e) => e.data.text).join('')).toBe(
      'Veo el slot anterior. '.repeat(4),
    )
    const answer = events
      .filter((e) => e.event === 'delta')
      .map((e) => e.data.text)
      .join('')
    expect(answer).not.toContain('Veo el slot')
    const first = events.findIndex((e) => e.event === 'thinking')
    const firstDelta = events.findIndex((e) => e.event === 'delta')
    expect(first).toBeLessThan(firstDelta)
  })

  test('subscribers never get it', async () => {
    const h = await harness({ role: 'subscriber', llm: llm() })
    const { events } = await ask(h)
    expect(events.some((e) => e.event === 'thinking')).toBe(false)
    expect(JSON.stringify(events)).not.toContain('Veo el slot')
  })

  test('CHAT_MAX_THINKING_CHARS caps it and 0 turns it off', async () => {
    const capped = await harness({
      role: 'staff',
      llm: llm(),
      env: { CHAT_MAX_THINKING_CHARS: '30' },
    })
    const a = await ask(capped)
    const sent = a.events
      .filter((e) => e.event === 'thinking')
      .map((e) => e.data.text)
      .join('')
    expect(sent.length).toBe(30)

    const off = await harness({
      role: 'staff',
      llm: llm(),
      env: { CHAT_MAX_THINKING_CHARS: '0' },
    })
    expect((await ask(off)).events.some((e) => e.event === 'thinking')).toBe(
      false,
    )
  })

  test('thinking is never cached or replayed', async () => {
    const h = await harness({ role: 'staff', llm: llm() })
    await ask(h)
    const again = await ask(h)
    expect(again.events.some((e) => e.event === 'thinking')).toBe(false)
  })
})
