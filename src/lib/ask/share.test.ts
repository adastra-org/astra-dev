import { describe, expect, test } from 'bun:test'
import {
  buildSharePayload,
  createShare,
  fetchShareConfig,
  listMyShares,
  MEMORY_MASK,
  readSharedChat,
  revokeShare,
  SHARE_MAX_TEXT,
  SHARE_OFF,
  shareableTurns,
  shareUrl,
  scrubMemories,
  toAskSource,
} from './share'
import { emptyTurn, type Turn } from './store'
import { AskError, type AskSource } from './types'

const src = (n: number, slug: string): AskSource => ({
  n,
  kind: 'doc',
  slug,
  title: `Título ${slug}`,
  heading: 'Sección',
  anchor: 'rollback',
  path: `/docs/${slug}#rollback`,
  excerpt: 'extracto largo que no debe salir',
  score: 0.9,
})

const done = (id: number, over: Partial<Turn> = {}): Turn => ({
  ...emptyTurn(id, `pregunta ${id}`),
  status: 'done',
  text: `respuesta ${id}`,
  ...over,
})

const all = (turns: Turn[]) => new Set(turns.map((t) => t.id))

describe('shareableTurns', () => {
  test('solo turnos terminados o detenidos con texto', () => {
    const turns = [
      done(1),
      done(2, { status: 'streaming' }),
      done(3, { status: 'error', text: '' }),
      done(4, { status: 'stopped', text: 'a medias' }),
      done(5, { text: '   ' }),
    ]
    expect(shareableTurns(turns).map((t) => t.id)).toEqual([1, 4])
  })
})

describe('scrubMemories', () => {
  test('reemplaza literales sin distinguir mayúsculas y cuenta', () => {
    const r = scrubMemories('Uso Windows y uso windows a diario', [
      'uso windows',
    ])
    expect(r.text).toBe(`${MEMORY_MASK} y ${MEMORY_MASK} a diario`)
    expect(r.count).toBe(2)
  })
  test('ignora memorias cortas y escapa regex', () => {
    expect(scrubMemories('no es no', ['no']).count).toBe(0)
    expect(scrubMemories('costo (a+b)* total', ['(a+b)*']).text).toBe(
      `costo ${MEMORY_MASK} total`,
    )
  })
  test('la más larga primero', () => {
    const r = scrubMemories('uso Lua 5.4 y Lua 5.4 en FiveM', [
      'Lua 5.4',
      'Lua 5.4 en FiveM',
    ])
    expect(r.text).toBe(`uso ${MEMORY_MASK} y ${MEMORY_MASK}`)
  })
})

describe('buildSharePayload', () => {
  test('allow-list: no sale nada fuera de los campos permitidos', () => {
    const t = done(1, {
      thinking: 'razonamiento secreto',
      sources: [src(1, 'a'), src(2, 'b')],
      cited: [1],
      memoryTokens: 0,
      usage: { inputTokens: 1, outputTokens: 2 },
    })
    const b = buildSharePayload([t], { include: all([t]), memories: [] })
    expect(Object.keys(b.turns[0]!).sort()).toEqual([
      'cited',
      'question',
      'refused',
      'sources',
      'text',
      'truncated',
    ])
    expect(b.turns[0]!.sources).toEqual([
      { n: 1, slug: 'a', anchor: 'rollback' },
    ])
    expect(JSON.stringify(b)).not.toContain('razonamiento')
    expect(JSON.stringify(b)).not.toContain('extracto')
  })

  test('respeta la selección y excluye turnos en curso o con error', () => {
    const turns = [done(1), done(2), done(3, { status: 'error', text: '' })]
    const b = buildSharePayload(turns, {
      include: new Set([2, 3]),
      memories: [],
    })
    expect(b.turns.map((t) => t.question)).toEqual(['pregunta 2'])
  })

  test('tapa memorias en pregunta y respuesta, y avisa si hubo memorias', () => {
    const t = done(1, {
      question: 'uso Windows, ¿cómo?',
      text: 'En Windows… uso Windows',
      memoryTokens: 12,
    })
    const b = buildSharePayload([t], {
      include: all([t]),
      memories: ['uso Windows'],
    })
    expect(b.scrubbed).toBe(2)
    expect(b.withMemories).toBe(true)
    expect(b.turns[0]!.question).toBe(`${MEMORY_MASK}, ¿cómo?`)
  })

  test('tooLong cuando una respuesta pasa el tope', () => {
    const t = done(1, { text: 'x'.repeat(SHARE_MAX_TEXT + 1) })
    expect(
      buildSharePayload([t], { include: all([t]), memories: [] }).tooLong,
    ).toBe(true)
  })

  test('un rechazo no lleva fuentes y las citas se filtran a enteros 1..99', () => {
    const t = done(1, {
      refused: true,
      sources: [src(1, 'a')],
      cited: [1, 0, 100, 2.5],
    })
    const b = buildSharePayload([t], { include: all([t]), memories: [] })
    expect(b.turns[0]!.sources).toEqual([])
    expect(b.turns[0]!.cited).toEqual([1])
  })
})

describe('shareUrl', () => {
  test('origen más ruta de lectura', () => {
    expect(shareUrl('abc', 'https://dev.adastrarp.com/')).toBe(
      'https://dev.adastrarp.com/ask/s/abc',
    )
  })
})

describe('toAskSource', () => {
  test('completa lo que no viaja', () => {
    const s = toAskSource({
      n: 1,
      kind: 'doc',
      slug: 'a',
      title: 'A',
      heading: null,
      anchor: null,
      path: '/docs/a',
    })
    expect(s.excerpt).toBe('')
    expect(s.score).toBe(0)
  })
})

/** `fetch` simulado que devuelve `body` con `status` y guarda la última petición. */
function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return new Response(JSON.stringify(body), { status })
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe('llamadas GraphQL', () => {
  test('fetchShareConfig: datos del server, o apagado si falla', async () => {
    const cfg = {
      enabled: true,
      maxTurns: 20,
      defaultTtlHours: 168,
      maxTtlHours: 720,
    }
    const ok = fakeFetch({ data: { shareConfig: cfg } })
    expect(await fetchShareConfig({ fetch: ok.fn, base: '/api' })).toEqual(cfg)
    expect(ok.calls[0]!.url).toBe('/api/graphql')
    expect(ok.calls[0]!.init.credentials).toBe('same-origin')
    const bad = fakeFetch({ error: { code: 'internal' } }, 500)
    expect(await fetchShareConfig({ fetch: bad.fn })).toEqual(SHARE_OFF)
  })

  test('createShare manda solo lo que se le pasa y devuelve el token', async () => {
    const f = fakeFetch({
      data: {
        shareChat: {
          id: 'i',
          token: 't',
          audience: 'staff',
          expiresAt: '2026-11-26T00:00:00Z',
        },
      },
    })
    const turns = [
      {
        question: 'q',
        text: 'a',
        refused: false,
        truncated: false,
        cited: [],
        sources: [],
      },
    ]
    const r = await createShare(
      { turns, audience: 'staff', ttlHours: 24 },
      { fetch: f.fn },
    )
    expect(r.token).toBe('t')
    const sent = JSON.parse(String(f.calls[0]!.init.body))
    expect(sent.variables).toEqual({ turns, audience: 'staff', ttl: 24 })
  })

  test('errores GraphQL: código estable, estado y retryAfter', async () => {
    const f = fakeFetch(
      {
        errors: [
          {
            message: 'x',
            extensions: { code: 'rate_limited', retryAfter: 30 },
          },
        ],
        data: null,
      },
      200,
    )
    const e = await listMyShares({ fetch: f.fn }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(AskError)
    expect((e as AskError).code).toBe('rate_limited')
    expect((e as AskError).retryAfter).toBe(30)
  })

  test('errores HTTP previos a GraphQL ({ error: { code } })', async () => {
    const f = fakeFetch(
      { error: { code: 'forbidden_origin', message: 'no' } },
      403,
    )
    const e = await revokeShare('x', { fetch: f.fn }).catch((x: unknown) => x)
    expect((e as AskError).code).toBe('forbidden_origin')
    expect((e as AskError).status).toBe(403)
  })

  test('share_not_found al leer; sin red es "network"', async () => {
    const nf = fakeFetch(
      { errors: [{ message: 'n', extensions: { code: 'share_not_found' } }] },
      200,
    )
    const e1 = await readSharedChat('tok', { fetch: nf.fn }).catch(
      (x: unknown) => x,
    )
    expect((e1 as AskError).code).toBe('share_not_found')
    const down = (async () => {
      throw new TypeError('fail')
    }) as unknown as typeof fetch
    const e2 = await readSharedChat('tok', { fetch: down }).catch(
      (x: unknown) => x,
    )
    expect((e2 as AskError).code).toBe('network')
  })
})
