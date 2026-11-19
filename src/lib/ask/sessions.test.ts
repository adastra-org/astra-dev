import { describe, expect, test } from 'bun:test'
import {
  parseStored,
  SESSIONS_KEY,
  SESSIONS_MAX,
  SESSION_MAX_TURNS,
  SessionStore,
  searchSessions,
  serialize,
  summarize,
  type Session,
} from './sessions'

const session = (id: string, over: Partial<Session> = {}): Session => ({
  id,
  title: `Sesión ${id}`,
  updatedAt: 1,
  turns: [{ question: `pregunta ${id}`, answer: `respuesta ${id}` }],
  ...over,
})

class FakeStorage {
  data = new Map<string, string>()
  getItem = (k: string) => this.data.get(k) ?? null
  setItem = (k: string, v: string) => void this.data.set(k, v)
}

describe('parseStored', () => {
  test('vacío, roto o de otra versión = lista vacía', () => {
    expect(parseStored(null)).toEqual([])
    expect(parseStored('no json')).toEqual([])
    expect(parseStored('{"v":2,"items":[]}')).toEqual([])
    expect(parseStored('{"v":1,"items":"x"}')).toEqual([])
  })

  test('descarta lo malformado y ordena por fecha', () => {
    const raw = JSON.stringify({
      v: 1,
      items: [
        session('a', { updatedAt: 1 }),
        { id: 'b' },
        session('c', { updatedAt: 9 }),
        session('a', { updatedAt: 5 }),
        session('d', { turns: [{ question: 'q', answer: 3 }] as never }),
      ],
    })
    expect(parseStored(raw).map((s) => s.id)).toEqual(['c', 'a'])
  })

  test('ida y vuelta por serialize', () => {
    const items = [session('a'), session('b', { updatedAt: 0 })]
    expect(parseStored(serialize(items))).toEqual(items)
  })
})

describe('summarize', () => {
  const turns = Array.from({ length: 6 }, (_, i) => ({
    question: `q${i}`,
    answer: 'x'.repeat(500),
  }))

  test('entra en el máximo y se queda con lo más reciente, en orden', () => {
    const out = summarize({ turns }, 1200)
    expect(out.length).toBeLessThanOrEqual(1200)
    expect(out).toContain('P: q5')
    expect(out).not.toContain('P: q0')
    expect(out.indexOf('P: q4')).toBeLessThan(out.indexOf('P: q5'))
  })

  test('si ni un intercambio entra, manda el último recortado', () => {
    const out = summarize({ turns }, 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.startsWith('P: ')).toBe(true)
  })

  test('sesión sin intercambios = texto vacío', () => {
    expect(summarize({ turns: [] })).toBe('')
  })
})

describe('searchSessions', () => {
  const items = [
    session('a', { title: 'Mapas de blips' }),
    session('b', {
      title: 'Otra',
      turns: [{ question: 'cómo creo un blip', answer: 'con AddBlipForCoord' }],
    }),
    session('c', { title: 'Inventario' }),
  ]

  test('sin consulta devuelve las primeras, respetando exclude y limit', () => {
    expect(
      searchSessions(items, '', { exclude: 'a' }).map((s) => s.id),
    ).toEqual(['b', 'c'])
    expect(searchSessions(items, '', { limit: 1 })).toHaveLength(1)
  })

  test('todas las palabras, en título o contenido, sin distinguir mayúsculas', () => {
    expect(searchSessions(items, 'BLIP').map((s) => s.id)).toEqual(['a', 'b'])
    expect(searchSessions(items, 'blip addblip').map((s) => s.id)).toEqual([
      'b',
    ])
    expect(searchSessions(items, 'nada')).toEqual([])
  })
})

describe('SessionStore', () => {
  const make = (storage: () => FakeStorage | null) => {
    let t = 0
    return new SessionStore({ storage, now: () => ++t })
  }

  test('guarda, reemplaza y queda arriba la más reciente', () => {
    const fake = new FakeStorage()
    const store = make(() => fake)
    store.save('a', [{ question: 'uno', answer: 'r1' }])
    store.save('b', [{ question: 'dos', answer: 'r2' }])
    store.save('a', [
      { question: 'uno', answer: 'r1' },
      { question: 'tres', answer: 'r3' },
    ])
    const { items, persisted } = store.getState()
    expect(persisted).toBe(true)
    expect(items.map((s) => s.id)).toEqual(['a', 'b'])
    expect(items[0]!.turns).toHaveLength(2)
    expect(items[0]!.title).toBe('uno')
    expect(parseStored(fake.data.get(SESSIONS_KEY)!)).toHaveLength(2)
  })

  test('ignora pares incompletos; sin pares borra la sesión', () => {
    const store = make(() => new FakeStorage())
    store.save('a', [{ question: 'q', answer: '' }])
    expect(store.getState().items).toEqual([])
    store.save('a', [{ question: 'q', answer: 'r' }])
    expect(store.getState().items).toHaveLength(1)
    store.save('a', [])
    expect(store.getState().items).toEqual([])
  })

  test('topes: sesiones y pares por sesión', () => {
    const store = make(() => new FakeStorage())
    for (let i = 0; i < SESSIONS_MAX + 5; i++)
      store.save(`s${i}`, [{ question: `q${i}`, answer: 'r' }])
    expect(store.getState().items).toHaveLength(SESSIONS_MAX)
    store.save(
      'long',
      Array.from({ length: SESSION_MAX_TURNS + 4 }, (_, i) => ({
        question: `q${i}`,
        answer: 'r',
      })),
    )
    const long = store.getState().items.find((s) => s.id === 'long')!
    expect(long.turns).toHaveLength(SESSION_MAX_TURNS)
    expect(long.turns.at(-1)!.question).toBe(`q${SESSION_MAX_TURNS + 3}`)
  })

  test('remove y reload (otra pestaña) avisan a los suscriptores', () => {
    const fake = new FakeStorage()
    const store = make(() => fake)
    let calls = 0
    store.subscribe(() => calls++)
    store.save('a', [{ question: 'q', answer: 'r' }])
    store.remove('a')
    store.remove('nope')
    expect(store.getState().items).toEqual([])
    fake.setItem(SESSIONS_KEY, serialize([session('z')]))
    store.reload()
    expect(store.getState().items.map((s) => s.id)).toEqual(['z'])
    expect(calls).toBe(3)
  })

  test('sin storage o con storage que lanza: vive en memoria y no lanza', () => {
    const none = make(() => null)
    none.save('a', [{ question: 'q', answer: 'r' }])
    expect(none.getState()).toMatchObject({ persisted: false })
    expect(none.getState().items).toHaveLength(1)

    const throwing = new SessionStore({
      storage: () => {
        throw new Error('blocked')
      },
    })
    expect(throwing.getState()).toEqual({ items: [], persisted: false })
    throwing.save('a', [{ question: 'q', answer: 'r' }])
    expect(throwing.getState().items).toHaveLength(1)
  })
})
