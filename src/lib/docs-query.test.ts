import { describe, expect, test } from 'bun:test'
import type { DocMeta } from './docs/types'
import { filterDocs, fold, groupByTag, resolveSlugs } from './docs-query'

const d = (slug: string, title: string, tags: string[]): DocMeta => ({
  slug,
  title,
  summary: '',
  tags,
  related: [],
  since: '0.2.0',
  lang: 'es',
  backlinks: [],
  path: `content/docs/${slug}.md`,
})

const docs = [
  d('glosario', 'Glosario', ['referencia']),
  d('deploy', 'Flujo de deploy', ['proyecto', 'deploy']),
  d('estilo', 'Sistema de diseño', ['proyecto', 'diseno']),
  d('astra', 'Cómo funciona Astra Dev', ['proyecto']),
]

describe('groupByTag', () => {
  test('agrupa por el primer tag, ordenado por etiqueta y título', () => {
    const g = groupByTag(docs)
    expect(g.map((x) => x.tag)).toEqual(['proyecto', 'referencia'])
    expect(g[0]?.docs.map((x) => x.slug)).toEqual(['astra', 'deploy', 'estilo'])
  })

  test('sin docs, sin grupos', () => {
    expect(groupByTag([])).toEqual([])
  })
})

describe('filterDocs', () => {
  const slugs = (q: string) => filterDocs(docs, q).map((x) => x.slug)

  test('consulta vacía devuelve todo', () => {
    expect(slugs('  ')).toHaveLength(4)
  })

  test('por título, sin importar mayúsculas ni tildes', () => {
    expect(slugs('como funciona')).toEqual(['astra'])
    expect(slugs('DISEÑO')).toEqual(['estilo'])
  })

  test('por cualquier tag, no solo el primero', () => {
    expect(slugs('deploy')).toEqual(['deploy'])
    expect(slugs('diseno')).toEqual(['estilo'])
    expect(slugs('proyecto')).toEqual(['deploy', 'estilo', 'astra'])
  })

  test('todas las palabras deben coincidir', () => {
    expect(slugs('proyecto flujo')).toEqual(['deploy'])
    expect(slugs('proyecto zzz')).toEqual([])
  })

  test('fold', () => {
    expect(fold('Diseño Cómo')).toBe('diseno como')
  })
})

test('resolveSlugs descarta los inexistentes y conserva el orden pedido', () => {
  expect(
    resolveSlugs(docs, ['glosario', 'nada', 'astra']).map((x) => x.slug),
  ).toEqual(['glosario', 'astra'])
})
