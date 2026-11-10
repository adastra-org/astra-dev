// Markdown → secciones listas para React. Todo en build: la app solo pinta el resultado.
//
// Salida: lo que va antes del primer `##` es la introducción; cada `##` abre una sección. Los
// bloques de código de primer nivel se separan (la app les pone cabecera y botón Copiar); el
// resto se agrupa como HTML. La sección "Ejemplo mínimo" se sube justo después de la intro.
import { Marked, type Token, type Tokens } from 'marked'
import type {
  Block,
  Section,
  SectionKind,
  TocItem,
} from '../../src/lib/docs/types.ts'
import { DocError } from './frontmatter.ts'
import { escapeHtml, type Highlight } from './highlight.ts'

/** Palabras desde las que una sección va plegada por defecto. */
export const COLLAPSE_WORDS = 120

/** Título (sin tildes, minúsculas) de la sección que se sube al principio. */
export const EXAMPLE_TITLE = 'ejemplo minimo'

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Id de ancla estable: sin tildes, minúsculas, guiones. */
export function slugifyHeading(text: string): string {
  return (
    fold(text)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'seccion'
  )
}

/** Texto plano de tokens inline (para ids e índice). */
function plain(tokens: Token[] | undefined, fallback: string): string {
  if (!tokens?.length) return fallback
  return tokens
    .map((t) => {
      if ('tokens' in t && Array.isArray(t.tokens) && t.type !== 'codespan')
        return plain(t.tokens as Token[], t.raw)
      return 'text' in t ? String((t as { text: string }).text) : t.raw
    })
    .join('')
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length
const langOf = (info: string | undefined) => (info ?? '').split(/\s+/)[0] ?? ''

export interface Rendered {
  sections: Section[]
  toc: TocItem[]
  /** Destinos de los enlaces del cuerpo (para avisar de enlaces internos rotos). */
  links: string[]
}

interface Draft {
  id: string | null
  title: string | null
  kind: SectionKind
  blocks: Block[]
  words: number
  subs: TocItem[]
}

/** Largo (en caracteres) desde el que un código en línea sin espacios puede partirse. */
export const LONG_INLINE_CODE = 36

export function renderMarkdown(
  file: string,
  body: string,
  highlight: Highlight,
): Rendered {
  const links: string[] = []
  const marked = new Marked({
    gfm: true,
    renderer: {
      // HTML crudo en el Markdown no pasa: se muestra como texto.
      html: ({ text }) => escapeHtml(text),
      // Código anidado (en listas o citas): resaltado, sin cabecera ni botón.
      code: ({ text, lang }) =>
        `<pre class="code-plain" tabindex="0"><code>${highlight(text, langOf(lang))}</code></pre>\n`,
      // Código en línea: no se parte (prose.css). Un token largo sin espacios puede no caber
      // en el renglón de un móvil: ese sí puede partirse, como último recurso (`code-long`).
      codespan: ({ text }) =>
        `<code${text.length > LONG_INLINE_CODE && !/\s/.test(text) ? ' class="code-long"' : ''}>${escapeHtml(text)}</code>`,
      link({ href, title, tokens }) {
        links.push(href)
        const t = title ? ` title="${escapeHtml(title)}"` : ''
        const ext = /^https?:\/\//.test(href)
        const rel = ext ? ' target="_blank" rel="noopener noreferrer"' : ''
        return `<a href="${escapeHtml(href)}"${t}${rel}>${this.parser.parseInline(tokens)}</a>`
      },
    },
  })

  const tokens = marked.lexer(body)

  // Ids únicos por documento.
  const used = new Map<string, number>()
  const headId = (text: string) => {
    const base = slugifyHeading(text)
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  }

  const intro: Draft = {
    id: null,
    title: null,
    kind: 'intro',
    blocks: [],
    words: 0,
    subs: [],
  }
  const drafts: Draft[] = []
  let cur = intro

  const pushHtml = (html: string) => {
    const last = cur.blocks.at(-1)
    if (last?.type === 'html') last.html += html
    else cur.blocks.push({ type: 'html', html })
  }

  for (const tok of tokens) {
    if (tok.type === 'space') continue

    if (tok.type === 'heading') {
      const h = tok as Tokens.Heading
      const title = plain(h.tokens, h.text)
      if (h.depth === 1)
        throw new DocError(
          file,
          `el cuerpo no puede tener "# ${title}": el título sale del frontmatter, usa ## para las secciones`,
        )
      const id = headId(title)
      if (h.depth === 2) {
        cur = {
          id,
          title,
          kind: fold(title) === EXAMPLE_TITLE ? 'example' : 'section',
          blocks: [],
          words: 0,
          subs: [],
        }
        drafts.push(cur)
        continue
      }
      if (h.depth === 3) cur.subs.push({ id, title, depth: 3 })
      const inner = marked.parseInline(h.text) as string
      pushHtml(
        `<h${h.depth} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Enlace a ${escapeHtml(title)}">#</a></h${h.depth}>\n`,
      )
      continue
    }

    cur.words += wordCount(tok.raw)
    if (tok.type === 'code') {
      const c = tok as Tokens.Code
      const lang = langOf(c.lang)
      cur.blocks.push({
        type: 'code',
        lang,
        code: c.text,
        html: highlight(c.text, lang),
      })
      continue
    }
    let html = marked.parser([tok])
    if (tok.type === 'table')
      html = `<div class="table-wrap" role="region" aria-label="Tabla" tabindex="0">${html}</div>\n`
    pushHtml(html)
  }

  const ordered = [
    ...(intro.blocks.length ? [intro] : []),
    ...drafts.filter((d) => d.kind === 'example'),
    ...drafts.filter((d) => d.kind !== 'example'),
  ]

  const sections: Section[] = ordered.map((d) => ({
    id: d.id,
    title: d.title,
    kind: d.kind,
    collapsible: d.kind === 'section' && d.words > COLLAPSE_WORDS,
    blocks: d.blocks,
    words: d.words,
  }))
  const toc: TocItem[] = ordered.flatMap((d) =>
    d.id && d.title
      ? [{ id: d.id, title: d.title, depth: 2 as const }, ...d.subs]
      : [],
  )

  return { sections, toc, links }
}
