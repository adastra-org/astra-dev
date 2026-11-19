import { describe, expect, test } from 'bun:test'
import type { DocMeta } from '@/lib/docs/types'
import {
  docsProvider,
  headingsProvider,
  navProvider,
  recentsProvider,
} from './providers'
import type { PaletteContext, PaletteItem } from './types'

const doc = (
  slug: string,
  title: string,
  tags: string[],
  summary = '',
): DocMeta => ({
  slug,
  title,
  summary,
  tags,
  related: [],
  since: '0.2.0',
  lang: 'es',
  backlinks: [],
  path: `content/docs/${slug}.md`,
})

const ctx: PaletteContext = {
  docs: [
    doc('deploy', 'Flujo de deploy', ['proyecto', 'deploy'], 'Blue green.'),
    doc('estilo', 'Sistema de diseño', ['proyecto', 'diseno']),
  ],
  headings: [
    { id: 'parametros', title: 'Parámetros', depth: 2 },
    { id: 'notas', title: 'Notas de Astra', depth: 2 },
  ],
  pathname: '/docs/deploy',
  recents: [
    { id: 'nav:/docs', title: 'Documentación', icon: 'docs', to: '/docs' },
  ],
}
const sig = new AbortController().signal
type P = typeof docsProvider
const search = async (p: P, q: string, c = ctx): Promise<PaletteItem[]> =>
  p.search(q, c, sig)
const ids = async (p: P, q: string, c = ctx) =>
  (await search(p, q, c)).map((i) => i.id)

describe('proveedores públicos', () => {
  test('todos son públicos', () => {
    for (const p of [
      recentsProvider,
      headingsProvider,
      navProvider,
      docsProvider,
    ])
      expect(p.permission).toBe('public')
  })

  test('docs: sin consulta no lista nada; con consulta rankea y marca tags', async () => {
    expect(await ids(docsProvider, '')).toEqual([])
    expect(await search(docsProvider, 'diseño')).toMatchObject([
      { id: 'doc:estilo', to: '/docs/estilo', tags: ['diseno'] },
    ])
  })

  test('nav: los cuatro destinos; "hoja de ruta" encuentra Roadmap', async () => {
    expect(await ids(navProvider, '')).toEqual([
      'nav:/',
      'nav:/docs',
      'nav:/tools',
      'nav:/roadmap',
    ])
    expect(await ids(navProvider, 'hoja de ruta')).toEqual(['nav:/roadmap'])
    expect(await ids(navProvider, 'herram')).toEqual(['nav:/tools'])
  })

  test('encabezados: de la página actual, con su ancla', async () => {
    expect(await search(headingsProvider, '')).toMatchObject([
      { to: '/docs/deploy#parametros' },
      { to: '/docs/deploy#notas' },
    ])
    expect(await ids(headingsProvider, 'notas')).toEqual([
      'heading:/docs/deploy#notas',
    ])
    expect(await ids(headingsProvider, '', { ...ctx, headings: [] })).toEqual(
      [],
    )
  })

  test('recientes: solo con consulta vacía', async () => {
    expect(await ids(recentsProvider, '')).toEqual(['recent:nav:/docs'])
    expect(await ids(recentsProvider, 'doc')).toEqual([])
  })
})
