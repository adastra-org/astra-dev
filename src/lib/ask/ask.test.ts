import { describe, expect, test } from 'bun:test'
import { streamChat } from './client'
import { describeError, waitLabel } from './errors'
import { parseAnswer, withCitations } from './markdown'
import { SseParser } from './sse'
import { AskStore, applyEvent, emptyTurn, historyFor } from './store'
import { type AskError, type AskEvent, type AskSource } from './types'

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

const sse = (events: AskEvent[]) =>
  events
    .map((e) => {
      const { type, ...data } = e
      return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
    })
    .join('')

const LIVE: AskEvent[] = [
  { type: 'meta', requestId: 'r1', mode: 'semantic', degraded: false },
  { type: 'sources', sources: [source(1), source(2)] },
  { type: 'delta', text: 'Hola ' },
  { type: 'delta', text: 'mundo [1].' },
  {
    type: 'done',
    cited: [1],
    refused: false,
    truncated: false,
    usage: { inputTokens: 10, outputTokens: 5 },
  },
]

/** Respuesta SSE que llega en trozos de `size` bytes (corta eventos a la mitad). */
function streamed(body: string, size: number, status = 200): Response {
  const bytes = new TextEncoder().encode(body)
  let i = 0
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(c) {
        if (i >= bytes.length) return c.close()
        c.enqueue(bytes.slice(i, i + size))
        i += size
      },
    }),
    { status, headers: { 'content-type': 'text/event-stream' } },
  )
}

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

/** Rechazo de streamChat (falla el test si no rechaza). */
const rejected = async (p: Promise<void>): Promise<AskError> => {
  try {
    await p
  } catch (e) {
    return e as AskError
  }
  throw new Error('expected streamChat to reject')
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('SseParser', () => {
  test('arma eventos aunque lleguen cortados en cualquier punto', () => {
    const text = sse(LIVE)
    for (const size of [1, 3, 7, 50, text.length]) {
      const p = new SseParser()
      const out: AskEvent[] = []
      for (let i = 0; i < text.length; i += size)
        out.push(...p.push(text.slice(i, i + size)))
      expect(out.map((e) => e.type)).toEqual(LIVE.map((e) => e.type))
      expect(out[3]).toEqual(LIVE[3]!)
    }
  })

  test('acepta CRLF, ignora comentarios, tipos desconocidos y JSON roto', () => {
    const p = new SseParser()
    const out = p.push(
      ': keep-alive\r\n\r\nevent: nope\r\ndata: {}\r\n\r\nevent: delta\r\ndata: {bad\r\n\r\nevent: delta\r\ndata: {"text":"ok"}\r\n\r\n',
    )
    expect(out).toEqual([{ type: 'delta', text: 'ok' }])
  })
})

describe('streamChat', () => {
  test('entrega los eventos en orden y manda pregunta e historial', async () => {
    let sent: { url: string; init: RequestInit } | null = null
    const events: AskEvent[] = []
    await streamChat({
      question: 'hola',
      history: [{ role: 'user', content: 'antes' }],
      onEvent: (e) => events.push(e),
      fetch: (async (url: string, init: RequestInit) => {
        sent = { url, init }
        return streamed(sse(LIVE), 9)
      }) as unknown as typeof fetch,
    })
    expect(events.map((e) => e.type)).toEqual([
      'meta',
      'sources',
      'delta',
      'delta',
      'done',
    ])
    expect(sent!.url).toBe('/api/chat')
    expect(sent!.init.method).toBe('POST')
    expect(JSON.parse(String(sent!.init.body))).toEqual({
      question: 'hola',
      history: [{ role: 'user', content: 'antes' }],
      lang: 'es',
    })
  })

  test('manda el idioma de la interfaz', async () => {
    let body = ''
    await streamChat({
      question: 'hi',
      history: [],
      lang: 'en',
      onEvent: () => {},
      fetch: (async (_u: string, init: RequestInit) => {
        body = String(init.body)
        return new Response('event: done\ndata: {}\n\n')
      }) as unknown as typeof fetch,
    })
    expect(JSON.parse(body).lang).toBe('en')
  })

  test('error JSON previo al stream: código, estado y Retry-After', async () => {
    const run = (res: Response) =>
      rejected(
        streamChat({
          question: 'q',
          history: [],
          onEvent() {},
          fetch: (async () => res) as unknown as typeof fetch,
        }),
      )

    const rate = await run(
      json(
        429,
        { error: { code: 'rate_limited', message: 'x' } },
        { 'retry-after': '42' },
      ),
    )
    expect(rate).toMatchObject({
      code: 'rate_limited',
      status: 429,
      retryAfter: 42,
    })

    const budget = await run(
      json(429, {
        error: { code: 'budget_exceeded', message: 'x', retryAfter: 7200 },
      }),
    )
    expect(budget).toMatchObject({ code: 'budget_exceeded', retryAfter: 7200 })

    const auth = await run(
      json(401, { error: { code: 'unauthenticated', message: 'x' } }),
    )
    expect(auth.code).toBe('unauthenticated')

    const gateway = await run(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    )
    expect(gateway.code).toBe('server_unavailable')
  })

  test('sin red: network. Stream sin done: stream_interrupted', async () => {
    const net = await rejected(
      streamChat({
        question: 'q',
        history: [],
        onEvent() {},
        fetch: (async () => {
          throw new TypeError('Failed to fetch')
        }) as unknown as typeof fetch,
      }),
    )
    expect(net.code).toBe('network')

    const cut = await rejected(
      streamChat({
        question: 'q',
        history: [],
        onEvent() {},
        fetch: (async () =>
          streamed(sse(LIVE.slice(0, 3)), 20)) as unknown as typeof fetch,
      }),
    )
    expect(cut.code).toBe('stream_interrupted')
  })

  test('un evento error termina bien: lo maneja quien escucha', async () => {
    const events: AskEvent[] = []
    await streamChat({
      question: 'q',
      history: [],
      onEvent: (e) => events.push(e),
      fetch: (async () =>
        streamed(
          sse([{ type: 'error', code: 'llm_unavailable', message: 'x' }]),
          100,
        )) as unknown as typeof fetch,
    })
    expect(events).toEqual([
      { type: 'error', code: 'llm_unavailable', message: 'x' },
    ])
  })
})

describe('applyEvent / historyFor', () => {
  test('acumula la respuesta y marca el estado', () => {
    let t = emptyTurn(1, 'hola')
    for (const e of LIVE) t = applyEvent(t, e)
    expect(t).toMatchObject({
      status: 'done',
      text: 'Hola mundo [1].',
      cited: [1],
      mode: 'semantic',
      cached: false,
    })
    expect(t.sources).toHaveLength(2)
    expect(applyEvent(emptyTurn(1, 'q'), LIVE[2]!).status).toBe('streaming')
  })

  test('el historial usa solo intercambios terminados y sin rechazo, los últimos 3', () => {
    const done = (id: number, text: string, extra = {}) => ({
      ...emptyTurn(id, `q${id}`),
      status: 'done' as const,
      text,
      ...extra,
    })
    const turns = [
      done(1, 'a1'),
      done(2, 'a2', { refused: true }),
      { ...emptyTurn(3, 'q3'), status: 'error' as const },
      done(4, 'a4'),
      done(5, 'a5'),
      done(6, 'a6'),
      emptyTurn(7, 'q7'),
    ]
    const h = historyFor(turns)
    expect(h.map((x) => x.content)).toEqual([
      'q4',
      'a4',
      'q5',
      'a5',
      'q6',
      'a6',
    ])
  })
})

describe('AskStore', () => {
  const make = (handler: (call: number) => Response | Promise<Response>) => {
    let calls = 0
    const bodies: any[] = []
    const store = new AskStore({
      fetch: (async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)))
        return handler(calls++)
      }) as unknown as typeof fetch,
    })
    return { store, bodies }
  }

  test('pregunta, transmite y termina; el borrador se vacía', async () => {
    const { store } = make(() => streamed(sse(LIVE), 16))
    store.setDraft('  hola  ')
    await store.ask()
    const s = store.getState()
    expect(s.draft).toBe('')
    expect(s.turns).toHaveLength(1)
    expect(s.turns[0]).toMatchObject({
      question: 'hola',
      status: 'done',
      text: 'Hola mundo [1].',
    })
  })

  test('la segunda pregunta lleva el historial de la primera', async () => {
    const { store, bodies } = make(() => streamed(sse(LIVE), 64))
    await store.ask('primera')
    await store.ask('segunda')
    expect(bodies[1].history).toEqual([
      { role: 'user', content: 'primera' },
      { role: 'assistant', content: 'Hola mundo [1].' },
    ])
  })

  test('un error previo al stream queda en el turno y retry lo reemplaza', async () => {
    const { store } = make((n) =>
      n === 0
        ? json(
            429,
            { error: { code: 'rate_limited', message: 'x' } },
            { 'retry-after': '30' },
          )
        : streamed(sse(LIVE), 64),
    )
    await store.ask('hola')
    expect(store.getState().turns[0]).toMatchObject({
      status: 'error',
      error: { code: 'rate_limited', retryAfter: 30 },
    })
    store.retry(store.getState().turns[0]!.id)
    await wait(30)
    const turns = store.getState().turns
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ question: 'hola', status: 'done' })
  })

  test('un evento error en medio conserva el texto parcial', async () => {
    const { store } = make(() =>
      streamed(
        sse([
          LIVE[0]!,
          LIVE[1]!,
          LIVE[2]!,
          { type: 'error', code: 'llm_unavailable', message: 'x' },
        ]),
        32,
      ),
    )
    await store.ask('hola')
    expect(store.getState().turns[0]).toMatchObject({
      status: 'error',
      text: 'Hola ',
      error: { code: 'llm_unavailable' },
    })
  })

  test('401 marca al visitante como público', async () => {
    const { store } = make(() =>
      json(401, { error: { code: 'unauthenticated', message: 'x' } }),
    )
    await store.ask('hola')
    expect(store.getState().viewerRole).toBe('public')
  })

  test('stop corta y conserva lo recibido; no se pregunta dos veces a la vez', async () => {
    const enc = new TextEncoder()
    const { store } = make(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(enc.encode(sse([LIVE[0]!, LIVE[1]!, LIVE[2]!])))
              // El stream queda abierto: el servidor sigue "pensando".
            },
          }),
        ),
    )
    const first = store.ask('hola')
    await wait(30)
    expect(store.busy).toBe(true)
    await store.ask('otra') // ignorada: hay una en curso
    expect(store.getState().turns).toHaveLength(1)
    store.stop()
    await first
    expect(store.getState().turns[0]).toMatchObject({
      status: 'stopped',
      text: 'Hola ',
    })
    expect(store.busy).toBe(false)
  })

  test('open(semilla) pregunta, reset vacía y close cierra', async () => {
    const { store } = make(() => streamed(sse(LIVE), 64))
    store.open('con semilla')
    await wait(40)
    expect(store.getState().open).toBe(true)
    expect(store.getState().turns[0]?.question).toBe('con semilla')
    store.reset()
    expect(store.getState().turns).toEqual([])
    store.close()
    expect(store.getState().open).toBe(false)
  })
})

describe('markdown seguro', () => {
  test('texto, énfasis, código y citas válidas', () => {
    const b = parseAnswer('Usa **Wait(0)** y `DrawText` [1] y [9].', 2)
    expect(b).toEqual([
      {
        kind: 'p',
        children: [
          { kind: 'text', text: 'Usa ' },
          { kind: 'strong', children: [{ kind: 'text', text: 'Wait(0)' }] },
          { kind: 'text', text: ' y ' },
          { kind: 'code', text: 'DrawText' },
          { kind: 'text', text: ' ' },
          { kind: 'cite', n: 1 },
          { kind: 'text', text: ' y [9].' },
        ],
      },
    ])
  })

  test('bloques de código y listas', () => {
    const b = parseAnswer('1. uno\n2. dos [2]\n\n```lua\nprint(1)\n```', 2)
    expect(b[0]).toMatchObject({ kind: 'list', ordered: true })
    expect((b[0] as any).items).toHaveLength(2)
    expect(b[1]).toEqual({ kind: 'code', lang: 'lua', text: 'print(1)' })
  })

  test('sin HTML, imágenes ni enlaces del modelo', () => {
    const b = parseAnswer(
      '<script>alert(1)</script>\n\n![x](https://evil.test/a.png) [clic](https://evil.test) <img src=x onerror=alert(1)>',
      1,
    )
    const flat = JSON.stringify(b)
    expect(flat).not.toContain('evil.test')
    expect(flat).not.toContain('"kind":"link"')
    expect(flat).not.toContain('"kind":"image"')
    // El HTML queda como texto literal (React lo escapa), no como nodo.
    expect(flat).toContain('<script>')
  })

  test('tablas: encabezado y filas con sus celdas', () => {
    const b = parseAnswer('| A | B |\n| --- | --- |\n| `x` | y [1] |', 1)
    expect(b).toHaveLength(1)
    const t = b[0] as Extract<(typeof b)[number], { kind: 'table' }>
    expect(t.kind).toBe('table')
    expect(t.head).toEqual([
      [{ kind: 'text', text: 'A' }],
      [{ kind: 'text', text: 'B' }],
    ])
    expect(t.rows[0]![0]).toEqual([{ kind: 'code', text: 'x' }])
    expect(t.rows[0]![1]).toEqual([
      { kind: 'text', text: 'y ' },
      { kind: 'cite', n: 1 },
    ])
  })

  test('un bloque de código sin cerrar (stream a medias) no rompe', () => {
    const b = parseAnswer('Mira:\n\n```lua\nprint(', 1)
    expect(b.at(-1)).toMatchObject({ kind: 'code' })
  })

  test('withCitations ignora números fuera de rango', () => {
    expect(withCitations('[0] [3]', 2)).toEqual([
      { kind: 'text', text: '[0] [3]' },
    ])
  })
})

describe('mensajes de error', () => {
  test('cada código tiene mensaje y si se puede reintentar', () => {
    expect(describeError('unauthenticated').retry).toBe(true)
    expect(describeError('unauthenticated').action?.href).toBe(
      'https://adastrarp.com',
    )
    expect(describeError('subscription_required').retry).toBe(false)
    expect(describeError('budget_exceeded', 7200).hint).toContain('2 h')
    expect(describeError('budget_exceeded').retry).toBe(false)
    expect(describeError('rate_limited', 45).hint).toContain('45 s')
    expect(describeError('rate_limited', 45).retry).toBe(true)
    expect(describeError('llm_unavailable').retry).toBe(true)
    expect(describeError('network').retry).toBe(true)
    expect(describeError('desconocido').retry).toBe(true)
  })

  test('waitLabel', () => {
    expect(waitLabel(5)).toBe('5 s')
    expect(waitLabel(300)).toBe('5 min')
    expect(waitLabel(7200)).toBe('2 h')
  })
})
