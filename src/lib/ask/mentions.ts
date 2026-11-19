// Menciones con `@` en el campo de /ask: una sesión guardada, un native o un issue. Lo elegido
// viaja en el campo `mentions` de `POST /chat` y el server lo vuelve contexto (los natives y los
// issues los resuelve él: del cliente solo recibe el slug o el número). Fuera de React: todo se
// prueba con `bun test`. Plan: docs/chat/README.md (Fase 4).
import { loadPreparedNatives } from '@/lib/natives/data'
import { searchNatives } from '@/lib/natives/query'
import { gql } from '@/lib/project/api'
import { type Session, SUMMARY_MAX_CHARS, summarize } from './sessions'

/** Espejo de `server/src/chat/mentions.ts`: el server rechaza (400) lo que pase de acá. */
export const MENTIONS_MAX_ITEMS = 5
export const MENTION_SESSION_MAX_CHARS = SUMMARY_MAX_CHARS
export const MENTION_SESSIONS_MAX_TOTAL = 4000

export type MentionKind = 'session' | 'native' | 'issue'

/** Forma que viaja en el request. */
export type MentionBody =
  | { kind: 'native'; slug: string }
  | { kind: 'issue'; number: number }
  | { kind: 'session'; title: string; text: string }

/** Una mención elegida (chip) o una opción del selector. */
export interface Mention {
  /** Identidad estable: `s:<id>`, `n:<slug>`, `i:<número>`. */
  key: string
  kind: MentionKind
  /** Lo que se escribe en el campo tras la `@`: sin espacios. */
  label: string
  /** Segunda línea del selector (título completo, resumen, estado). */
  hint: string
  body: MentionBody
}

export type MentionFailure = 'max_items' | 'duplicate' | 'max_total'

export type MentionResult = { ok: true } | { ok: false; reason: MentionFailure }

/** Si `m` entra junto a las ya elegidas. */
export function canAdd(current: readonly Mention[], m: Mention): MentionResult {
  if (current.some((c) => c.key === m.key))
    return { ok: false, reason: 'duplicate' }
  if (current.length >= MENTIONS_MAX_ITEMS)
    return { ok: false, reason: 'max_items' }
  if (m.body.kind === 'session') {
    const used = current.reduce(
      (n, c) => (c.body.kind === 'session' ? n + c.body.text.length : n),
      0,
    )
    if (used + m.body.text.length > MENTION_SESSIONS_MAX_TOTAL)
      return { ok: false, reason: 'max_total' }
  }
  return { ok: true }
}

export const bodies = (items: readonly Mention[]): MentionBody[] =>
  items.map((m) => m.body)

export interface Trigger {
  /** Índice de la `@`. */
  start: number
  /** Lo escrito después de la `@` hasta el cursor. */
  query: string
}

const QUERY_MAX = 40

/** La `@` que el cursor está completando: al inicio o tras un espacio, sin espacios hasta el cursor. */
export function detectTrigger(text: string, caret: number): Trigger | null {
  const end = Math.min(Math.max(caret, 0), text.length)
  for (let i = end - 1; i >= 0 && end - i <= QUERY_MAX + 1; i--) {
    const ch = text[i]!
    if (/\s/.test(ch)) return null
    if (ch === '@') {
      if (i > 0 && !/\s/.test(text[i - 1]!)) return null
      return { start: i, query: text.slice(i + 1, end) }
    }
  }
  return null
}

/** Reemplaza la `@consulta` por `@etiqueta ` y devuelve el texto y la posición del cursor. */
export function applyMention(
  text: string,
  trigger: Trigger,
  caret: number,
  label: string,
): { text: string; caret: number } {
  const head = text.slice(0, trigger.start)
  const tail = text.slice(Math.min(Math.max(caret, 0), text.length))
  const insert = `@${label} `
  return {
    text: `${head}${insert}${tail.replace(/^ /, '')}`,
    caret: head.length + insert.length,
  }
}

const oneWord = (s: string): string => s.replace(/\s+/g, '_')

const clip = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`

export const sessionMention = (s: Session): Mention => ({
  key: `s:${s.id}`,
  kind: 'session',
  label: clip(oneWord(s.title), 28),
  hint: s.title,
  body: { kind: 'session', title: s.title, text: summarize(s) },
})

export const nativeMention = (
  slug: string,
  luaName: string,
  summary: string,
): Mention => ({
  key: `n:${slug}`,
  kind: 'native',
  label: luaName,
  hint: summary,
  body: { kind: 'native', slug },
})

export const issueMention = (number: number, title: string): Mention => ({
  key: `i:${number}`,
  kind: 'issue',
  label: `#${number}`,
  hint: title,
  body: { kind: 'issue', number },
})

/** Natives que coinciden con la consulta (mínimo dos letras, como el buscador de natives). */
export async function searchNativeMentions(
  query: string,
  limit = 5,
  signal?: AbortSignal,
): Promise<Mention[]> {
  if (query.trim().length < 2) return []
  const prepared = await loadPreparedNatives()
  if (signal?.aborted) return []
  return searchNatives(prepared, query, limit).map((h) =>
    nativeMention(h.row.slug, h.row.luaName, h.row.summary),
  )
}

interface IssuesResponse {
  project: { issues: { number: number; title: string; state: string }[] }
}

const ISSUES_QUERY = `query AskIssues($q: String!, $limit: Int) {
  project { issues(query: $q, limit: $limit) { number title state } }
}`

/**
 * Issues del repo (solo staff: el server decide; ante cualquier error la lista queda vacía y el
 * selector no muestra la sección).
 */
export async function searchIssueMentions(
  query: string,
  limit = 5,
  signal?: AbortSignal,
  fetcher?: typeof fetch,
): Promise<Mention[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const data = await gql<IssuesResponse>(
      ISSUES_QUERY,
      { q, limit },
      signal,
      fetcher,
    )
    return data.project.issues.map((i) => issueMention(i.number, i.title))
  } catch {
    return []
  }
}
