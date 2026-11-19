import { describe, expect, test } from 'bun:test'
import {
  MAX_RECENT,
  loadRecents,
  parseRecents,
  pushRecent,
  saveRecents,
} from './recent'
import type { PaletteItem } from './types'

const it = (n: number): PaletteItem => ({
  id: `doc:${n}`,
  title: `Doc ${n}`,
  icon: 'doc',
  to: `/docs/${n}`,
})

describe('pushRecent', () => {
  test('agrega al inicio, sin duplicar por ruta, con tope', () => {
    let list: PaletteItem[] = []
    for (let n = 1; n <= MAX_RECENT + 2; n++) list = pushRecent(list, it(n))
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0]?.to).toBe(`/docs/${MAX_RECENT + 2}`)
    const again = pushRecent(list, it(MAX_RECENT))
    expect(again[0]?.to).toBe(`/docs/${MAX_RECENT}`)
    expect(again).toHaveLength(MAX_RECENT)
  })

  test('no acumula el prefijo recent: de los ítems elegidos desde Recientes', () => {
    const [saved] = pushRecent([], { ...it(1), id: 'recent:recent:doc:1' })
    expect(saved?.id).toBe('doc:1')
  })

  test('ignora los ítems sin ruta y no guarda tags ni acciones', () => {
    const sinRuta: PaletteItem = {
      id: 'a',
      title: 'A',
      icon: 'sparkles',
      run: () => {},
    }
    expect(pushRecent([], sinRuta)).toEqual([])
    const [saved] = pushRecent([], { ...it(1), tags: ['x'], run: () => {} })
    expect(saved).not.toHaveProperty('tags')
    expect(saved).not.toHaveProperty('run')
  })
})

describe('parseRecents', () => {
  test('tolera basura', () => {
    expect(parseRecents(null)).toEqual([])
    expect(parseRecents('no es json')).toEqual([])
    expect(parseRecents('{"a":1}')).toEqual([])
    expect(parseRecents('[1,null,{"id":"x"}]')).toEqual([])
  })

  test('descarta rutas externas e iconos desconocidos', () => {
    const raw = JSON.stringify([
      { id: 'a', title: 'A', icon: 'doc', to: 'https://evil.example' },
      { id: 'b', title: 'B', icon: 'doc', to: '//evil.example' },
      { id: 'c', title: 'C', icon: 'bomba', to: '/docs/c' },
      { id: 'd', title: 'D', icon: 'doc', to: '/docs/d', permission: 'root' },
    ])
    const r = parseRecents(raw)
    expect(r.map((x) => x.id)).toEqual(['d'])
    expect(r[0]?.permission).toBe('public')
  })
})

describe('almacenamiento que lanza', () => {
  test('load y save no propagan el error', () => {
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqueado')
      },
    })
    try {
      expect(loadRecents()).toEqual([])
      expect(() => saveRecents([it(1)])).not.toThrow()
    } finally {
      if (had) Object.defineProperty(globalThis, 'localStorage', had)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })
})
