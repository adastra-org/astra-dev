// Página y panel comparten el store: editar, reenviar y rebobinar, medidas de tiempo y la ventana
// de contexto que llega en `meta`. Mismo patrón que ask.test.ts: `fetch` simulado, sin red.
import { describe, expect, test } from 'bun:test'
import { AskStore } from './store'
import type { AskEvent, AskSource } from './types'

const src: AskSource = {
  n: 1,
  kind: 'doc',
  slug: 'doc-1',
  title: 'Doc 1',
  heading: null,
  anchor: null,
  path: '/docs/doc-1',
  excerpt: 'x',
  score: 0.9,
}

const sse = (events: AskEvent[]) =>
  events
    .map((e) => {
      const { type, ...data } = e
      return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
    })
    .join('')

const answer = (text: string, contextWindow?: number): AskEvent[] => [
  {
    type: 'meta',
    requestId: 'r',
    mode: 'semantic',
    degraded: false,
    ...(contextWindow === undefined ? {} : { contextWindow }),
  },
  { type: 'sources', sources: [src] },
  { type: 'delta', text },
  {
    type: 'done',
    cited: [],
    refused: false,
    truncated: false,
    usage: { inputTokens: 40, outputTokens: 10 },
  },
]

const respond = (text: string, contextWindow?: number) =>
  new Response(sse(answer(text, contextWindow)), {
    headers: { 'content-type': 'text/event-stream' },
  })

/** Espera a que no haya ninguna respuesta en curso. */
async function settle(store: AskStore) {
  for (let i = 0; i < 200 && store.busy; i++)
    await new Promise((r) => setTimeout(r, 2))
}

function make(
  handler: (call: number, body: Record<string, unknown>) => Response,
  now?: () => number,
) {
  let calls = 0
  const bodies: Record<string, unknown>[] = []
  const store = new AskStore({
    ...(now ? { now } : {}),
    fetch: (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      bodies.push(body)
      return handler(calls++, body)
    }) as unknown as typeof fetch,
  })
  return { store, bodies }
}

describe('contexto y tiempos', () => {
  test('meta lleva la ventana del modelo al store', async () => {
    const { store } = make(() => respond('Hola', 8192))
    await store.ask('hola')
    expect(store.getState().contextWindow).toBe(8192)
  })

  test('sin ventana en meta el store la deja en null', async () => {
    const { store } = make(() => respond('Hola'))
    await store.ask('hola')
    expect(store.getState().contextWindow).toBeNull()
  })

  test('mide envío, primer texto y fin con el reloj del store', async () => {
    // Cada evento (incluido el inicio) avanza el reloj 100 ms: inicio 100, meta 200, sources 300,
    // primer delta 400, done 500.
    let clock = 0
    const { store } = make(
      () => respond('Hola'),
      () => (clock += 100),
    )
    await store.ask('hola')
    const t = store.getState().turns[0]!
    expect(t.timing).toEqual({ startedAt: 100, firstDeltaAt: 400, doneAt: 500 })
    expect(t.usage).toEqual({ inputTokens: 40, outputTokens: 10 })
  })
})

describe('editar, reenviar y rebobinar', () => {
  test('editar corta el turno y reenvía el texto nuevo sin el historial viejo', async () => {
    const { store, bodies } = make((call) => respond(`respuesta ${call}`))
    await store.ask('primera')
    await store.ask('segunda')
    const first = store.getState().turns[0]!.id
    store.edit(first, '  primera editada ')
    await settle(store)

    const turns = store.getState().turns
    expect(turns).toHaveLength(1)
    expect(turns[0]!.question).toBe('primera editada')
    expect(turns[0]!.status).toBe('done')
    expect(bodies.at(-1)).toMatchObject({
      question: 'primera editada',
      history: [],
    })
  })

  test('reenviar repite la pregunta desde ese punto con el historial anterior', async () => {
    const { store, bodies } = make((call) => respond(`respuesta ${call}`))
    await store.ask('uno')
    await store.ask('dos')
    await store.ask('tres')
    const second = store.getState().turns[1]!.id
    store.resend(second)
    await settle(store)

    const turns = store.getState().turns
    expect(turns.map((t) => t.question)).toEqual(['uno', 'dos'])
    expect(turns[1]!.id).not.toBe(second)
    expect(bodies.at(-1)).toMatchObject({ question: 'dos' })
    // El historial es solo lo que queda antes del turno reenviado.
    expect(bodies.at(-1)!.history).toEqual([
      { role: 'user', content: 'uno' },
      { role: 'assistant', content: 'respuesta 0' },
    ])
  })

  test('editar con texto vacío no toca la conversación', async () => {
    const { store } = make(() => respond('ok'))
    await store.ask('hola')
    const id = store.getState().turns[0]!.id
    store.edit(id, '   ')
    await settle(store)
    expect(store.getState().turns).toHaveLength(1)
  })

  test('rebobinar con una respuesta en curso la corta y la quita', async () => {
    const enc = new TextEncoder()
    // Stream que manda meta y nunca termina, hasta que el store lo corta.
    const { store } = make(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(enc.encode(sse(answer('', 8192).slice(0, 1))))
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    )
    const pending = store.ask('lenta')
    for (let i = 0; i < 100 && store.getState().contextWindow === null; i++)
      await new Promise((r) => setTimeout(r, 2))
    const id = store.getState().turns[0]!.id
    store.rewind(id)
    await pending
    expect(store.getState().turns).toHaveLength(0)
    expect(store.busy).toBe(false)
  })

  test('rebobinar un id que no existe no hace nada', async () => {
    const { store } = make(() => respond('ok'))
    await store.ask('hola')
    store.rewind(9999)
    expect(store.getState().turns).toHaveLength(1)
  })
})
