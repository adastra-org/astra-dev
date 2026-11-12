import { describe, expect, test } from 'bun:test'
import { askProvider } from './palette'
import { isLinkable, sourceLabel, visibleSources } from './sources'
import type { AskSource } from './types'
import { canAccess, listPaletteProviders } from '@/lib/palette/registry'

const src = (n: number, over: Partial<AskSource> = {}): AskSource => ({
  n,
  kind: 'doc',
  slug: `doc-${n}`,
  title: `Doc ${n}`,
  heading: null,
  anchor: null,
  path: `/docs/doc-${n}`,
  excerpt: '',
  score: 1,
  ...over,
})

describe('visibleSources', () => {
  const all = [src(1), src(2), src(3)]
  test('solo las citadas, en el orden de la lista', () => {
    expect(visibleSources(all, [3, 1], false).map((s) => s.n)).toEqual([1, 3])
  })
  test('un rechazo no lista fuentes', () => {
    expect(visibleSources(all, [1], true)).toEqual([])
  })
  test('sin citas no lista nada', () => {
    expect(visibleSources(all, [], false)).toEqual([])
  })
})

describe('isLinkable / sourceLabel', () => {
  test('los docs y los natives enlazan a su página', () => {
    expect(isLinkable(src(1))).toBe(true)
    expect(isLinkable(src(1, { kind: 'native' }))).toBe(true)
  })
  test('no repite el título como sección', () => {
    expect(sourceLabel(src(1, { heading: 'Doc 1' })).section).toBe('')
    expect(sourceLabel(src(1, { heading: 'Rollback' })).section).toBe(
      'Rollback',
    )
  })
})

describe('proveedor del palette', () => {
  test('requiere subscriber: el público no lo ve, staff sí', () => {
    expect(askProvider.permission).toBe('subscriber')
    expect(canAccess('public', askProvider.permission)).toBe(false)
    expect(canAccess('subscriber', askProvider.permission)).toBe(true)
    expect(canAccess('staff', askProvider.permission)).toBe(true)
  })
  test('queda registrado, después de los públicos', () => {
    const p = listPaletteProviders().find((x) => x.id === 'ask-ether')
    expect(p).toBe(askProvider)
    expect(askProvider.order).toBeGreaterThan(40)
  })
  test('con consulta ofrece preguntarla; sin consulta, abrir el chat', async () => {
    const ctx = {
      docs: [],
      headings: [],
      pathname: '/',
      recents: [],
      lang: 'es' as const,
    }
    const sig = new AbortController().signal
    const withQuery = await askProvider.search('cómo hago rollback', ctx, sig)
    expect(withQuery).toHaveLength(1)
    expect(withQuery[0]!.title).toContain('cómo hago rollback')
    expect(withQuery[0]!.run).toBeFunction()
    const empty = await askProvider.search('  ', ctx, sig)
    expect(empty[0]!.id).toBe('ask:open')
  })
})
