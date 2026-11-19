// Preferencias de Ether: lectura defensiva, enums, estilo del request y fallos de localStorage.
// Sin navegador: un Storage simulado que puede lanzar en cada operación.
import { describe, expect, test } from 'bun:test'
import {
  ACCENTS,
  DEFAULT_PREFS,
  LENGTHS,
  NAME_MAX,
  PREFS_KEY,
  PrefsStore,
  normalizeName,
  parseStored,
  serialize,
  toStyle,
  TONES,
} from './prefs'

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

const make = (fs = new FakeStorage()) => ({
  store: new PrefsStore({ storage: () => fs }),
  fs,
})

describe('parseStored', () => {
  test('vacío, ilegible o de otra versión = valores por defecto', () => {
    expect(parseStored(null)).toEqual(DEFAULT_PREFS)
    expect(parseStored('{no json')).toEqual(DEFAULT_PREFS)
    expect(parseStored('[]')).toEqual(DEFAULT_PREFS)
    expect(parseStored('{"v":2,"prefs":{"tone":"formal"}}')).toEqual(
      DEFAULT_PREFS,
    )
    expect(parseStored('{"v":1,"prefs":null}')).toEqual(DEFAULT_PREFS)
  })

  test('cada campo inválido cae a su valor por defecto sin arrastrar a los demás', () => {
    const raw = JSON.stringify({
      v: 1,
      prefs: {
        tone: 'pirata',
        length: 'brief',
        accent: 9,
        name: '  Ana\n  ',
        done: 'yes',
      },
    })
    expect(parseStored(raw)).toEqual({
      ...DEFAULT_PREFS,
      length: 'brief',
      name: 'Ana',
      done: false,
    })
  })

  test('lo guardado vuelve igual', () => {
    const prefs = {
      tone: 'formal' as const,
      length: 'detailed' as const,
      accent: 'pink' as const,
      name: 'Ana',
      done: true,
    }
    expect(parseStored(serialize(prefs))).toEqual(prefs)
  })
})

describe('normalizeName', () => {
  test('una línea, sin control y con tope', () => {
    expect(normalizeName('  a\n\tb ​ c ')).toBe('a b c')
    expect(normalizeName('x'.repeat(NAME_MAX + 10))).toHaveLength(NAME_MAX)
  })
})

describe('toStyle', () => {
  test('todo por defecto = sin campo', () => {
    expect(toStyle(DEFAULT_PREFS)).toBeUndefined()
    // El color y el nombre nunca viajan.
    expect(
      toStyle({ ...DEFAULT_PREFS, accent: 'pink', name: 'Ana', done: true }),
    ).toBeUndefined()
  })

  test('solo lo que difiere, y solo los enums', () => {
    expect(toStyle({ ...DEFAULT_PREFS, tone: 'formal' })).toEqual({
      tone: 'formal',
    })
    expect(
      toStyle({ ...DEFAULT_PREFS, tone: 'cercano', length: 'brief' }),
    ).toEqual({ tone: 'cercano', length: 'brief' })
  })

  test('los enums son los que acepta el server', async () => {
    const server = await import('../../../server/src/chat/style.ts')
    expect([...TONES]).toEqual([...server.TONES])
    expect([...LENGTHS]).toEqual([...server.LENGTHS])
    expect(ACCENTS).toContain(DEFAULT_PREFS.accent)
  })
})

describe('PrefsStore', () => {
  test('arranca con los valores por defecto y persiste cada cambio', () => {
    const { store, fs } = make()
    expect(store.getState()).toEqual({ prefs: DEFAULT_PREFS, persisted: true })
    store.update({ tone: 'formal', name: ' Ana ' })
    expect(store.getState().prefs.tone).toBe('formal')
    expect(store.getState().prefs.name).toBe('Ana')
    expect(parseStored(fs.data.get(PREFS_KEY) ?? null).tone).toBe('formal')
    expect(store.style()).toEqual({ tone: 'formal' })
  })

  test('un valor fuera del enum se ignora', () => {
    const { store } = make()
    store.update({ tone: 'x' as never, accent: 'rojo' as never })
    expect(store.getState().prefs.tone).toBe('neutral')
    expect(store.getState().prefs.accent).toBe('violet')
  })

  test('markDone no toca el resto', () => {
    const { store } = make()
    store.update({ length: 'brief' })
    store.markDone()
    expect(store.getState().prefs).toEqual({
      ...DEFAULT_PREFS,
      length: 'brief',
      done: true,
    })
  })

  test('avisa a los suscriptores y reload lee lo que dejó otra pestaña', () => {
    const { store, fs } = make()
    let n = 0
    const off = store.subscribe(() => n++)
    store.update({ accent: 'mono' })
    expect(n).toBe(1)
    fs.data.set(PREFS_KEY, serialize({ ...DEFAULT_PREFS, tone: 'cercano' }))
    store.reload()
    expect(n).toBe(2)
    expect(store.getState().prefs.tone).toBe('cercano')
    off()
    store.update({ tone: 'formal' })
    expect(n).toBe(2)
  })

  test('localStorage que lanza al leer: persisted=false y sigue funcionando en memoria', () => {
    const fs = new FakeStorage()
    fs.failGet = true
    const { store } = make(fs)
    expect(store.getState().persisted).toBe(false)
    store.update({ tone: 'formal' })
    expect(store.getState().prefs.tone).toBe('formal')
  })

  test('localStorage que lanza al escribir (cuota o modo privado)', () => {
    const fs = new FakeStorage()
    fs.failSet = true
    const { store } = make(fs)
    store.update({ tone: 'formal' })
    expect(store.getState().persisted).toBe(false)
    expect(store.getState().prefs.tone).toBe('formal')
  })

  test('sin storage (acceso bloqueado): no lanza', () => {
    const store = new PrefsStore({ storage: () => null })
    expect(store.getState().persisted).toBe(false)
    store.update({ accent: 'pink' })
    expect(store.getState().prefs.accent).toBe('pink')
  })

  test('el getter del storage puede lanzar', () => {
    const store = new PrefsStore({
      storage: () => {
        throw new Error('SecurityError')
      },
    })
    expect(store.getState().persisted).toBe(false)
    store.update({ tone: 'formal' })
    expect(store.getState().prefs.tone).toBe('formal')
  })
})
