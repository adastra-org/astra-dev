import { describe, expect, test } from 'bun:test'
import {
  QUOTE_MAX,
  QUOTE_MAX_CHARS,
  addQuote,
  composeQuestion,
  makeQuote,
  questionRoom,
  quotePrefix,
  quoteSlugs,
} from './quote'
import { AskStore } from './store'
import { ASK_MAX_QUESTION, type AskEvent, type AskSource } from './types'

const source = (n: number, over: Partial<AskSource> = {}): AskSource => ({
  n,
  kind: 'doc',
  slug: `doc-${n}`,
  title: `Doc ${n}`,
  heading: null,
  anchor: null,
  path: `/docs/doc-${n}`,
  excerpt: '',
  score: 0.5,
  ...over,
})

const SOURCES = [source(1), source(2), source(3)]

describe('makeQuote', () => {
  test('colapsa espacios y deja las fuentes citadas, sin repetir y en orden', () => {
    const q = makeQuote('  un   fragmento\n  largo ', [2, 1, 2], SOURCES)
    expect(q?.text).toBe('un fragmento largo')
    expect(q?.sources.map((s) => s.slug)).toEqual(['doc-2', 'doc-1'])
  })

  test('descarta citas sin fuente y no inventa fuentes', () => {
    const q = makeQuote('texto', [9], SOURCES)
    expect(q?.sources).toEqual([])
  })

  test('sin texto no hay cita', () => {
    expect(makeQuote('  \n ', [1], SOURCES)).toBeNull()
  })

  test('recorta el fragmento largo con elipsis', () => {
    const q = makeQuote('a'.repeat(QUOTE_MAX_CHARS + 50), [], SOURCES)
    expect(q?.text.length).toBe(QUOTE_MAX_CHARS)
    expect(q?.text.endsWith('…')).toBe(true)
  })
})

describe('addQuote / quoteSlugs', () => {
  const q = (text: string, n: number[] = []) => makeQuote(text, n, SOURCES)!

  test('una repetida no suma', () => {
    const list = addQuote([q('a')], q('a'))
    expect(list).toHaveLength(1)
  })

  test('al pasar el tope se va la más vieja', () => {
    let list = [] as ReturnType<typeof addQuote>
    for (const t of ['a', 'b', 'c']) list = addQuote(list, q(t))
    expect(QUOTE_MAX).toBe(2)
    expect(list.map((x) => x.text)).toEqual(['b', 'c'])
  })

  test('slugs únicos en orden', () => {
    expect(quoteSlugs([q('a', [1, 2]), q('b', [2, 3])])).toEqual([
      'doc-1',
      'doc-2',
      'doc-3',
    ])
  })
})

describe('composeQuestion', () => {
  const q = makeQuote('fragmento', [1, 2], SOURCES)!

  test('sin citas es la pregunta tal cual', () => {
    expect(composeQuestion([], 'hola')).toBe('hola')
    expect(questionRoom([])).toBe(ASK_MAX_QUESTION)
  })

  test('antepone el fragmento y los títulos de sus fuentes', () => {
    expect(composeQuestion([q], 'por qué')).toBe(
      '«fragmento» (Doc 1; Doc 2)\n\npor qué',
    )
  })

  test('nunca pasa el tope del server, ni con el máximo de citas', () => {
    const long = (t: string) =>
      makeQuote(
        t.repeat(QUOTE_MAX_CHARS),
        [1, 2, 3],
        [
          source(1, { title: 'T'.repeat(80) }),
          source(2, { title: 'U'.repeat(80) }),
          source(3),
        ],
      )!
    const quotes = [long('x'), long('y')]
    const out = composeQuestion(quotes, 'z'.repeat(ASK_MAX_QUESTION))
    expect(out.length).toBeLessThanOrEqual(ASK_MAX_QUESTION)
    expect(questionRoom(quotes)).toBe(
      ASK_MAX_QUESTION - quotePrefix(quotes).length,
    )
    // Lo recortado es lo escrito, no el fragmento.
    expect(out.startsWith(quotePrefix(quotes))).toBe(true)
  })
})

describe('AskStore: citas', () => {
  const LIVE: AskEvent[] = [
    { type: 'meta', requestId: 'r1', mode: 'semantic', degraded: false },
    { type: 'sources', sources: SOURCES },
    { type: 'delta', text: 'Hola [1].' },
    {
      type: 'done',
      cited: [1],
      refused: false,
      truncated: false,
      usage: { inputTokens: 10, outputTokens: 5 },
    },
  ]
  const body = LIVE.map((e) => {
    const { type, ...data } = e
    return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  }).join('')

  const make = () => {
    const bodies: any[] = []
    const store = new AskStore({
      memories: () => [],
      fetch: (async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)))
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      }) as unknown as typeof fetch,
    })
    return { store, bodies }
  }

  test('las citas del campo viajan con la pregunta, sus slugs van como sources y se consumen', async () => {
    const { store, bodies } = make()
    await store.ask('primera')
    store.addQuote(makeQuote('un dato', [3], SOURCES)!)
    await store.ask('y esto?')
    expect(bodies[1].question).toBe('«un dato» (Doc 3)\n\ny esto?')
    expect(bodies[1].sources).toEqual(['doc-3'])
    const s = store.getState()
    expect(s.quotes).toEqual([])
    expect(s.turns[1]!.question).toBe('y esto?')
    expect(s.turns[1]!.quotes.map((x) => x.text)).toEqual(['un dato'])
  })

  test('sin fuentes en la cita siguen las de la última respuesta', async () => {
    const { store, bodies } = make()
    await store.ask('primera')
    store.addQuote(makeQuote('sin cita', [], SOURCES)!)
    await store.ask('segunda')
    expect(bodies[1].sources).toEqual(['doc-1', 'doc-2', 'doc-3'])
  })

  test('removeQuote y reset vacían el campo', async () => {
    const { store } = make()
    store.addQuote(makeQuote('a', [], SOURCES)!)
    store.addQuote(makeQuote('b', [], SOURCES)!)
    store.removeQuote('a')
    expect(store.getState().quotes.map((q) => q.text)).toEqual(['b'])
    store.reset()
    expect(store.getState().quotes).toEqual([])
  })

  test('reenviar y editar conservan las citas del turno; el historial las incluye', async () => {
    const { store, bodies } = make()
    store.addQuote(makeQuote('un dato', [3], SOURCES)!)
    await store.ask('uno')
    const id = store.getState().turns[0]!.id
    store.resend(id)
    await Bun.sleep(20)
    expect(bodies[1].question).toBe('«un dato» (Doc 3)\n\nuno')
    expect(store.getState().turns[0]!.quotes).toHaveLength(1)

    const id2 = store.getState().turns[0]!.id
    store.edit(id2, 'uno editado')
    await Bun.sleep(20)
    expect(bodies[2].question).toBe('«un dato» (Doc 3)\n\nuno editado')

    await store.ask('dos')
    expect(bodies[3].history[0].content).toBe(
      '«un dato» (Doc 3)\n\nuno editado',
    )
  })
})
