// Follow-ups ("explicame eso", "dame un ejemplo") must lean on the conversation and on the sources
// of the previous answer, while what is neither in the docs nor in the talk is still refused.
import { describe, expect, test } from 'bun:test'
import type { FollowUpDecider } from '../src/decision/followup.ts'
import type { ContextGate } from '../src/decision/gate.ts'
import { REFUSAL_ES } from '../src/chat/prompt.ts'
import { parseSources } from '../src/chat/carry.ts'
import { harness, parseSse } from './helpers.ts'

const history = [
  { role: 'user', content: 'como funciona el rollback del deploy' },
  {
    role: 'assistant',
    content: 'El rollback cambia el symlink al slot anterior [1].',
  },
]
const refusedHistory = [
  { role: 'user', content: 'cual es la capital de francia' },
  { role: 'assistant', content: REFUSAL_ES },
]
const decide = (v: boolean | null): FollowUpDecider => ({
  dependsOnHistory: async () => v,
})
/** A gate that, like the real one on a vague question, finds nothing that "answers" it. */
const strictGate: ContextGate = { select: async () => [] }

async function ask(
  body: Record<string, unknown>,
  opts: Parameters<typeof harness>[0] = {},
) {
  const h = await harness(opts)
  const res = await h.call('/chat', { json: body })
  const text = await res.text()
  return { h, res, text, events: res.ok ? parseSse(text) : [] }
}
const slugs = (e: ReturnType<typeof parseSse>) =>
  (e.find((x) => x.event === 'sources')?.data.sources ?? []).map(
    (s: { slug: string }) => s.slug,
  )
const done = (e: ReturnType<typeof parseSse>) =>
  e.find((x) => x.event === 'done')!.data

describe('follow-up with the sources of the previous answer', () => {
  test('the vague question is answered from the carried sources, even if the gate drops all', async () => {
    const { h, events } = await ask(
      { question: 'explicame eso', history, sources: ['flujo-de-deploy'] },
      { decider: decide(true), gate: strictGate },
    )
    expect(slugs(events)).toContain('flujo-de-deploy')
    expect(done(events).refused).toBe(false)
    const prompt = h.llm.requests[0]!.messages.map((m) => m.content).join('\n')
    expect(prompt).toContain('<fuente n="1"')
    expect(prompt).toContain('slot blue green')
    expect(prompt).toContain('symlink al slot anterior')
  })

  test('without a decider the history counts as needed, so sources are carried too', async () => {
    const { events } = await ask(
      { question: 'dame un ejemplo', history, sources: ['flujo-de-deploy'] },
      { gate: strictGate },
    )
    expect(slugs(events)).toContain('flujo-de-deploy')
    expect(done(events).refused).toBe(false)
  })

  test('decider says standalone: the previous sources are not carried', async () => {
    const { h, events } = await ask(
      {
        question: 'como dibujar texto en pantalla',
        history,
        sources: ['flujo-de-deploy'],
      },
      { decider: decide(false) },
    )
    // The tiny corpus may still rank it low; carried sources would have put it first.
    expect(slugs(events)[0]).toBe('dibujar-texto')
    expect(slugs(events).indexOf('flujo-de-deploy')).not.toBe(0)
    expect(h.llm.requests).toHaveLength(1)
  })

  test('off-topic after a talk is refused, no model call', async () => {
    const { h, events } = await ask(
      {
        question: 'dame la receta de una pizza napolitana',
        history,
        sources: ['flujo-de-deploy'],
      },
      { decider: decide(false), gate: strictGate },
    )
    expect(done(events).refused).toBe(true)
    expect(h.llm.requests).toHaveLength(0)
  })

  test('no sources and the search finds nothing: the talk itself is the material', async () => {
    const { h, events } = await ask(
      { question: 'explicame eso', history },
      { decider: decide(true), gate: strictGate },
    )
    expect(slugs(events)).toEqual([])
    expect(h.llm.requests).toHaveLength(1)
    const prompt = h.llm.requests[0]!.messages.map((m) => m.content).join('\n')
    expect(prompt).toContain('<historial>')
    expect(prompt).toContain('symlink al slot anterior')
    expect(done(events).refused).toBe(false)
  })

  test('after a refusal there is nothing to explain: still refused, no model call', async () => {
    const { h, events } = await ask(
      { question: 'explicame eso', history: refusedHistory },
      { decider: decide(true), gate: strictGate },
    )
    expect(done(events).refused).toBe(true)
    expect(h.llm.requests).toHaveLength(0)
  })

  test('no history at all: a question with no sources is refused as before', async () => {
    const { h, events } = await ask(
      { question: 'explicame eso' },
      { gate: strictGate },
    )
    expect(done(events).refused).toBe(true)
    expect(h.llm.requests).toHaveLength(0)
  })

  test('the gate judges the question together with the topic it refers to', async () => {
    const seen: string[] = []
    await ask(
      { question: 'y si falla?', history },
      {
        decider: decide(true),
        gate: {
          select: async (q, hits) => {
            seen.push(q)
            return [...hits]
          },
        },
      },
    )
    expect(seen[0]).toContain('rollback del deploy')
    expect(seen[0]).toContain('y si falla?')
  })

  test('the system prompt lets the history clarify but not add facts', async () => {
    const { h } = await ask(
      { question: 'explicame eso', history, sources: ['flujo-de-deploy'] },
      { decider: decide(true) },
    )
    const system = h.llm.requests[0]!.messages[0]!.content
    expect(system).toContain('<historial> no es una fuente de hechos nuevos')
  })
})

describe('`sources` in the request body', () => {
  test('strict: wrong shapes and malformed slugs are a 400', async () => {
    for (const sources of [
      'flujo-de-deploy',
      [1],
      ['a b'],
      ['<script>'],
      ['../etc'],
      ['x'.repeat(161)],
      Array.from({ length: 9 }, (_, i) => `s${i}`),
    ]) {
      const { res } = await ask({ question: 'hola', sources })
      expect(res.status).toBe(400)
    }
  })
  test('absent or null is fine; duplicates collapse', () => {
    expect(parseSources(undefined)).toEqual([])
    expect(parseSources(null)).toEqual([])
    expect(parseSources(['a', 'a', 'b-c'])).toEqual(['a', 'b-c'])
  })
  test('unknown slugs match nothing and never fail the request', async () => {
    const { res, events } = await ask(
      { question: 'explicame eso', history, sources: ['no-existe'] },
      { decider: decide(true) },
    )
    expect(res.status).toBe(200)
    expect(slugs(events)).not.toContain('no-existe')
  })
})
