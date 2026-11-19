// Chunking of a doc by heading. Anchors must match the ones the docs engine renders
// (scripts/docs/markdown.ts: slugifyHeading + per-document unique ids), so a citation
// `/docs/<slug>#<anchor>` lands on the right heading. `chunk.parity.test.ts` (root) enforces it.
import { Lexer, type Token, type Tokens } from 'marked'

export interface DocInput {
  slug: string
  title: string
  summary: string
  /** Markdown body without frontmatter. */
  body: string
}

export type ChunkKind = 'doc' | 'native'

/** Identity of a native, kept on its chunk for exact lookup by name or hash. */
export interface NativeMeta {
  /** `<source>:<NAME>`, e.g. `gta:SET_VEHICLE_DOOR_OPEN`. */
  id: string
  source: 'gta' | 'cfx'
  /** Canonical name: `SET_VEHICLE_DOOR_OPEN`. */
  name: string
  /** Function name in Lua/JS/C#: `SetVehicleDoorOpen`. */
  luaName: string
  ns: string
  apiset: 'client' | 'server' | 'shared' | null
  /** `0x…`, uppercase, no leading zeros. */
  hashes: string[]
  aliases: string[]
  signature: string
}

export interface Chunk {
  /** `<slug>#<anchor>` plus `:<n>` when a section is split. Unique in an index. */
  id: string
  /** `doc` chunks belong to a page under `/docs`; `native` chunks to `/natives/<slug>`. */
  kind: ChunkKind
  /** Present on `native` chunks only. */
  native?: NativeMeta
  slug: string
  title: string
  /** Heading path ("Section" or "Section > Subsection"), `null` for the intro. */
  heading: string | null
  /** Heading id in the rendered page, `null` for the intro (top of the page). */
  anchor: string | null
  /** Markdown of the chunk. */
  text: string
  /** Short plain-text preview for result lists and citations. */
  excerpt: string
}

export interface ChunkOptions {
  /** Soft cap of characters per chunk; sections longer than this are split between blocks. */
  maxChars?: number
  excerptChars?: number
}

/** Site path of a chunk: `/docs/<slug>#<anchor>` or `/natives/<slug>`. */
export const chunkPath = (c: {
  kind: ChunkKind
  slug: string
  anchor: string | null
}): string =>
  c.kind === 'native'
    ? `/natives/${c.slug}`
    : `/docs/${c.slug}${c.anchor ? `#${c.anchor}` : ''}`

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Same algorithm as the docs engine. */
export function slugifyHeading(text: string): string {
  return (
    fold(text)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'seccion'
  )
}

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

/** Plain text of a markdown fragment, whitespace collapsed, for excerpts. */
export function toExcerpt(markdown: string, max: number): string {
  const text = markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, ' $1 ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** Split a block longer than `max` at line boundaries. */
function hardSplit(raw: string, max: number): string[] {
  if (raw.length <= max) return [raw]
  const out: string[] = []
  let cur = ''
  for (const line of raw.split('\n')) {
    if (cur && cur.length + line.length + 1 > max) {
      out.push(cur)
      cur = ''
    }
    // A single line longer than max is cut by characters.
    for (let l = line; ;) {
      if (cur.length + l.length + 1 <= max || !l) {
        cur += (cur ? '\n' : '') + l
        break
      }
      const room = Math.max(1, max - cur.length - 1)
      cur += (cur ? '\n' : '') + l.slice(0, room)
      out.push(cur)
      cur = ''
      l = l.slice(room)
    }
  }
  if (cur) out.push(cur)
  return out
}

interface Section {
  heading: string | null
  anchor: string | null
  raws: string[]
}

export function chunkDoc(doc: DocInput, opts: ChunkOptions = {}): Chunk[] {
  const max = opts.maxChars ?? 1400
  const excerptChars = opts.excerptChars ?? 220
  const tokens = new Lexer().lex(doc.body.replace(/\r\n/g, '\n'))

  const used = new Map<string, number>()
  const headId = (text: string) => {
    const base = slugifyHeading(text)
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  }

  const sections: Section[] = [{ heading: null, anchor: null, raws: [] }]
  let h2: string | null = null
  for (const tok of tokens) {
    if (tok.type === 'space') continue
    if (tok.type === 'heading') {
      const h = tok as Tokens.Heading
      const title = plain(h.tokens, h.text)
      const id = headId(title)
      // Chunks start at ## and ###. Deeper headings stay inside their parent chunk
      // (they still consume an id, like in the rendered page).
      if (h.depth === 2 || h.depth === 3) {
        if (h.depth === 2) h2 = title
        sections.push({
          heading: h.depth === 3 && h2 ? `${h2} > ${title}` : title,
          anchor: id,
          raws: [],
        })
        continue
      }
    }
    sections.at(-1)?.raws.push(tok.raw.trim())
  }

  // The intro carries the summary: it is the best "what is this page" text.
  const intro = sections[0]
  if (intro) intro.raws.unshift(doc.summary.trim())

  const chunks: Chunk[] = []
  for (const s of sections) {
    const blocks = s.raws.filter(Boolean).flatMap((r) => hardSplit(r, max))
    if (!blocks.length) continue
    const parts: string[] = []
    let cur = ''
    for (const b of blocks) {
      if (cur && cur.length + b.length + 2 > max) {
        parts.push(cur)
        cur = ''
      }
      cur += (cur ? '\n\n' : '') + b
    }
    if (cur) parts.push(cur)

    parts.forEach((text, i) => {
      const base = `${doc.slug}#${s.anchor ?? ''}`
      chunks.push({
        id: i === 0 ? base : `${base}:${i + 1}`,
        kind: 'doc',
        slug: doc.slug,
        title: doc.title,
        heading: s.heading,
        anchor: s.anchor,
        text,
        excerpt: toExcerpt(text, excerptChars),
      })
    })
  }
  return chunks
}
