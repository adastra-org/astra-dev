import { describe, expect, test } from 'bun:test'
import type { DocMeta } from './docs/types'
import {
  filterDocs,
  fold,
  groupByTag,
  rankDocs,
  resolveSlugs,
  scoreMatch,
} from './docs-query'

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

describe('rankDocs', () => {
  const mk = (
    slug: string,
    title: string,
    tags: string[],
    summary: string,
  ) => ({
    ...d(slug, title, tags),
    summary,
  })
  const set = [
    mk('a', 'Resumen de deploy', ['proyecto'], 'Cómo se publica.'),
    mk('b', 'Deploy blue green', ['proyecto'], 'Dos slots y un symlink.'),
    mk('c', 'Publicar cambios', ['deploy'], 'Pasos del pipeline.'),
    mk('d', 'Glosario', ['referencia'], 'Incluye el término deploy y otros.'),
    mk('e', 'Los deploys del servidor', ['proyecto'], 'Notas.'),
  ]
  const slugs = (q: string) => rankDocs(set, q).map((r) => r.doc.slug)

  test('título que empieza > título que contiene > tag > resumen', () => {
    // b: prefijo. a y e: contienen "deploy" en el título (el más corto primero). c: tag. d: resumen.
    expect(slugs('deploy')).toEqual(['b', 'a', 'e', 'c', 'd'])
  })

  test('consulta vacía: todos por título, sin tags marcados', () => {
    const r = rankDocs(set, '')
    expect(r.map((x) => x.doc.slug)).toEqual(['b', 'd', 'e', 'c', 'a'])
    expect(r.every((x) => x.matchedTags.length === 0)).toBe(true)
  })

  test('devuelve solo los tags que coinciden, por slug o por etiqueta', () => {
    expect(rankDocs(set, 'deploy')[3]?.matchedTags).toEqual(['deploy'])
    const estilo = [d('x', 'Estilo', ['diseno'])]
    expect(rankDocs(estilo, 'diseño')[0]?.matchedTags).toEqual(['diseno'])
  })

  test('todas las palabras deben aparecer, aunque en campos distintos', () => {
    expect(slugs('blue proyecto')).toEqual(['b'])
    expect(slugs('blue referencia')).toEqual([])
  })

  test('sin tildes ni mayúsculas; sin coincidencias devuelve vacío', () => {
    expect(slugs('PUBLICAR')).toEqual(['c'])
    expect(slugs('zzz')).toEqual([])
  })
})

describe('scoreMatch', () => {
  test('0 sin coincidencia o sin consulta', () => {
    expect(scoreMatch('', { title: 'Algo' })).toBe(0)
    expect(scoreMatch('x', { title: 'Algo' })).toBe(0)
  })

  test('los niveles se ordenan y el título corto desempata', () => {
    const prefix = scoreMatch('par', { title: 'Parámetros' })
    const inside = scoreMatch('par', { title: 'Los parámetros' })
    const keyword = scoreMatch('par', {
      title: 'Otro',
      keywords: ['parámetro'],
    })
    const body = scoreMatch('par', { title: 'Otro', body: 'un parámetro' })
    expect(prefix).toBeGreaterThan(inside)
    expect(inside).toBeGreaterThan(keyword)
    expect(keyword).toBeGreaterThan(body)
    expect(body).toBeGreaterThan(0)
    expect(scoreMatch('par', { title: 'Parte' })).toBeGreaterThan(prefix)
  })
})
