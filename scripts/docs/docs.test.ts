import { describe, expect, test } from 'bun:test'
import { computeBacklinks, relatedWarnings } from './backlinks.ts'
import type { Section } from '../../src/lib/docs/types.ts'
import { createHighlight } from './highlight.ts'
import { type Git, parseGitLog, readHistory } from './history.ts'
import {
  brokenDocLinks,
  DocsError,
  loadDocs,
  readSources,
  type SourceFile,
} from './loader.ts'
import {
  COLLAPSE_WORDS,
  LONG_INLINE_CODE,
  renderMarkdown,
  slugifyHeading,
} from './markdown.ts'

const doc = (path: string, fm: string, body = 'Texto.\n'): SourceFile => ({
  path,
  raw: `---\n${fm}\n---\n${body}`,
})

const hl = await createHighlight()

const FM = `title: Título
summary: Resumen.
tags: [uno]
since: 0.2.0`

describe('loader: frontmatter', () => {
  test('doc válido: slug del nombre de archivo, valores por defecto y backlinks vacíos', () => {
    const { docs, warnings } = loadDocs([
      doc('content/docs/mi-doc.md', FM, 'Hola.\n'),
    ])
    expect(warnings).toEqual([])
    expect(docs[0]?.meta).toEqual({
      slug: 'mi-doc',
      title: 'Título',
      summary: 'Resumen.',
      tags: ['uno'],
      related: [],
      since: '0.2.0',
      lang: 'es',
      backlinks: [],
      path: 'content/docs/mi-doc.md',
    })
    expect(docs[0]?.body).toBe('Hola.\n')
  })

  test('el slug sale del archivo, no de la carpeta', () => {
    const { docs } = loadDocs([doc('content/docs/natives/draw-text.md', FM)])
    expect(docs[0]?.meta.slug).toBe('draw-text')
  })

  test('acepta CRLF y BOM', () => {
    const raw = `﻿---\r\n${FM.replace(/\n/g, '\r\n')}\r\n---\r\nTexto\r\n`
    const { docs } = loadDocs([{ path: 'content/docs/a.md', raw }])
    expect(docs[0]?.meta.title).toBe('Título')
  })

  const bad = (fm: string, msg: RegExp, path = 'content/docs/a.md') => {
    const run = () => loadDocs([doc(path, fm)])
    expect(run).toThrow(DocsError)
    expect(run).toThrow(msg)
  }

  test('falla sin frontmatter', () => {
    expect(() =>
      loadDocs([{ path: 'content/docs/a.md', raw: 'Solo texto\n' }]),
    ).toThrow(/falta el frontmatter/)
  })

  test('falla con campos obligatorios ausentes o vacíos', () => {
    bad(FM.replace('title: Título\n', ''), /`title` es obligatorio/)
    bad(FM.replace('summary: Resumen.', 'summary: ""'), /`summary`/)
    bad(FM.replace('since: 0.2.0', ''), /`since`/)
    bad(FM.replace('tags: [uno]', 'tags: []'), /al menos un tag/)
  })

  test('falla con tipos o formatos inválidos', () => {
    bad(FM.replace('since: 0.2.0', 'since: 1.0'), /X\.Y\.Z/)
    bad(FM.replace('tags: [uno]', 'tags: [Uno Dos]'), /tag inválido/)
    bad(FM.replace('tags: [uno]', 'tags: uno'), /lista de textos/)
    bad(`${FM}\nrelated: [Mal_Slug]`, /slug inválido en `related`/)
    bad(`${FM}\nrelated: [a, a]`, /repetidos/)
    bad(`${FM}\nlang: fr`, /`lang`/)
  })

  test('falla con claves desconocidas (typos)', () => {
    bad(`${FM}\ntag: [x]`, /claves desconocidas.*tag/)
  })

  test('falla con un nombre de archivo que no es un slug válido', () => {
    bad(FM, /no es válido/, 'content/docs/Mi Doc.md')
  })

  test('falla con slugs duplicados aunque estén en carpetas distintas', () => {
    const run = () =>
      loadDocs([doc('content/docs/a/x.md', FM), doc('content/docs/b/x.md', FM)])
    expect(run).toThrow(/slug duplicado "x".*content\/docs\/a\/x\.md/)
  })

  test('reporta todos los errores juntos', () => {
    try {
      loadDocs([
        doc('content/docs/a.md', 'title: x'),
        doc('content/docs/b.md', 'title: y'),
      ])
      throw new Error('debía fallar')
    } catch (e) {
      expect(e).toBeInstanceOf(DocsError)
      expect((e as DocsError).errors).toHaveLength(2)
    }
  })

  test('related roto avisa pero no falla', () => {
    const { warnings } = loadDocs([
      doc('content/docs/a.md', `${FM}\nrelated: [fantasma, a]`),
    ])
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('"fantasma"')
    expect(warnings[1]).toContain('propio documento')
  })

  test('los docs reales de content/docs son válidos y sus enlaces existen', async () => {
    const files = await readSources(process.cwd())
    expect(files.length).toBeGreaterThanOrEqual(4)
    const { docs, warnings } = loadDocs(files)
    expect(warnings).toEqual([])
    const slugs = new Set(docs.map((d) => d.meta.slug))
    for (const d of docs) {
      const { links } = renderMarkdown(d.meta.path, d.body, hl)
      expect(brokenDocLinks(d.meta.path, links, slugs)).toEqual([])
    }
  })
})

describe('backlinks', () => {
  const docs = [
    { slug: 'a', related: ['b', 'c'], path: 'a.md' },
    { slug: 'b', related: ['c'], path: 'b.md' },
    { slug: 'c', related: [], path: 'c.md' },
  ]

  test('invierte related y ordena por slug', () => {
    expect(computeBacklinks(docs)).toEqual({ a: [], b: ['a'], c: ['a', 'b'] })
  })

  test('ignora slugs inexistentes y autorreferencias', () => {
    const r = computeBacklinks([
      { slug: 'a', related: ['a', 'zzz'] },
      { slug: 'b', related: ['a'] },
    ])
    expect(r).toEqual({ a: ['b'], b: [] })
  })

  test('sin docs, sin backlinks', () => {
    expect(computeBacklinks([])).toEqual({})
  })

  test('relatedWarnings: inexistente y autorreferencia', () => {
    const w = relatedWarnings([
      { slug: 'a', related: ['x', 'a', 'b'], path: 'a.md' },
      { slug: 'b', related: [], path: 'b.md' },
    ])
    expect(w).toHaveLength(2)
    expect(w[0]).toContain('"x"')
    expect(w[1]).toContain('propio documento')
  })

  test('loadDocs rellena backlinks en el meta', () => {
    const { docs: d } = loadDocs([
      doc('content/docs/a.md', `${FM}\nrelated: [b]`),
      doc('content/docs/b.md', FM),
    ])
    expect(d.find((x) => x.meta.slug === 'b')?.meta.backlinks).toEqual(['a'])
  })
})

describe('historial', () => {
  const US = '\x1f'
  const line = (sha: string, date: string, subject: string) =>
    [sha, date, subject].join(US)

  test('parseGitLog: fecha, sha corto y asunto', () => {
    const raw = `${line('abc1234', '2026-11-10', 'feat(docs): motor [v0.2.0]')}\n${line('def5678', '2026-11-09', 'docs: primer borrador')}\n`
    expect(parseGitLog(raw)).toEqual([
      {
        sha: 'abc1234',
        date: '2026-11-10',
        subject: 'feat(docs): motor [v0.2.0]',
      },
      { sha: 'def5678', date: '2026-11-09', subject: 'docs: primer borrador' },
    ])
  })

  test('parseGitLog: un asunto puede contener el separador', () => {
    const raw = `${line('abc1234', '2026-11-10', `a${US}b`)}\n`
    expect(parseGitLog(raw)[0]?.subject).toBe(`a${US}b`)
  })

  test('parseGitLog: ignora líneas vacías o mal formadas y acepta CRLF', () => {
    const raw = `\n${line('abc1234', '2026-11-10', 'ok')}\r\nbasura\n${line('x', 'no-fecha', 'y')}\n${line('def5678', '2026-11-09', '')}\n`
    expect(parseGitLog(raw)).toEqual([
      { sha: 'abc1234', date: '2026-11-10', subject: 'ok' },
    ])
  })

  test('parseGitLog: vacío', () => {
    expect(parseGitLog('')).toEqual([])
  })

  const fake =
    (shallow: string | null, log: string | null): Git =>
    async (args) =>
      args[0] === 'rev-parse' ? shallow : log

  test('readHistory: repo completo devuelve entradas', async () => {
    const h = await readHistory(
      fake('false\n', `${line('abc1234', '2026-11-10', 'ok')}\n`),
      'content/docs/a.md',
    )
    expect(h).toEqual({
      available: true,
      entries: [{ sha: 'abc1234', date: '2026-11-10', subject: 'ok' }],
    })
  })

  test('readHistory: archivo sin commits está disponible y vacío', async () => {
    expect(await readHistory(fake('false\n', ''), 'x.md')).toEqual({
      available: true,
      entries: [],
    })
  })

  test('readHistory: clon superficial degrada (el log estaría truncado)', async () => {
    const h = await readHistory(
      fake('true\n', line('a', '2026-11-10', 'x')),
      'x.md',
    )
    expect(h).toEqual({ available: false, entries: [] })
  })

  test('readHistory: sin git degrada', async () => {
    expect(await readHistory(fake(null, null), 'x.md')).toEqual({
      available: false,
      entries: [],
    })
    expect(await readHistory(fake('false\n', null), 'x.md')).toEqual({
      available: false,
      entries: [],
    })
  })
})

describe('markdown', () => {
  const render = (body: string) => renderMarkdown('x.md', body, hl)
  const firstHtml = (sections: Section[]) => {
    const b = sections[0]?.blocks[0]
    if (b?.type !== 'html') throw new Error('se esperaba un bloque html')
    return b.html
  }

  test('slugifyHeading: sin tildes ni símbolos', () => {
    expect(slugifyHeading('Ejemplo mínimo')).toBe('ejemplo-minimo')
    expect(slugifyHeading('¿Qué es `native`?')).toBe('que-es-native')
    expect(slugifyHeading('???')).toBe('seccion')
  })

  test('intro, secciones, ids únicos e índice', () => {
    const r = render(
      'Intro.\n\n## Uno\n\ntexto\n\n### Sub\n\nx\n\n## Uno\n\ny\n',
    )
    expect(r.sections.map((s) => [s.kind, s.id])).toEqual([
      ['intro', null],
      ['section', 'uno'],
      ['section', 'uno-2'],
    ])
    expect(r.toc).toEqual([
      { id: 'uno', title: 'Uno', depth: 2 },
      { id: 'sub', title: 'Sub', depth: 3 },
      { id: 'uno-2', title: 'Uno', depth: 2 },
    ])
  })

  test('"Ejemplo mínimo" sube justo después de la intro y siempre va abierta', () => {
    const long = Array.from(
      { length: COLLAPSE_WORDS + 5 },
      () => 'palabra',
    ).join(' ')
    const r = render(
      `Intro.\n\n## Detalle\n\n${long}\n\n## Ejemplo mínimo\n\n${long}\n`,
    )
    expect(r.sections.map((s) => s.title)).toEqual([
      null,
      'Ejemplo mínimo',
      'Detalle',
    ])
    expect(r.sections[1]?.kind).toBe('example')
    expect(r.sections[1]?.collapsible).toBe(false)
    expect(r.sections[2]?.collapsible).toBe(true)
    expect(r.toc.map((t) => t.id)).toEqual(['ejemplo-minimo', 'detalle'])
  })

  test('sección corta no se pliega', () => {
    const r = render('## Corta\n\nUna frase.\n')
    expect(r.sections[0]?.collapsible).toBe(false)
  })

  test('el código de primer nivel es un bloque propio, con lenguaje y resaltado', () => {
    const r = render('## S\n\nAntes.\n\n```lua\nlocal x = 1\n```\n\nDespués.\n')
    const blocks = r.sections[0]?.blocks ?? []
    expect(blocks.map((b) => b.type)).toEqual(['html', 'code', 'html'])
    const code = blocks[1]
    expect(code?.type === 'code' && code.lang).toBe('lua')
    expect(code?.type === 'code' && code.code).toBe('local x = 1')
    expect(code?.type === 'code' && code.html).toContain('var(--code-token-')
  })

  test('```lua run marca el bloque como ejecutable; sin el flag, no', () => {
    const r = render(
      '## S\n\n```lua run\nprint("hola")\n```\n\n```lua\nlocal x = 1\n```\n\n```ts run\nconst x = 1\n```\n',
    )
    const code = (r.sections[0]?.blocks ?? []).filter((b) => b.type === 'code')
    expect(code.map((b) => b.type === 'code' && b.runnable === true)).toEqual([
      true,
      false,
      false,
    ])
    expect(code.map((b) => b.type === 'code' && b.lang)).toEqual([
      'lua',
      'lua',
      'ts',
    ])
  })

  test('lenguaje desconocido o ausente: texto escapado', () => {
    const r = render('## S\n\n```\n<a> & b\n```\n')
    const b = r.sections[0]?.blocks[0]
    expect(b?.type === 'code' && b.html).toBe('&lt;a&gt; &amp; b')
  })

  test('encabezados h3 llevan ancla; las tablas se envuelven', () => {
    const r = render('## S\n\n### Sub\n\n| a | b |\n| - | - |\n| 1 | 2 |\n')
    const html = firstHtml(r.sections)
    expect(html).toContain('<h3 id="sub">Sub<a class="anchor" href="#sub"')
    expect(html).toContain('class="table-wrap"')
  })

  test('HTML crudo se escapa', () => {
    const r = render('## S\n\n<script>alert(1)</script>\n')
    const html = firstHtml(r.sections)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  test('código en línea: escapado; solo el token largo sin espacios puede partirse', () => {
    const long = 'x'.repeat(LONG_INLINE_CODE + 1)
    const html = firstHtml(
      render(`## S

\`<b>\` y \`${long}\` y \`${long} ${long}\`
`).sections,
    )
    expect(html).toContain('<code>&lt;b&gt;</code>')
    expect(html).toContain(`<code class="code-long">${long}</code>`)
    expect(html).toContain(`<code>${long} ${long}</code>`)
  })

  test('un # en el cuerpo es un error', () => {
    expect(() => render('# Otro título\n')).toThrow(/frontmatter/)
  })

  test('enlaces: externos con rel, internos recolectados y rotos detectados', () => {
    const r = render(
      '## S\n\n[ext](https://example.com) y [doc](/docs/a) y [roto](/docs/zzz#x)\n',
    )
    const html = firstHtml(r.sections)
    expect(html).toContain('rel="noopener noreferrer"')
    expect(r.links).toEqual(['https://example.com', '/docs/a', '/docs/zzz#x'])
    expect(brokenDocLinks('x.md', r.links, new Set(['a']))).toHaveLength(1)
  })
})
