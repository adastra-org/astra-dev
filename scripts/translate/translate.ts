// Núcleo del pipeline de traducción EN → ES: prompts, lectura y validación de las respuestas, y la
// decisión de qué traducir. Puro: el modelo entra como `Translator`, así que se prueba sin red.
// El CLI (`run.ts`) lo conecta a `ds.ts` (deepseek-flash).
import type { Native } from '../import/types.ts'
import {
  type DocText,
  type NativeText,
  type TranslationError,
} from './store.ts'

export type { TranslationError }

/** Llama al modelo: `system` y `prompt` entran, el texto de la respuesta sale. */
export type Translator = (
  system: string,
  prompt: string,
  opts: { maxTokens: number },
) => Promise<string>

export const MODEL = 'deepseek-flash'

export const SYSTEM = `Eres un traductor técnico especializado en modding de FiveM y GTA V. Traduces documentación del inglés al español neutro de Latinoamérica, tuteando ("tú", nunca voseo).

Reglas, sin excepciones:
- Conserva el Markdown exactamente: enlaces (texto traducido, destino idéntico), listas, tablas, encabezados, citas y código en línea entre acentos graves.
- No modifiques el contenido de los acentos graves ni de los bloques de código, ni siquiera sus comentarios.
- No traduzcas: nombres de natives y funciones (SET_VEHICLE_DOOR_OPEN, SetVehicleDoorOpen), identificadores, nombres de parámetros, tipos (int, BOOL, Vector3, char*), valores (true, false, nil, null), hashes, rutas, comandos, nombres de archivo ni nombres propios (FiveM, CitizenFX, Lua, GTA V, Rockstar).
- Deja en inglés los términos que la comunidad hispanohablante usa tal cual: ped, native, handle, hash, resource, blip, spawn, script, netId. "Client" y "server" se dejan cuando nombran un entorno de ejecución.
- No agregues explicaciones, avisos ni comentarios tuyos y no omitas nada del original.
- Responde únicamente con el formato que pide el usuario.`

// ---------- utilidades de validación ----------

const FENCE = /^\s*(```|~~~)/gm
const fences = (s: string) => (s.match(FENCE) ?? []).length

/** Destinos de enlaces `](...)`, ordenados: tienen que ser los mismos antes y después. */
const hrefs = (s: string) =>
  [...s.matchAll(/\]\(([^)\s]+)/g)].map((m) => m[1] ?? '').sort()

/** Código en línea `...` (fuera de bloques), ordenado. */
const inlineCode = (s: string) =>
  [...s.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '').matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1] ?? '')
    .sort()

/** Cuerpos de los bloques de código, en orden. */
const codeBodies = (s: string) =>
  [...s.matchAll(/^[ \t]*(```|~~~)[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*$/gm)].map(
    (m) => m[2] ?? '',
  )

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i])

/** Diferencias de estructura entre un texto y su traducción. Vacío = la traducción es válida. */
export function structureProblems(
  where: string,
  en: string,
  es: string,
): string[] {
  const out: string[] = []
  if (en.trim() && !es.trim()) out.push(`${where}: vacío`)
  if (fences(en) !== fences(es))
    out.push(`${where}: cambió el número de bloques de código`)
  if (!sameList(codeBodies(en), codeBodies(es)))
    out.push(`${where}: se modificó el contenido de un bloque de código`)
  if (!sameList(hrefs(en), hrefs(es)))
    out.push(`${where}: cambiaron los destinos de los enlaces`)
  if (!sameList(inlineCode(en), inlineCode(es)))
    out.push(`${where}: cambió un código en línea (acentos graves)`)
  return out
}

/** `true` si no hay nada que traducir (sin letras: `Vehicle.` sí, `` vacío no). */
const hasText = (s: string) => /\p{L}/u.test(s)

// ---------- natives ----------

export interface NativeJob {
  slug: string
  text: NativeText
}

/** ¿Vale la pena traducirlo? Hace falta una descripción (los parámetros solos no alcanzan). */
export const isTranslatableNative = (n: Native) => hasText(n.description)

export function nativePrompt(jobs: readonly NativeJob[]): string {
  const items = jobs.map((j) => ({
    slug: j.slug,
    description: j.text.description,
    returns: j.text.returns,
    params: j.text.params,
  }))
  return `Traduce al español los textos de estos natives de FiveM. Entrada: un arreglo JSON con "slug", "description", "returns" y "params" (nombre de parámetro → descripción). Los textos son Markdown.

Devuelve únicamente un arreglo JSON, con los mismos "slug" y la misma forma: no cambies los slugs ni los nombres de los parámetros, traduce solo los valores de texto. Sin bloques de código alrededor, sin comentarios.

${JSON.stringify(items, null, 1)}`
}

/** Saca el JSON de una respuesta, aunque el modelo la envuelva en un bloque de código. */
export function extractJson(reply: string): unknown {
  const t = reply.trim()
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(t)
  return JSON.parse(fenced?.[1] ?? t)
}

export interface Parsed<T> {
  ok: Map<string, T>
  /** slug → motivos por los que no se acepta. */
  failed: Map<string, string[]>
}

const asText = (v: unknown): string | null => (typeof v === 'string' ? v : null)

export function validateNative(en: NativeText, es: NativeText): string[] {
  const out: string[] = []
  out.push(...structureProblems('description', en.description, es.description))
  out.push(...structureProblems('returns', en.returns, es.returns))
  const enKeys = Object.keys(en.params).sort()
  const esKeys = Object.keys(es.params).sort()
  if (!sameList(enKeys, esKeys))
    out.push('params: cambiaron los nombres de los parámetros')
  else
    for (const k of enKeys)
      out.push(
        ...structureProblems(
          `params.${k}`,
          en.params[k] ?? '',
          es.params[k] ?? '',
        ),
      )
  return out
}

export function parseNativeReply(
  reply: string,
  jobs: readonly NativeJob[],
): Parsed<NativeText> {
  const ok = new Map<string, NativeText>()
  const failed = new Map<string, string[]>()
  let data: unknown
  try {
    data = extractJson(reply)
  } catch {
    for (const j of jobs) failed.set(j.slug, ['la respuesta no es JSON'])
    return { ok, failed }
  }
  const list = Array.isArray(data) ? data : []
  const bySlug = new Map<string, Record<string, unknown>>()
  for (const x of list)
    if (
      x &&
      typeof x === 'object' &&
      typeof (x as { slug?: unknown }).slug === 'string'
    )
      bySlug.set((x as { slug: string }).slug, x as Record<string, unknown>)

  for (const j of jobs) {
    const x = bySlug.get(j.slug)
    if (!x) {
      failed.set(j.slug, ['falta en la respuesta'])
      continue
    }
    const description = asText(x.description)
    const returns = asText(x.returns)
    const rawParams = x.params
    const params: Record<string, string> = {}
    let shape = description !== null && returns !== null
    if (
      rawParams &&
      typeof rawParams === 'object' &&
      !Array.isArray(rawParams)
    ) {
      for (const [k, v] of Object.entries(
        rawParams as Record<string, unknown>,
      )) {
        const s = asText(v)
        if (s === null) shape = false
        else params[k] = s.trim()
      }
    } else if (Object.keys(j.text.params).length) shape = false
    if (!shape) {
      failed.set(j.slug, ['forma inválida'])
      continue
    }
    const es: NativeText = {
      description: (description ?? '').trim(),
      returns: (returns ?? '').trim(),
      params,
    }
    const problems = validateNative(j.text, es)
    if (problems.length) failed.set(j.slug, problems)
    else ok.set(j.slug, es)
  }
  return { ok, failed }
}

// ---------- docs ----------

export function docPrompt(t: DocText): string {
  return `Traduce al español este documento de FiveM. Traduce el título, el resumen y el cuerpo (Markdown). Traduce también los encabezados del cuerpo.

Devuelve exactamente esto, sin nada antes ni después:
<title>título traducido</title>
<summary>resumen traducido</summary>
<body>
cuerpo traducido
</body>

<title>${t.title}</title>
<summary>${t.summary}</summary>
<body>
${t.body}
</body>`
}

const headings = (s: string) =>
  [
    ...s
      .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
      .matchAll(/^(#{1,6})\s/gm),
  ].map((m) => m[1]?.length ?? 0)

export function validateDoc(en: DocText, es: DocText): string[] {
  const out: string[] = []
  if (!es.title.trim()) out.push('title: vacío')
  if (!es.summary.trim()) out.push('summary: vacío')
  out.push(...structureProblems('body', en.body, es.body))
  if (!sameList(headings(en.body).map(String), headings(es.body).map(String)))
    out.push('body: cambió la estructura de encabezados')
  return out
}

export function parseDocReply(
  reply: string,
  en: DocText,
): { ok: DocText } | { failed: string[] } {
  const tag = (name: string) =>
    new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(reply)?.[1]
  const title = tag('title')
  const summary = tag('summary')
  const body = /<body>\n?([\s\S]*)\n?<\/body>/.exec(reply)?.[1]
  if (title === undefined || summary === undefined || body === undefined)
    return { failed: ['la respuesta no trae <title>, <summary> y <body>'] }
  const es: DocText = {
    title: title.trim().replace(/\s+/g, ' '),
    summary: summary.trim().replace(/\s+/g, ' '),
    body: body.trim(),
  }
  const problems = validateDoc(en, es)
  return problems.length ? { failed: problems } : { ok: es }
}

// ---------- qué traducir ----------

export type Decision =
  | 'translate'
  /** Ya está traducido y el original no cambió. */
  | 'done'
  /** El original cambió y la traducción es automática: se rehace solo con `--refresh`. */
  | 'stale-auto'
  /** El original cambió pero una persona revisó la traducción: no se toca. */
  | 'stale-reviewed'

/**
 * Regla central de idempotencia. Una traducción `reviewed` NUNCA se vuelve a traducir, ni con
 * `--refresh`: si el original cambia solo se avisa, y la decisión de rehacerla es de una persona
 * (que edita el archivo y ajusta `source` o borra la traducción).
 */
export function decide(
  existing: { translated: 'auto' | 'reviewed'; source: string } | undefined,
  currentSource: string,
  refresh: boolean,
): Decision {
  if (!existing) return 'translate'
  if (existing.source === currentSource) return 'done'
  if (existing.translated === 'reviewed') return 'stale-reviewed'
  return refresh ? 'translate' : 'stale-auto'
}

/** Reparte en lotes de `size`. */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += Math.max(1, size))
    out.push(list.slice(i, i + Math.max(1, size)))
  return out
}
