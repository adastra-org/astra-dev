// Memorias del chat: validación, lectura defensiva y fallos de localStorage. Sin navegador: un
// Storage simulado que puede lanzar en cada operación.
import { describe, expect, test } from 'bun:test'
import {
  MEMORIES_KEY,
  MEMORIES_MAX_ITEMS,
  MEMORIES_MAX_TOTAL,
  MEMORY_MAX_CHARS,
  MemoryStore,
  memoryTokens,
  normalizeText,
  parseStored,
  textsTokens,
} from './memories'

class FakeStorage {
  data = new Map<string, string>()
  failGet = false
  failSet = false
  getItem(k: string) {
    if (this.failGet) throw new Error('SecurityError')
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.failSet) throw new Error('QuotaExceededError')
    this.data.set(k, v)
  }
}

const make = (fs = new FakeStorage()) => {
  let t = 1000
  const store = new MemoryStore({ storage: () => fs, now: () => t++ })
  return { store, fs }
}
const texts = (s: MemoryStore) => s.getState().items.map((m) => m.text)

describe('normalizeText', () => {
  test('una línea, sin control ni espacios repetidos', () => {
    expect(normalizeText('  a\n\tb ​ c\r\n')).toBe('a b c')
    expect(normalizeText('\u0000\u0007')).toBe('')
  })
})

describe('parseStored', () => {
  test('JSON roto, forma o versión desconocida: lista vacía', () => {
    expect(parseStored(null)).toEqual([])
    expect(parseStored('{no json')).toEqual([])
    expect(parseStored('[]')).toEqual([])
    expect(parseStored(JSON.stringify({ v: 2, items: [] }))).toEqual([])
    expect(parseStored(JSON.stringify({ v: 1, items: 'x' }))).toEqual([])
  })

  test('descarta ítems inválidos uno a uno y repara el resto', () => {
    const raw = JSON.stringify({
      v: 1,
      items: [
        {
          id: 'a',
          text: '  uno  ',
          enabled: false,
          createdAt: 1,
          updatedAt: 2,
        },
        { id: 'a', text: 'repetido' },
        { id: 'b', text: '' },
        { id: 'c', text: 'x'.repeat(MEMORY_MAX_CHARS + 1) },
        { id: 3, text: 'id numérico' },
        { id: 'd', text: 42 },
        null,
        { id: 'e', text: 'dos' },
      ],
    })
    const out = parseStored(raw)
    expect(out.map((m) => [m.id, m.text, m.enabled])).toEqual([
      ['a', 'uno', false],
      ['e', 'dos', true],
    ])
  })

  test('no pasa del máximo de memorias', () => {
    const items = Array.from({ length: MEMORIES_MAX_ITEMS + 5 }, (_, i) => ({
      id: `i${i}`,
      text: `m${i}`,
    }))
    expect(parseStored(JSON.stringify({ v: 1, items }))).toHaveLength(
      MEMORIES_MAX_ITEMS,
    )
  })
})

describe('MemoryStore: crear, editar, borrar, activar', () => {
  test('agrega, guarda en localStorage y recarga igual', () => {
    const { store, fs } = make()
    expect(store.add('  Responde  corto ')).toEqual({ ok: true })
    expect(texts(store)).toEqual(['Responde corto'])
    expect(store.getState().persisted).toBe(true)
    const saved = JSON.parse(fs.data.get(MEMORIES_KEY)!)
    expect(saved).toMatchObject({ v: 1, items: [{ text: 'Responde corto' }] })
    const again = make(fs).store
    expect(texts(again)).toEqual(['Responde corto'])
  })

  test('rechaza vacío, largo, duplicado (sin importar mayúsculas) y exceso', () => {
    const { store } = make()
    expect(store.add('   ')).toEqual({ ok: false, reason: 'empty' })
    expect(store.add('x'.repeat(MEMORY_MAX_CHARS + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    })
    store.add('Uso Windows')
    expect(store.add('uso windows')).toEqual({ ok: false, reason: 'duplicate' })
    for (let i = 1; i < MEMORIES_MAX_ITEMS; i++) store.add(`m${i}`)
    expect(store.add('una más')).toEqual({ ok: false, reason: 'max_items' })
    expect(store.getState().items).toHaveLength(MEMORIES_MAX_ITEMS)
  })

  test('el tope total cuenta solo las activas', () => {
    const { store } = make()
    const big = (c: string) => c.repeat(MEMORY_MAX_CHARS)
    for (const c of 'abcdefg') expect(store.add(big(c))).toEqual({ ok: true }) // 1960
    expect(store.add(big('h'))).toEqual({ ok: false, reason: 'max_total' })
    const first = store.getState().items[0]!.id
    store.toggle(first) // desactiva una: entra otra
    expect(store.add(big('h'))).toEqual({ ok: true })
    // Volver a activar la primera pasaría del tope.
    expect(store.toggle(first)).toEqual({ ok: false, reason: 'max_total' })
    expect(store.getState().items[0]!.enabled).toBe(false)
  })

  test('edita, no permite duplicar ni vaciar', () => {
    const { store } = make()
    store.add('uno')
    store.add('dos')
    const [a, b] = store.getState().items
    expect(store.edit(a!.id, ' UNO  editado ')).toEqual({ ok: true })
    expect(texts(store)).toEqual(['UNO editado', 'dos'])
    expect(store.edit(a!.id, 'dos')).toEqual({ ok: false, reason: 'duplicate' })
    expect(store.edit(b!.id, '  ')).toEqual({ ok: false, reason: 'empty' })
    expect(store.edit('nope', 'x')).toEqual({ ok: false, reason: 'not_found' })
    // Reescribirse a sí misma no es duplicado.
    expect(store.edit(a!.id, 'UNO editado')).toEqual({ ok: true })
  })

  test('borra y deshace en su lugar; un cambio posterior cierra el deshacer', () => {
    const { store } = make()
    for (const t of ['a', 'b', 'c']) store.add(t)
    const mid = store.getState().items[1]!
    store.remove(mid.id)
    expect(texts(store)).toEqual(['a', 'c'])
    expect(store.getState().removed?.memory.id).toBe(mid.id)
    expect(store.undoRemove()).toEqual({ ok: true })
    expect(texts(store)).toEqual(['a', 'b', 'c'])
    expect(store.getState().removed).toBeNull()
    expect(store.undoRemove()).toEqual({ ok: false, reason: 'not_found' })
    store.remove(mid.id)
    store.add('d')
    expect(store.getState().removed).toBeNull()
  })

  test('solo viajan las activas, en orden', () => {
    const { store } = make()
    for (const t of ['a', 'b', 'c']) store.add(t)
    store.toggle(store.getState().items[1]!.id)
    expect(store.active()).toEqual(['a', 'c'])
  })

  test('active() no pasa del tope aunque lo guardado lo pase', () => {
    const fs = new FakeStorage()
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `i${i}`,
      text: String(i).repeat(MEMORY_MAX_CHARS),
    }))
    fs.data.set(MEMORIES_KEY, JSON.stringify({ v: 1, items }))
    const { store } = make(fs)
    const sent = store.active()
    expect(sent.reduce((n, t) => n + t.length, 0)).toBeLessThanOrEqual(
      MEMORIES_MAX_TOTAL,
    )
    expect(sent).toHaveLength(7)
  })

  test('avisa a los suscriptores en cada cambio', () => {
    const { store } = make()
    let n = 0
    const off = store.subscribe(() => n++)
    store.add('a')
    store.toggle(store.getState().items[0]!.id)
    off()
    store.add('b')
    expect(n).toBe(2)
  })
})

describe('MemoryStore: localStorage roto', () => {
  test('lectura que lanza: arranca vacío, sin lanzar, y avisa que no guarda', () => {
    const fs = new FakeStorage()
    fs.failGet = true
    const { store } = make(fs)
    expect(store.getState()).toMatchObject({ items: [], persisted: false })
    expect(store.add('sigue funcionando')).toEqual({ ok: true })
    expect(store.active()).toEqual(['sigue funcionando'])
  })

  test('sin storage (null): funciona en memoria de la sesión', () => {
    const store = new MemoryStore({ storage: () => null })
    expect(store.add('a')).toEqual({ ok: true })
    expect(store.getState()).toMatchObject({ persisted: false })
    expect(store.active()).toEqual(['a'])
  })

  test('acceso a localStorage que lanza al pedirlo', () => {
    const store = new MemoryStore({
      storage: () => {
        throw new Error('denied')
      },
    })
    expect(store.add('a')).toEqual({ ok: true })
    expect(store.getState().persisted).toBe(false)
  })

  test('escritura que lanza (cuota): la memoria queda en la sesión y se avisa', () => {
    const fs = new FakeStorage()
    const { store } = make(fs)
    store.add('guardada')
    expect(store.getState().persisted).toBe(true)
    fs.failSet = true
    expect(store.add('no entra')).toEqual({ ok: true })
    expect(store.getState().persisted).toBe(false)
    expect(texts(store)).toEqual(['guardada', 'no entra'])
    // Vuelve a andar: la próxima escritura buena lo deja guardado.
    fs.failSet = false
    store.add('otra')
    expect(store.getState().persisted).toBe(true)
    expect(JSON.parse(fs.data.get(MEMORIES_KEY)!).items).toHaveLength(3)
  })

  test('reload (otra pestaña) trae lo nuevo; JSON corrupto deja vacío sin lanzar', () => {
    const fs = new FakeStorage()
    const { store } = make(fs)
    store.add('a')
    const other = make(fs).store
    other.add('b')
    store.reload()
    expect(texts(store)).toEqual(['a', 'b'])
    fs.data.set(MEMORIES_KEY, '{corrupto')
    store.reload()
    expect(texts(store)).toEqual([])
  })
})

describe('tokens', () => {
  test('un token cada tres caracteres, solo activas', () => {
    expect(textsTokens([])).toBe(0)
    expect(textsTokens(['abcd', 'ef'])).toBe(2)
    const { store } = make()
    store.add('abcdef')
    store.add('ghi')
    store.toggle(store.getState().items[1]!.id)
    expect(memoryTokens(store.getState().items)).toBe(2)
  })
})
