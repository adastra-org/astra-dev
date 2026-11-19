// Markdown → texto plano de una línea, para resúmenes, tarjetas y el palette. Sin dependencias.

/**
 * Quita enlaces, imágenes, HTML y énfasis. Los `_` de los identificadores (`SET_VEHICLE_DOOR_OPEN`)
 * se conservan: solo se quita el énfasis `_x_` cuando rodea una palabra entera.
 */
export function plainText(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>\n]+>/g, '')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[\s(])\*(?=\S)([^*\n]*?\S)\*(?=$|[\s).,;:!?])/g, '$1$2')
    .replace(/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=$|[\s).,;:!?])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Texto plano cortado a `max` caracteres (con `…`), sin partir una palabra si se puede. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** Primer párrafo de un Markdown, en texto plano y cortado a `max`. */
export function firstParagraphPlain(md: string, max: number): string {
  const para = md.trim().split(/\n\s*\n/)[0] ?? ''
  return clip(plainText(para), max)
}
