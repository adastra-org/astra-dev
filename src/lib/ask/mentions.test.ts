import { describe, expect, test } from 'bun:test'
import {
  applyMention,
  bodies,
  canAdd,
  detectTrigger,
  issueMention,
  MENTIONS_MAX_ITEMS,
  MENTION_SESSIONS_MAX_TOTAL,
  nativeMention,
  searchIssueMentions,
  searchNativeMentions,
  sessionMention,
  type Mention,
} from './mentions'
import { AskStore } from './store'
import { SessionStore } from './sessions'

describe('detectTrigger', () => {
  test('@ al inicio o tras un espacio, con lo escrito hasta el cursor', () => {
    expect(detectTrigger('@bl', 3)).toEqual({ start: 0, query: 'bl' })
    expect(detectTrigger('hola @bl', 8)).toEqual({ start: 5, query: 'bl' })
    expect(detectTrigger('hola @', 6)).toEqual({ start: 5, query: '' })
    expect(detectTrigger('a\n@x', 4)).toEqual({ start: 2, query: 'x' })
  })

  test('no dispara en emails, tras un espacio de la consulta ni sin @', () => {
    expect(detectTrigger('foo@bar', 7)).toBeNull()
    expect(detectTrigger('@bl algo', 8)).toBeNull()
    expect(detectTrigger('hola', 4)).toBeNull()
    expect(detectTrigger('', 0)).toBeNull()
  })

  test('el cursor en medio solo mira hasta él; cursor fuera de rango no rompe', () => {
    expect(detectTrigger('@blip final', 3)).toEqual({ start: 0, query: 'bl' })
    expect(detectTrigger('@x', 99)).toEqual({ start: 0, query: 'x' })
    expect(detectTrigger('@x', -5)).toBeNull()
  })

  test('consulta demasiado larga no dispara', () => {
    const q = 'a'.repeat(60)
    expect(detectTrigger(`@${q}`, q.length + 1)).toBeNull()
  })
})

describe('applyMention', () => {
  test('reemplaza la @consulta por @etiqueta y deja el cursor tras el espacio', () => {
    const t = detectTrigger('mirá @bl', 8)!
    expect(applyMention('mirá @bl', t, 8, 'AddBlip')).toEqual({
      text: 'mirá @AddBlip ',
      caret: 14,
    })
  })

  test('conserva lo que sigue sin duplicar el espacio', () => {
    const t = detectTrigger('@bl y más', 3)!
    expect(applyMention('@bl y más', t, 3, 'X')).toEqual({
      text: '@X y más',
      caret: 3,
    })
  })
})

const sess = (id: string, text: string): Mention => ({
  key: `s:${id}`,
  kind: 'session',
  label: id,
  hint: id,
  body: { kind: 'session', title: id, text },
})

describe('canAdd', () => {
  test('duplicado, tope de adjuntos y tope de texto de sesiones', () => {
    const a = issueMention(1, 'uno')
    expect(canAdd([a], a)).toEqual({ ok: false, reason: 'duplicate' })

    const full = Array.from({ length: MENTIONS_MAX_ITEMS }, (_, i) =>
      issueMention(i + 10, 't'),
    )
    expect(canAdd(full, issueMention(99, 't'))).toEqual({
      ok: false,
      reason: 'max_items',
    })

    const big = sess('a', 'x'.repeat(MENTION_SESSIONS_MAX_TOTAL - 10))
    expect(canAdd([big], sess('b', 'y'.repeat(11)))).toEqual({
      ok: false,
      reason: 'max_total',
    })
    expect(canAdd([big], sess('b', 'y'.repeat(10)))).toEqual({ ok: true })
    // el tope de texto no afecta a natives ni issues
    expect(canAdd([big], nativeMention('s', 'N', ''))).toEqual({ ok: true })
  })

  test('bodies deja solo lo que viaja', () => {
    expect(
      bodies([nativeMention('slug', 'Lua', 'x'), issueMention(3, 't')]),
    ).toEqual([
      { kind: 'native', slug: 'slug' },
      { kind: 'issue', number: 3 },
    ])
  })
})

describe('constructores', () => {
  test('sesión: etiqueta de una palabra, título completo de pista, resumen en el body', () => {
    const m = sessionMention({
      id: 'x',
      title: 'Cómo crear un blip en el mapa',
      updatedAt: 1,
      turns: [{ question: 'q', answer: 'a' }],
    })
    expect(m.key).toBe('s:x')
    expect(m.label).not.toMatch(/\s/)
    expect(m.hint).toBe('Cómo crear un blip en el mapa')
    expect(m.body).toEqual({
      kind: 'session',
      title: 'Cómo crear un blip en el mapa',
      text: 'P: q\nR: a',
    })
  })

  test('issue: #número', () => {
    expect(issueMention(33, 'feat')).toMatchObject({
      key: 'i:33',
      label: '#33',
      hint: 'feat',
      body: { kind: 'issue', number: 33 },
    })
  })
})

describe('búsqueda', () => {
  test('issues: pide por GraphQL y mapea; error = lista vacía; sin consulta no pide', async () => {
    const calls: any[] = []
    const ok = (async (_u: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)))
      return new Response(
        JSON.stringify({
          data: {
            project: {
              issues: [{ number: 33, title: 'Mencionar', state: 'open' }],
            },
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    }) as unknown as typeof fetch
    const got = await searchIssueMentions(' menc ', 5, undefined, ok)
    expect(got.map((m) => m.key)).toEqual(['i:33'])
    expect(calls[0].variables).toEqual({ q: 'menc', limit: 5 })

    const fail = (async () =>
      new Response('x', { status: 500 })) as unknown as typeof fetch
    expect(await searchIssueMentions('menc', 5, undefined, fail)).toEqual([])
    expect(await searchIssueMentions('   ', 5, undefined, ok)).toEqual([])
    expect(calls).toHaveLength(1)
  })

  test('natives: menos de dos letras no busca', async () => {
    expect(await searchNativeMentions('a')).toEqual([])
  })
})

describe('AskStore con menciones', () => {
  const LIVE =
    'event: meta\ndata: {"requestId":"r","mode":"semantic","degraded":false}\n\n' +
    'event: delta\ndata: {"text":"ok"}\n\n' +
    'event: done\ndata: {"cited":[],"refused":false,"truncated":false,"usage":{"inputTokens":1,"outputTokens":1}}\n\n'

  const make = () => {
    const bodiesSeen: any[] = []
    const sessions = new SessionStore({ storage: () => null })
    const store = new AskStore({
      memories: () => [],
      sessions,
      fetch: (async (_u: string, init: RequestInit) => {
        bodiesSeen.push(JSON.parse(String(init.body)))
        return new Response(LIVE, {
          headers: { 'content-type': 'text/event-stream' },
        })
      }) as unknown as typeof fetch,
    })
    return { store, bodiesSeen, sessions }
  }

  test('envía las elegidas, las vacía y las anota en el turno', async () => {
    const { store, bodiesSeen } = make()
    expect(store.addMention(issueMention(33, 't')).ok).toBe(true)
    expect(store.addMention(issueMention(33, 't'))).toEqual({
      ok: false,
      reason: 'duplicate',
    })
    store.setDraft('qué dice @#33')
    await store.ask()
    expect(bodiesSeen[0].mentions).toEqual([{ kind: 'issue', number: 33 }])
    expect(store.getState().mentions).toEqual([])
    expect(store.getState().turns[0]!.mentions.map((m) => m.key)).toEqual([
      'i:33',
    ])
  })

  test('sin menciones el body no lleva el campo', async () => {
    const { store, bodiesSeen } = make()
    await store.ask('hola')
    expect('mentions' in bodiesSeen[0]).toBe(false)
  })

  test('removeMention quita por clave', () => {
    const { store } = make()
    store.addMention(issueMention(1, 'a'))
    store.addMention(issueMention(2, 'b'))
    store.removeMention('i:1')
    expect(store.getState().mentions.map((m) => m.key)).toEqual(['i:2'])
  })

  test('resend y edit reutilizan las menciones del turno', async () => {
    const { store, bodiesSeen } = make()
    store.addMention(nativeMention('n-slug', 'Nat', ''))
    await store.ask('uno')
    const id = store.getState().turns[0]!.id
    store.resend(id)
    await Bun.sleep(20)
    expect(bodiesSeen[1].mentions).toEqual([{ kind: 'native', slug: 'n-slug' }])
    expect(store.getState().mentions).toEqual([])
  })

  test('la conversación terminada se guarda y reset la deja mencionable', async () => {
    const { store, sessions } = make()
    await store.ask('primera pregunta')
    expect(sessions.getState().items).toHaveLength(1)
    const firstId = sessions.getState().items[0]!.id
    store.reset()
    expect(store.getState().sessionId).not.toBe(firstId)
    expect(sessions.getState().items[0]!.title).toBe('primera pregunta')
  })
})
