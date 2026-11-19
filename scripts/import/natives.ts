// Parser de un native (`citizenfx/natives` y `citizenfx/fivem/ext/native-decls`): ambos usan el
// mismo formato. Lenient con lo que no entiende (va a `extra`), estricto con lo que necesita
// (nombre y firma): un archivo sin ellos es un error con la ruta, no un native vacío.
import { parse } from 'yaml'
import { joaat, normalizeHash } from './hash.ts'
import {
  ImportError,
  type Native,
  type NativeApiset,
  type NativeParam,
  type NativeSource,
} from './types.ts'

const FRONTMATTER = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/
const HASH = /0x[0-9A-Fa-f]+/g
const NATIVE_LINK = /\]\(#_(0x[0-9A-Fa-f]+)\)/g
const APISETS = new Set<string>(['client', 'server', 'shared'])

interface Section {
  title: string
  body: string
}

/** Separa el cuerpo en secciones `## Título`. Respeta los bloques de código (un `## ` dentro no corta). */
function sections(body: string): Section[] {
  const out: Section[] = []
  let cur: { title: string; lines: string[] } | null = null
  let fence = false
  for (const line of body.split('\n')) {
    if (/^(```|~~~)/.test(line)) fence = !fence
    const h = !fence ? /^##(?:[ \t]+(.*?))?[ \t]*$/.exec(line) : null
    if (h) {
      if (cur) out.push({ title: cur.title, body: cur.lines.join('\n').trim() })
      cur = { title: h[1] ?? '', lines: [] }
    } else cur?.lines.push(line)
  }
  if (cur) out.push({ title: cur.title, body: cur.lines.join('\n').trim() })
  return out
}

/** Parte `tipo nombre, tipo nombre` sin romper tipos como `char*` ni genéricos. */
function splitParams(list: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '(' || c === '<' || c === '[') depth++
    else if (c === ')' || c === '>' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      parts.push(list.slice(start, i))
      start = i + 1
    }
  }
  parts.push(list.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

function parseSignature(
  file: string,
  code: string,
): {
  name: string
  hashes: string[]
  signature: string
  returnType: string
  params: { name: string; type: string }[]
} {
  const lines = code.split('\n')
  const hashes: string[] = []
  const sig: string[] = []
  for (const l of lines) {
    const t = l.trim()
    if (t.startsWith('//')) hashes.push(...(t.match(HASH) ?? []))
    else if (t) sig.push(t)
  }
  // Anotaciones de la fuente antes del tipo (`cs_type(int) BOOL NAME()`): son pistas para C#.
  const signature = sig
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/;$/, '')
    .replace(/^(?:[a-z_]+\([^)]*\)\s+)+/, '')
  const m = /^(.*?)\b([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(signature)
  // Sin encabezado (hay natives con `## ` vacío en la fuente) manda el nombre de la firma.
  // El encabezado puede ir atrasado (`## _0xE26C…` con la firma ya renombrada): la firma manda.
  if (!m)
    throw new ImportError(file, `no se pudo leer la firma: "${signature}"`)
  const params = splitParams(m[3] ?? '')
    .filter((p) => p !== 'void')
    .map((p) => {
      const pm = /^(.*?)([A-Za-z_][A-Za-z0-9_]*)$/.exec(p)
      return pm && pm[1]?.trim()
        ? { type: pm[1].trim(), name: pm[2] ?? '' }
        : { type: p, name: '' }
    })
  return {
    name: m[2] ?? '',
    hashes: hashes.map(normalizeHash),
    signature,
    returnType: (m[1] ?? '').trim() || 'void',
    params,
  }
}

function parseParamDocs(body: string): Map<string, string> {
  const out = new Map<string, string>()
  let cur: string | null = null
  for (const line of body.split('\n')) {
    const m = /^[*-][ \t]+\*\*([^*]+)\*\*[ \t]*:?[ \t]*(.*)$/.exec(line)
    if (m) {
      cur = (m[1] ?? '').trim()
      out.set(cur, (m[2] ?? '').trim())
    } else if (cur && line.trim()) {
      out.set(cur, `${out.get(cur) ?? ''}\n${line.trim()}`.trim())
    }
  }
  return out
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : typeof v === 'string'
      ? [v]
      : []

/** Parsea un native. `path` es relativo al repo de origen y sirve de mensaje de error y de procedencia. */
export function parseNative(
  source: NativeSource,
  path: string,
  raw: string,
): Native {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const fm = FRONTMATTER.exec(text)
  let data: Record<string, unknown> = {}
  if (fm) {
    try {
      const parsed: unknown = parse(fm[1] ?? '')
      if (parsed && typeof parsed === 'object')
        data = parsed as Record<string, unknown>
    } catch (e) {
      throw new ImportError(path, `frontmatter YAML inválido: ${String(e)}`)
    }
  }
  const body = fm ? text.slice(fm[0].length) : text
  const secs = sections(body)
  const head = secs[0]
  const headed = head?.title.trim() ?? ''
  if (headed && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(headed))
    throw new ImportError(path, `encabezado de native inválido: "${headed}"`)

  const codeMatch = /^```[a-z]*\n([\s\S]*?)\n```/m.exec(head?.body ?? '')
  if (!codeMatch) throw new ImportError(path, 'falta el bloque con la firma')
  const sig = parseSignature(path, codeMatch[1] ?? '')
  const name = sig.name
  const description = (head?.body ?? '')
    .slice((codeMatch.index ?? 0) + codeMatch[0].length)
    .trim()

  let paramDocs = new Map<string, string>()
  let returns = ''
  let examples = ''
  const extra: { title: string; body: string }[] = []
  for (const s of secs.slice(1)) {
    const key = s.title.toLowerCase().trim()
    if (key === 'parameters') paramDocs = parseParamDocs(s.body)
    else if (key === 'return value') returns = s.body
    else if (key === 'examples' || key === 'example')
      examples = examples ? `${examples}\n\n${s.body}` : s.body
    else extra.push(s)
  }

  const params: NativeParam[] = sig.params.map((p) => ({
    name: p.name,
    type: p.type,
    description: paramDocs.get(p.name) ?? '',
  }))

  const linked = new Set<string>()
  for (const m of text.matchAll(NATIVE_LINK))
    linked.add(normalizeHash(m[1] ?? ''))

  const apisetRaw = typeof data.apiset === 'string' ? data.apiset.trim() : ''
  const luaName = (path.split('/').pop() ?? '').replace(/\.md$/, '')
  const hashes = [...new Set(sig.hashes)]
  // CFX no trae hash en la firma: el de 32 bits es el joaat del nombre.
  if (source === 'cfx' && hashes.length === 0) hashes.push(joaat(name))

  return {
    id: `${source}:${name}`,
    slug: '', // lo asigna `buildCorpus`, que ve todos los natives
    source,
    name,
    luaName,
    ns: typeof data.ns === 'string' ? data.ns.trim() : '',
    apiset: APISETS.has(apisetRaw) ? (apisetRaw as NativeApiset) : null,
    game: typeof data.game === 'string' ? data.game.trim() : null,
    hashes,
    signature: sig.signature,
    returnType: sig.returnType,
    params,
    description,
    returns,
    examples,
    extra,
    aliases: [
      ...new Set([
        ...asArray(data.aliases),
        ...(headed && headed !== name ? [headed] : []),
      ]),
    ],
    seeAlso: [...linked], // hashes por ahora: `resolveLinks` los convierte en ids
    unresolved: [],
    astraNotes: '',
    upstream: { source, path },
  }
}

/** Índice hash → id (los 64 y 32 bits de cada native; en CFX el joaat del nombre). */
export function buildHashIndex(
  natives: readonly Native[],
): Map<string, string> {
  const idx = new Map<string, string>()
  // GTA primero: si CFX redefine el mismo nombre, un hash ambiguo apunta al native de GTA.
  const ordered = [...natives].sort(
    (a, b) => Number(b.source === 'gta') - Number(a.source === 'gta'),
  )
  for (const n of ordered) {
    for (const h of n.hashes) if (!idx.has(h)) idx.set(h, n.id)
    // El hash corto también es el joaat del nombre en los natives de GTA.
    const short = joaat(n.name)
    if (!idx.has(short)) idx.set(short, n.id)
  }
  return idx
}

/** Convierte los hashes enlazados en ids; los que no existen quedan en `unresolved`. */
export function resolveLinks(natives: Native[]): void {
  const idx = buildHashIndex(natives)
  for (const n of natives) {
    const ids = new Set<string>()
    const unresolved: string[] = []
    for (const h of n.seeAlso) {
      const id = idx.get(h)
      if (!id) unresolved.push(h)
      else if (id !== n.id) ids.add(id)
    }
    n.seeAlso = [...ids].sort()
    n.unresolved = unresolved.sort()
  }
}
