import { describe, expect, test } from 'bun:test'
import {
  buildSections,
  canAccess,
  listPaletteProviders,
  registerPaletteProvider,
  runProviders,
  visibleProviders,
} from './registry'
import type {
  PaletteContext,
  PaletteItem,
  PaletteProvider,
  Permission,
} from './types'

const ctx: PaletteContext = {
  docs: [],
  headings: [],
  pathname: '/',
  recents: [],
}
const item = (id: string): PaletteItem => ({ id, title: id, icon: 'doc' })

function fake(
  id: string,
  permission: Permission,
  order: number,
  search: PaletteProvider['search'] = () => [item(`${id}-1`)],
): PaletteProvider & { calls: number } {
  const p = {
    id,
    label: id,
    order,
    permission,
    calls: 0,
    search(q: string, c: PaletteContext, s: AbortSignal) {
      p.calls++
      return search(q, c, s)
    },
  }
  return p
}

async function run(providers: PaletteProvider[], access: Permission) {
  const got = new Map<string, PaletteItem[]>()
  await runProviders({
    providers,
    query: 'x',
    ctx,
    access,
    signal: new AbortController().signal,
    onResult: (id, items) => got.set(id, items),
  })
  return got
}

const trio = () => [
  fake('pub', 'public', 1),
  fake('ai', 'subscriber', 2),
  fake('rw', 'staff', 3),
]

describe('canAccess', () => {
  test('cada nivel incluye al anterior', () => {
    expect(canAccess('public', 'public')).toBe(true)
    expect(canAccess('public', 'subscriber')).toBe(false)
    expect(canAccess('public', 'staff')).toBe(false)
    expect(canAccess('subscriber', 'public')).toBe(true)
    expect(canAccess('subscriber', 'subscriber')).toBe(true)
    expect(canAccess('subscriber', 'staff')).toBe(false)
    expect(canAccess('staff', 'subscriber')).toBe(true)
    expect(canAccess('staff', 'staff')).toBe(true)
  })
})

describe('runProviders: control de acceso', () => {
  test('un proveedor sin permiso no se invoca ni aporta resultados', async () => {
    const [pub, ai, rw] = trio()
    const got = await run([pub!, ai!, rw!], 'public')
    expect([...got.keys()]).toEqual(['pub'])
    expect(ai!.calls).toBe(0)
    expect(rw!.calls).toBe(0)
  })

  test('suscriptor ve lo público y lo de suscriptor, no lo de staff', async () => {
    const got = await run(trio(), 'subscriber')
    expect([...got.keys()].sort()).toEqual(['ai', 'pub'])
  })

  test('staff ve todo', async () => {
    expect((await run(trio(), 'staff')).size).toBe(3)
  })

  test('estampa el permiso del proveedor en cada ítem', async () => {
    const got = await run([fake('ai', 'subscriber', 1)], 'staff')
    expect(got.get('ai')?.[0]?.permission).toBe('subscriber')
  })
})

describe('runProviders: asincronía y errores', () => {
  test('un proveedor asíncrono aporta cuando resuelve', async () => {
    const slow = fake('ai', 'subscriber', 5, async () => {
      await Promise.resolve()
      return [item('respuesta')]
    })
    const got = await run([slow], 'subscriber')
    expect(got.get('ai')?.map((i) => i.id)).toEqual(['respuesta'])
  })

  test('uno que lanza o rechaza aporta cero ítems y no rompe a los demás', async () => {
    const boom = fake('boom', 'public', 1, () => {
      throw new Error('x')
    })
    const reject = fake('reject', 'public', 2, () =>
      Promise.reject(new Error('y')),
    )
    const ok = fake('ok', 'public', 3)
    const got = await run([boom, reject, ok], 'public')
    expect(got.get('boom')).toEqual([])
    expect(got.get('reject')).toEqual([])
    expect(got.get('ok')).toHaveLength(1)
  })

  test('tras abortar ya no se notifican resultados', async () => {
    const ctl = new AbortController()
    const seen: string[] = []
    const late = fake('late', 'public', 1, async () => {
      ctl.abort()
      return [item('tarde')]
    })
    await runProviders({
      providers: [late],
      query: 'x',
      ctx,
      access: 'public',
      signal: ctl.signal,
      onResult: (id) => seen.push(id),
    })
    expect(seen).toEqual([])
  })
})

describe('registro y secciones', () => {
  test('registrar devuelve la baja; mismo id reemplaza', () => {
    const a = fake('t-reg', 'public', 1)
    const off = registerPaletteProvider(a)
    expect(listPaletteProviders().filter((p) => p.id === 't-reg')).toHaveLength(
      1,
    )
    const b = fake('t-reg', 'public', 2)
    registerPaletteProvider(b)
    expect(listPaletteProviders().find((p) => p.id === 't-reg')).toBe(b)
    off() // `a` ya no es el registrado: no debe quitar a `b`
    expect(listPaletteProviders().find((p) => p.id === 't-reg')).toBe(b)
    registerPaletteProvider(b)()
    expect(listPaletteProviders().some((p) => p.id === 't-reg')).toBe(false)
  })

  test('visibleProviders filtra por permiso y ordena', () => {
    const list = [
      fake('c', 'public', 3),
      fake('a', 'public', 1),
      fake('s', 'staff', 2),
    ]
    expect(visibleProviders(list, 'public').map((p) => p.id)).toEqual([
      'a',
      'c',
    ])
    expect(visibleProviders(list, 'staff').map((p) => p.id)).toEqual([
      'a',
      's',
      'c',
    ])
  })

  test('buildSections ordena por proveedor y omite las vacías', () => {
    const list = [
      fake('b', 'public', 2),
      fake('a', 'public', 1),
      fake('e', 'public', 3),
    ]
    const sections = buildSections(
      list,
      new Map([
        ['b', [item('b1')]],
        ['a', [item('a1'), item('a2')]],
        ['e', []],
      ]),
    )
    expect(sections.map((s) => [s.id, s.items.length])).toEqual([
      ['a', 2],
      ['b', 1],
    ])
  })

  test('buildSections descarta ítems repetidos de secciones posteriores (semántico vs texto)', () => {
    const text = fake('docs', 'public', 40)
    const semantic = fake('semantic', 'subscriber', 45)
    const sections = buildSections(
      [semantic, text],
      new Map([
        ['docs', [item('doc:a'), item('doc:b')]],
        ['semantic', [item('doc:b'), item('doc:c')]],
      ]),
    )
    expect(sections.map((s) => s.items.map((i) => i.id))).toEqual([
      ['doc:a', 'doc:b'],
      ['doc:c'],
    ])
  })
})
