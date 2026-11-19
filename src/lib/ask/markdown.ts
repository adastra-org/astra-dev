// Respuesta del modelo -> árbol seguro. El modelo es texto no confiable: aquí no existe HTML
// crudo, imágenes ni enlaces escritos por él. Solo se conserva texto, énfasis, código, listas y
// las citas `[n]`, que enlazan a las fuentes que decidió el server (nunca a URLs del modelo).
// El árbol lo pinta React como nodos (sin `dangerouslySetInnerHTML`).
import { lexer, type Token, type Tokens } from 'marked'

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'cite'; n: number }
  | { kind: 'br' }

export type Block =
  | { kind: 'p'; children: Inline[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'list'; ordered: boolean; items: Block[][] }
  | { kind: 'quote'; children: Block[] }
  | { kind: 'table'; head: Inline[][]; rows: Inline[][][] }

const CITE = /\[(\d{1,2})\]/g

/** Parte un texto en texto + citas `[n]` (solo las que existen, 1..sourceCount). */
export function withCitations(text: string, sourceCount: number): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(CITE)) {
    const n = Number(m[1])
    if (n < 1 || n > sourceCount) continue
    if (m.index > last)
      out.push({ kind: 'text', text: text.slice(last, m.index) })
    out.push({ kind: 'cite', n })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

function inlines(tokens: Token[] | undefined, count: number): Inline[] {
  const out: Inline[] = []
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'text':
      case 'escape': {
        const tt = t as Tokens.Text
        // Un `text` puede traer hijos (dentro de listas): se respetan.
        if (tt.tokens?.length) out.push(...inlines(tt.tokens, count))
        else out.push(...withCitations(tt.text, count))
        break
      }
      case 'codespan':
        out.push({ kind: 'code', text: (t as Tokens.Codespan).text })
        break
      case 'strong':
        out.push({
          kind: 'strong',
          children: inlines((t as Tokens.Strong).tokens, count),
        })
        break
      case 'em':
        out.push({
          kind: 'em',
          children: inlines((t as Tokens.Em).tokens, count),
        })
        break
      case 'del':
        out.push(...inlines((t as Tokens.Del).tokens, count))
        break
      case 'br':
        out.push({ kind: 'br' })
        break
      case 'link':
        // El texto del enlace sí; el destino jamás.
        out.push(...inlines((t as Tokens.Link).tokens, count))
        break
      case 'image':
        // Nada de imágenes: solo el texto alternativo.
        out.push({ kind: 'text', text: (t as Tokens.Image).text })
        break
      default:
        // `html` y cualquier otro: se muestra como texto literal, escapado por React.
        out.push({ kind: 'text', text: (t as { raw: string }).raw })
    }
  }
  return out
}

function blocks(tokens: Token[], count: number): Block[] {
  const out: Block[] = []
  for (const t of tokens) {
    switch (t.type) {
      case 'paragraph':
      case 'text': {
        const tt = t as Tokens.Paragraph
        out.push({ kind: 'p', children: inlines(tt.tokens, count) })
        break
      }
      case 'heading':
        // Sin jerarquía de títulos dentro de una burbuja: negrita.
        out.push({
          kind: 'p',
          children: [
            {
              kind: 'strong',
              children: inlines((t as Tokens.Heading).tokens, count),
            },
          ],
        })
        break
      case 'code': {
        const c = t as Tokens.Code
        out.push({
          kind: 'code',
          lang: (c.lang ?? '').trim().split(/\s+/)[0] ?? '',
          text: c.text,
        })
        break
      }
      case 'list': {
        const l = t as Tokens.List
        out.push({
          kind: 'list',
          ordered: l.ordered,
          items: l.items.map((it) => blocks(it.tokens, count)),
        })
        break
      }
      case 'blockquote':
        out.push({
          kind: 'quote',
          children: blocks((t as Tokens.Blockquote).tokens, count),
        })
        break
      case 'table': {
        const tb = t as Tokens.Table
        out.push({
          kind: 'table',
          head: tb.header.map((c) => inlines(c.tokens, count)),
          rows: tb.rows.map((r) => r.map((c) => inlines(c.tokens, count))),
        })
        break
      }
      case 'space':
      case 'hr':
        break
      default:
        // HTML en bloque, etc.: texto literal.
        out.push({
          kind: 'p',
          children: [{ kind: 'text', text: (t as { raw: string }).raw.trim() }],
        })
    }
  }
  return out
}

/** Markdown del modelo -> bloques seguros. `sourceCount` valida las citas `[n]`. */
export function parseAnswer(markdown: string, sourceCount: number): Block[] {
  return blocks(lexer(markdown, { gfm: true, breaks: false }), sourceCount)
}
