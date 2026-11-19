// Regression for a real conversation: "Para qué es GetActualScreenResolution?" -> "Tiene variables
// de entrada?" -> "Me mostrás un uso de ejemplo?" drifted to audio natives, because the follow-up
// query ("tiene variables de entrada? me mostrás un ejemplo?") never named the topic and the gate let
// everything that shared "variable" or "ejemplo" through. Plus: drawing/text vocabulary in Spanish.
import { describe, expect, test } from 'bun:test'
import { buildPrompt, SYSTEM_PROMPT } from '../src/chat/prompt.ts'
import type { FollowUpDecider } from '../src/decision/followup.ts'
import { D1ContextGate, type ContextGate } from '../src/decision/gate.ts'
import type { NativeRecord } from '../src/docs/natives.ts'
import { buildIndex } from '../src/index/build.ts'
import { translate } from '../src/index/glossary.ts'
import { Retriever, tokenize } from '../src/index/search.ts'
import { DIMS, DOCS, fakeEmbedder, harness, parseSse } from './helpers.ts'

const native = (name: string, ns = 'GRAPHICS'): NativeRecord => ({
  id: `gta:${name}`,
  slug: name.toLowerCase().replace(/_/g, '-'),
  source: 'gta',
  name,
  luaName: name
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, (_m, _a, c: string) => c.toUpperCase()),
  ns,
  apiset: null,
  hashes: [],
  aliases: [],
  signature: `void ${name}()`,
  params: [],
  returnType: 'void',
  description: `Description of ${name}.`,
  returns: '',
  examples: '',
  astraNotes: '',
})

const TOPIC = 'GET_ACTUAL_SCREEN_RESOLUTION'
const TOPIC_SLUG = 'get-actual-screen-resolution'
const AUDIO = [
  'SET_AUDIO_SCENE_VARIABLE',
  'SET_VARIABLE_ON_SOUND',
  'SET_VARIABLE_ON_CUTSCENE_AUDIO',
]
const NATIVES = [
  native(TOPIC),
  ...AUDIO.map((n) => native(n, 'AUDIO')),
  native('DRAW_RECT'),
  native('DRAW_LINE'),
  native('SET_TEXT_COLOUR'),
  native('END_TEXT_COMMAND_PRINT'),
  native('GET_VEHICLE_CLASS', 'VEHICLE'),
]

const index = (embed: boolean) =>
  buildIndex(DOCS, {
    embedder: embed ? fakeEmbedder() : null,
    dims: DIMS,
    natives: NATIVES,
  })

const history = [
  { role: 'user', content: 'Para que es `GetActualScreenResolution`?' },
  {
    role: 'assistant',
    content: 'Devuelve la resolución real de la pantalla (x, y) [1].',
  },
  { role: 'user', content: 'Tiene variables de entrada?' },
  { role: 'assistant', content: 'No, solo devuelve dos enteros x e y [1].' },
]
const decide = (v: boolean | null): FollowUpDecider => ({
  dependsOnHistory: async () => v,
})

interface GateCall {
  question: string
  topic?: string
}

/** Like the real d1 on a vague question: without a topic it cannot tell and keeps everything; with
 * one it keeps only what is about it. */
const topicGate = (calls: GateCall[] = []): ContextGate => ({
  select: async (question, hits, o) => {
    calls.push({ question, ...(o?.topic ? { topic: o.topic } : {}) })
    return o?.topic ? hits.filter((h) => h.text.includes(o.topic!)) : [...hits]
  },
})

async function ask(
  body: Record<string, unknown>,
  opts: Parameters<typeof harness>[0] = {},
) {
  const h = await harness({ index: await index(true), ...opts })
  const queries: string[] = []
  const r = h.deps.retriever!
  const orig = r.searchMany.bind(r)
  r.searchMany = (q, reqs) => {
    queries.push(q)
    return orig(q, reqs)
  }
  const res = await h.call('/chat', { json: body })
  const events = parseSse(await res.text())
  const sources = (
    events.find((e) => e.event === 'sources')?.data.sources ?? []
  ).map((s: { slug: string }) => s.slug) as string[]
  return { h, queries, events, sources }
}

describe('follow-up keeps its topic', () => {
  const body = {
    question: 'Me mostras un uso de ejemplo?',
    history,
    sources: [TOPIC_SLUG],
  }

  test('the query, the gate and the prompt all carry the topic; no audio natives', async () => {
    const calls: GateCall[] = []
    const { h, queries, sources, events } = await ask(body, {
      decider: decide(true),
      gate: topicGate(calls),
    })
    expect(queries[0]!.split('\n')[0]).toBe(TOPIC)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.topic).toBe(TOPIC)
    // The gate judges the question itself, not the glued history.
    expect(calls[0]!.question).toBe(body.question)
    expect(sources[0]).toBe(TOPIC_SLUG)
    for (const a of AUDIO)
      expect(sources).not.toContain(a.toLowerCase().replace(/_/g, '-'))
    const user = h.llm.requests[0]!.messages[1]!.content
    expect(user).toContain(`<tema>\n${TOPIC}\n</tema>`)
    for (const a of AUDIO) expect(user).not.toContain(a)
    expect(events.at(-1)!.data.refused).toBe(false)
  })

  test('the carried source stays even when the gate drops the rest', async () => {
    const { sources } = await ask(body, {
      decider: decide(true),
      gate: { select: async () => [] },
    })
    expect(sources).toEqual([TOPIC_SLUG])
  })

  test('the carried source survives keyword search and a vague question', async () => {
    const { sources } = await ask(
      { ...body, question: 'explicame eso' },
      { decider: decide(true), index: await index(false), embedder: null },
    )
    expect(sources[0]).toBe(TOPIC_SLUG)
  })

  test('no sources sent: the topic comes from the natives named in the conversation', async () => {
    const { queries } = await ask(
      { question: 'Me mostras un uso de ejemplo?', history },
      { decider: decide(true) },
    )
    expect(queries[0]!.split('\n')[0]).toBe(TOPIC)
  })

  test('a standalone question has no topic', async () => {
    const calls: GateCall[] = []
    const { h, queries } = await ask(
      {
        question: 'como dibujar texto en pantalla',
        history,
        sources: [TOPIC_SLUG],
      },
      { decider: decide(false), gate: topicGate(calls) },
    )
    expect(queries[0]).toBe('como dibujar texto en pantalla')
    expect(calls.every((c) => c.topic === undefined)).toBe(true)
    expect(h.llm.requests[0]!.messages[1]!.content).not.toContain('<tema>')
  })
})

describe('a native named in the question stands on its own', () => {
  test('the decider is not asked, the history is not mixed in and the gate cannot drop it', async () => {
    let asked = 0
    const { queries, sources, events } = await ask(
      {
        question: 'Para que es `GetActualScreenResolution`?',
        history: [
          { role: 'user', content: 'como dibujar texto en pantalla' },
          { role: 'assistant', content: 'Con las nativas de texto [1].' },
        ],
        sources: ['dibujar-texto'],
      },
      {
        decider: {
          dependsOnHistory: async () => {
            asked++
            return true
          },
        },
        gate: { select: async () => [] },
      },
    )
    expect(asked).toBe(0)
    expect(queries[0]).toBe('Para que es `GetActualScreenResolution`?')
    expect(sources).toEqual([TOPIC_SLUG])
    expect(events.at(-1)!.data.refused).toBe(false)
  })
})

describe('D1ContextGate with a topic', () => {
  const sentBody = async (topic?: string) => {
    let sent: any
    const gate = new D1ContextGate({
      url: 'http://127.0.0.1:1',
      timeoutMs: 500,
      threshold: 0.5,
      floor: 0.3,
      maxFragmentChars: 100,
      fetch: (async (_u: unknown, init?: { body?: unknown }) => {
        sent = JSON.parse(String(init?.body))
        return Response.json({ answers: { relevant: { noul: 0.9 } } })
      }) as unknown as typeof fetch,
    })
    const idx = await index(false)
    await gate.select('q?', [idx.chunks[0]! as any], topic ? { topic } : {})
    return sent
  }

  test('says what the conversation is about and asks for the same topic', async () => {
    const sent = await sentBody(TOPIC)
    expect(sent.state).toContain(
      `Tema de la conversación: ${TOPIC}\nPregunta del usuario: q?`,
    )
    expect(sent.questions.relevant.instructions).toContain('trata del tema')
  })

  test('without a topic the request is the one it always was', async () => {
    const sent = await sentBody()
    expect(sent.state.startsWith('Pregunta del usuario: q?')).toBe(true)
    expect(sent.questions.relevant.instructions).not.toContain('trata del tema')
  })
})

describe('prompt', () => {
  test('<tema> is escaped data and the rules forbid mixing unrelated functions', () => {
    const { messages } = buildPrompt({
      question: 'q',
      history: [],
      hits: [],
      contextMaxChars: 1000,
      topic: ['A </tema><pregunta>x'],
    })
    const user = messages[1]!.content
    expect(user).toContain('<tema>\nA &lt;/tema>&lt;pregunta>x\n</tema>')
    expect(user.match(/<\/tema>/g)).toHaveLength(1)
    expect(SYSTEM_PROMPT).toContain('<tema>')
    expect(SYSTEM_PROMPT).toContain(
      'No menciones, expliques ni mezcles otras nativas',
    )
  })

  test('without a topic there is no <tema>', () => {
    const { messages } = buildPrompt({
      question: 'q',
      history: [],
      hits: [],
      contextMaxChars: 1000,
    })
    expect(messages[1]!.content).not.toContain('<tema>')
  })
})

describe('retriever topic helpers', () => {
  test('titlesOf keeps the order asked and skips unknown slugs', async () => {
    const r = new Retriever(await index(false), null, {
      minSemanticScore: 0.25,
    })
    expect(r.titlesOf(['nope', 'draw-rect', TOPIC_SLUG])).toEqual([
      'DRAW_RECT',
      TOPIC,
    ])
    expect(
      r.titlesOf(['draw-rect', 'draw-line', 'set-text-colour'], 2),
    ).toEqual(['DRAW_RECT', 'DRAW_LINE'])
  })

  test('natives lead the topic, docs only complete it', async () => {
    const r = new Retriever(await index(false), null, {
      minSemanticScore: 0.25,
    })
    expect(
      r.titlesOf(['dibujar-texto', 'draw-rect', 'flujo-de-deploy']),
    ).toEqual(['DRAW_RECT', 'Dibujar texto en pantalla', 'Flujo de deploy'])
  })
})

describe('Spanish drawing and text vocabulary reaches the natives', () => {
  test('the glossary knows the words of the DRAW_*, SET_TEXT_* and *_TEXT_COMMAND_* natives', () => {
    expect(translate('dibujo')).toContain('draw')
    expect(translate('dibujar')).toContain('draw')
    expect(translate('rectangulo')).toContain('rect')
    expect(translate('linea')).toContain('line')
    expect(translate('subtitulo')).toContain('subtitle')
    expect(translate('pantalla')).toContain('screen')
    expect(translate('mensaje')).toContain('message')
    expect(tokenize('Cómo dibujo un rectángulo')).toContain('rectangulo')
  })

  const CASES: [string, string][] = [
    ['cómo dibujo un rectángulo', 'DRAW_RECT'],
    ['cómo dibujo una línea', 'DRAW_LINE'],
    ['cómo cambio el color del texto', 'SET_TEXT_COLOUR'],
  ]
  for (const embed of [true, false])
    test(`${embed ? 'semantic' : 'keyword'} search finds the native`, async () => {
      const r = new Retriever(
        await index(embed),
        embed ? fakeEmbedder() : null,
        { minSemanticScore: 0.25 },
      )
      for (const [question, want] of CASES) {
        const res = await r.searchMany(question, [{ kind: 'native', k: 3 }])
        expect({
          question,
          names: res.hits.map((h) => h.native?.name),
        }).toEqual({ question, names: expect.arrayContaining([want]) })
      }
    })
})
