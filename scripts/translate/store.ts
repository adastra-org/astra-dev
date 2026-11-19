// Traducciones ES guardadas en el repo (`content/translations/es/`). Las lee el build del sitio y
// las lee y escribe el pipeline (`run.ts`). El formato es el contrato del flag
// `translated: auto | reviewed`:
//
//   natives/<slug>.yml  translated, source, [model], description, returns, params{nombre: texto}
//   docs/<slug>.md      frontmatter (title, summary, translated, source, [model]) + cuerpo
//
// `source` es el hash del texto en inglés que se tradujo: si la fuente cambia, la traducción queda
// vieja (se avisa; una `reviewed` nunca se pisa sola).
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parse, stringify } from 'yaml'
import type { Translated } from '../../src/lib/docs/types.ts'

export const TRANSLATIONS_DIR = 'content/translations/es'

export const hash = (s: string) =>
  createHash('sha1').update(s).digest('hex').slice(0, 12)

const isTranslated = (v: unknown): v is Translated =>
  v === 'auto' || v === 'reviewed'

export class TranslationError extends Error {
  constructor(file: string, message: string) {
    super(`${file}: ${message}`)
    this.name = 'TranslationError'
  }
}

// ---------- natives ----------

/** Los campos de un native que se traducen. El código, la firma y los nombres no. */
export interface NativeText {
  description: string
  returns: string
  params: Record<string, string>
}

export interface NativeTranslation extends NativeText {
  translated: Translated
  source: string
  model?: string
}

/** Hash del texto inglés de un native (lo que entra al prompt, en orden estable). */
export function nativeSource(t: NativeText): string {
  return hash(
    JSON.stringify([
      t.description,
      t.returns,
      Object.entries(t.params).sort(([a], [b]) => a.localeCompare(b)),
    ]),
  )
}

export function parseNativeTranslation(
  file: string,
  raw: string,
): NativeTranslation {
  let data: unknown
  try {
    data = parse(raw)
  } catch (e) {
    throw new TranslationError(file, `YAML inválido: ${(e as Error).message}`)
  }
  const d = (data ?? {}) as Record<string, unknown>
  const known = [
    'translated',
    'source',
    'model',
    'description',
    'returns',
    'params',
  ]
  const extra = Object.keys(d).filter((k) => !known.includes(k))
  if (extra.length)
    throw new TranslationError(
      file,
      `claves desconocidas: ${extra.join(', ')} (válidas: ${known.join(', ')})`,
    )
  if (!isTranslated(d.translated))
    throw new TranslationError(
      file,
      '`translated` debe ser "auto" o "reviewed"',
    )
  if (typeof d.source !== 'string' || !d.source)
    throw new TranslationError(
      file,
      '`source` es obligatorio (hash del inglés)',
    )
  const str = (k: 'description' | 'returns') => {
    const v = d[k] ?? ''
    if (typeof v !== 'string')
      throw new TranslationError(file, `\`${k}\` debe ser texto`)
    return v.trim()
  }
  const params: Record<string, string> = {}
  const rawParams = d.params ?? {}
  if (typeof rawParams !== 'object' || Array.isArray(rawParams))
    throw new TranslationError(file, '`params` debe ser un mapa nombre → texto')
  for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
    if (typeof v !== 'string')
      throw new TranslationError(file, `\`params.${k}\` debe ser texto`)
    params[k] = v.trim()
  }
  return {
    translated: d.translated,
    source: d.source,
    ...(typeof d.model === 'string' ? { model: d.model } : {}),
    description: str('description'),
    returns: str('returns'),
    params,
  }
}

export function stringifyNativeTranslation(t: NativeTranslation): string {
  return stringify(
    {
      translated: t.translated,
      source: t.source,
      ...(t.model ? { model: t.model } : {}),
      description: t.description,
      returns: t.returns,
      params: t.params,
    },
    { lineWidth: 0 },
  )
}

// ---------- docs ----------

export interface DocText {
  title: string
  summary: string
  body: string
}

export interface DocTranslation extends DocText {
  translated: Translated
  source: string
  model?: string
}

export const docSource = (t: DocText) =>
  hash(JSON.stringify([t.title, t.summary, t.body]))

export function parseDocTranslation(file: string, raw: string): DocTranslation {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text)
  if (!m) throw new TranslationError(file, 'falta el frontmatter')
  let data: unknown
  try {
    data = parse(m[1] ?? '')
  } catch (e) {
    throw new TranslationError(file, `YAML inválido: ${(e as Error).message}`)
  }
  const d = (data ?? {}) as Record<string, unknown>
  const known = ['title', 'summary', 'translated', 'source', 'model']
  const extra = Object.keys(d).filter((k) => !known.includes(k))
  if (extra.length)
    throw new TranslationError(
      file,
      `claves desconocidas: ${extra.join(', ')} (válidas: ${known.join(', ')})`,
    )
  if (!isTranslated(d.translated))
    throw new TranslationError(
      file,
      '`translated` debe ser "auto" o "reviewed"',
    )
  for (const k of ['title', 'summary', 'source'] as const)
    if (typeof d[k] !== 'string' || !(d[k] as string).trim())
      throw new TranslationError(
        file,
        `\`${k}\` es obligatorio y debe ser texto`,
      )
  return {
    title: (d.title as string).trim().replace(/\s+/g, ' '),
    summary: (d.summary as string).trim().replace(/\s+/g, ' '),
    translated: d.translated,
    source: d.source as string,
    ...(typeof d.model === 'string' ? { model: d.model } : {}),
    body: text.slice(m[0].length).replace(/^\n+/, ''),
  }
}

export function stringifyDocTranslation(t: DocTranslation): string {
  const fm = stringify(
    {
      title: t.title,
      summary: t.summary,
      translated: t.translated,
      source: t.source,
      ...(t.model ? { model: t.model } : {}),
    },
    { lineWidth: 0 },
  ).trimEnd()
  return `---\n${fm}\n---\n\n${t.body.trim()}\n`
}

// ---------- disco ----------

export const nativeFile = (root: string, slug: string) =>
  join(root, TRANSLATIONS_DIR, 'natives', `${slug}.yml`)
export const docFile = (root: string, slug: string) =>
  join(root, TRANSLATIONS_DIR, 'docs', `${slug}.md`)

async function readAll<T>(
  dir: string,
  ext: string,
  parseFile: (file: string, raw: string) => T,
): Promise<Map<string, T>> {
  const out = new Map<string, T>()
  if (!existsSync(dir)) return out
  for (const f of (await readdir(dir)).sort()) {
    if (!f.endsWith(ext)) continue
    const file = join(dir, f)
    out.set(
      f.slice(0, -ext.length),
      parseFile(file, await readFile(file, 'utf8')),
    )
  }
  return out
}

/** Todas las traducciones de natives, por slug. Un archivo inválido lanza con su ruta. */
export const readNativeTranslations = (root: string) =>
  readAll(
    join(root, TRANSLATIONS_DIR, 'natives'),
    '.yml',
    parseNativeTranslation,
  )

/** Todas las traducciones de docs, por slug. */
export const readDocTranslations = (root: string) =>
  readAll(join(root, TRANSLATIONS_DIR, 'docs'), '.md', parseDocTranslation)

async function put(file: string, text: string) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, text)
}

export const writeNativeTranslation = (
  root: string,
  slug: string,
  t: NativeTranslation,
) => put(nativeFile(root, slug), stringifyNativeTranslation(t))

export const writeDocTranslation = (
  root: string,
  slug: string,
  t: DocTranslation,
) => put(docFile(root, slug), stringifyDocTranslation(t))
