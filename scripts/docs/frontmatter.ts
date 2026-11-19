// Frontmatter de un documento: separación del cuerpo y validación tipada.
import { parse } from 'yaml'
import type { DocLang } from '../../src/lib/docs/types.ts'

export interface Frontmatter {
  title: string
  summary: string
  tags: string[]
  related: string[]
  since: string
  lang: DocLang
}

export class DocError extends Error {
  readonly file: string
  constructor(file: string, message: string) {
    super(`${file}: ${message}`)
    this.name = 'DocError'
    this.file = file
  }
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const VERSION = /^\d+\.\d+\.\d+$/
const KEYS = ['title', 'summary', 'tags', 'related', 'since', 'lang'] as const

/** Separa `---\nyaml\n---\ncuerpo`. Sin frontmatter es un error (todo doc lo necesita). */
export function splitFrontmatter(
  file: string,
  raw: string,
): { data: unknown; body: string; bodyLine: number } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text)
  if (!m)
    throw new DocError(file, 'falta el frontmatter (bloque `---` al inicio)')
  let data: unknown
  try {
    data = parse(m[1] ?? '')
  } catch (e) {
    throw new DocError(
      file,
      `frontmatter no es YAML válido (si un valor contiene ": " o empieza con un símbolo, ponlo entre comillas): ${(e as Error).message}`,
    )
  }
  return {
    data,
    body: text.slice(m[0].length),
    bodyLine: m[0].split('\n').length,
  }
}

function stringList(file: string, key: string, v: unknown): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim()))
    throw new DocError(
      file,
      `\`${key}\` debe ser una lista de textos no vacíos`,
    )
  return (v as string[]).map((x) => x.trim())
}

/** Valida el frontmatter. Claves desconocidas fallan (un typo no debe pasar en silencio). */
export function validateFrontmatter(file: string, data: unknown): Frontmatter {
  if (data === null || typeof data !== 'object' || Array.isArray(data))
    throw new DocError(file, 'el frontmatter debe ser un mapa de claves')
  const d = data as Record<string, unknown>

  const unknown = Object.keys(d).filter(
    (k) => !(KEYS as readonly string[]).includes(k),
  )
  if (unknown.length)
    throw new DocError(
      file,
      `claves desconocidas en el frontmatter: ${unknown.join(', ')} (válidas: ${KEYS.join(', ')})`,
    )

  const text = (key: 'title' | 'summary'): string => {
    const v = d[key]
    if (typeof v !== 'string' || !v.trim())
      throw new DocError(file, `\`${key}\` es obligatorio y debe ser texto`)
    return v.trim().replace(/\s+/g, ' ')
  }
  const title = text('title')
  const summary = text('summary')

  const tags = stringList(file, 'tags', d.tags ?? [])
  if (!tags.length) throw new DocError(file, '`tags` necesita al menos un tag')
  for (const t of tags)
    if (!SLUG.test(t))
      throw new DocError(
        file,
        `tag inválido "${t}": usa minúsculas, números y guiones`,
      )
  if (new Set(tags).size !== tags.length)
    throw new DocError(file, '`tags` tiene valores repetidos')

  const related = stringList(file, 'related', d.related ?? [])
  for (const r of related)
    if (!SLUG.test(r))
      throw new DocError(file, `slug inválido en \`related\`: "${r}"`)
  if (new Set(related).size !== related.length)
    throw new DocError(file, '`related` tiene valores repetidos')

  // YAML lee `0.2.0` como texto, pero `1.0` como número: se exige X.Y.Z entre comillas si hace falta.
  const since = d.since
  if (typeof since !== 'string' || !VERSION.test(since))
    throw new DocError(
      file,
      '`since` es obligatorio y debe ser una versión X.Y.Z (ej. 0.2.0)',
    )

  const lang = d.lang ?? 'es'
  if (lang !== 'es' && lang !== 'en')
    throw new DocError(file, '`lang` debe ser "es" o "en"')

  return { title, summary, tags, related, since, lang }
}
