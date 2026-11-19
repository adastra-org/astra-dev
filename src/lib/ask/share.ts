// Compartir una charla (issue #34). Sin React: el armado del payload y las llamadas GraphQL se
// prueban con `bun test` y un `fetch` simulado. Contrato y modelo de amenazas: docs/server/README.md.
//
// Lo que sale del navegador es una lista de turnos con solo pregunta, respuesta, banderas, citas y
// el slug/ancla de cada fuente citada. Nunca memorias, razonamiento, pasos, uso ni tiempos: el
// server vuelve a validar y reconstruye título y enlace de cada fuente desde su índice.
import { API_BASE } from './client'
import { visibleSources } from './sources'
import type { Turn } from './store'
import { AskError, type AskSource } from './types'

export type ShareAudience = 'staff' | 'public'
export const SHARE_AUDIENCES: readonly ShareAudience[] = ['staff', 'public']

/** Espejo de los topes del server (`server/src/share/service.ts`): más largo se rechaza, no se corta. */
export const SHARE_MAX_QUESTION = 4000
export const SHARE_MAX_TEXT = 24000

/** Vencimientos que ofrece el diálogo, en horas (24 h, 7 días, 30 días). El server fija el tope. */
export const SHARE_TTL_CHOICES: readonly number[] = [24, 168, 720]

/** Lo que se pone en lugar de una memoria que aparece literal en un texto compartido. */
export const MEMORY_MASK = '[memoria]'
/** Memorias más cortas que esto no se enmascaran: "no" taparía media charla sin proteger nada. */
const MIN_MASK_CHARS = 4

export interface ShareConfig {
  enabled: boolean
  maxTurns: number
  defaultTtlHours: number
  maxTtlHours: number
  /** Solo staff crea enlaces públicos (por ahora). */
  publicAllowed: boolean
}

export const SHARE_OFF: ShareConfig = {
  enabled: false,
  maxTurns: 0,
  defaultTtlHours: 0,
  maxTtlHours: 0,
  publicAllowed: false,
}

export interface SharePayloadTurn {
  question: string
  text: string
  refused: boolean
  truncated: boolean
  cited: number[]
  sources: { n: number; slug: string; anchor: string | null }[]
}

export interface SharedSource {
  n: number
  kind: 'doc' | 'native'
  slug: string
  title: string
  heading: string | null
  anchor: string | null
  path: string
}

export interface SharedTurn {
  question: string
  text: string
  refused: boolean
  truncated: boolean
  cited: number[]
  sources: SharedSource[]
}

export interface SharedChat {
  audience: ShareAudience
  /** Handle de quien compartió; solo en enlaces de audiencia `staff`. */
  sharedBy: string | null
  createdAt: string
  expiresAt: string
  turns: SharedTurn[]
}

export interface ShareCreated {
  id: string
  token: string
  audience: ShareAudience
  expiresAt: string
}

export interface ShareSummary {
  id: string
  audience: ShareAudience
  createdAt: string
  expiresAt: string
  turns: number
  views: number
}

/** Turnos que se pueden compartir: terminados (o detenidos) y con respuesta. Nunca uno en curso o fallido. */
export function shareableTurns(turns: readonly Turn[]): Turn[] {
  return turns.filter(
    (t) => (t.status === 'done' || t.status === 'stopped') && t.text.trim(),
  )
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Reemplaza por `[memoria]` cada aparición literal (sin distinguir mayúsculas) de una memoria
 * activa. Cuenta cuántas veces actuó. Es una red de seguridad, no una garantía: una paráfrasis
 * de la memoria pasa igual, por eso el diálogo también muestra la vista previa exacta.
 */
export function scrubMemories(
  text: string,
  memories: readonly string[],
): { text: string; count: number } {
  let out = text
  let count = 0
  // Las más largas primero: una memoria que contiene a otra se tapa entera.
  const list = memories
    .map((m) => m.trim())
    .filter((m) => m.length >= MIN_MASK_CHARS)
    .sort((a, b) => b.length - a.length)
  for (const m of list) {
    out = out.replace(new RegExp(escapeRe(m), 'gi'), () => {
      count++
      return MEMORY_MASK
    })
  }
  return { text: out, count }
}

export interface BuiltShare {
  turns: SharePayloadTurn[]
  /** Cuántas veces se enmascaró una memoria en lo que se va a enviar. */
  scrubbed: number
  /** Algún turno incluido se generó con memorias activas (`memoryTokens > 0`). */
  withMemories: boolean
  /** Algún turno pasa el tope por campo del server: no se envía, se avisa. */
  tooLong: boolean
}

/** Allow-list: arma el cuerpo de `shareChat` con solo los campos permitidos de los turnos elegidos. */
export function buildSharePayload(
  turns: readonly Turn[],
  opts: { include: ReadonlySet<number>; memories: readonly string[] },
): BuiltShare {
  let scrubbed = 0
  let withMemories = false
  let tooLong = false
  const out: SharePayloadTurn[] = []
  for (const t of shareableTurns(turns)) {
    if (!opts.include.has(t.id)) continue
    const q = scrubMemories(t.question, opts.memories)
    const a = scrubMemories(t.text, opts.memories)
    scrubbed += q.count + a.count
    if (t.memoryTokens > 0) withMemories = true
    if (q.text.length > SHARE_MAX_QUESTION || a.text.length > SHARE_MAX_TEXT)
      tooLong = true
    const shown = visibleSources(t.sources, t.cited, t.refused)
    out.push({
      question: q.text,
      text: a.text,
      refused: t.refused,
      truncated: t.truncated,
      cited: t.cited.filter((n) => Number.isInteger(n) && n >= 1 && n <= 99),
      sources: shown.map((s) => ({
        n: s.n,
        slug: s.slug,
        anchor: s.anchor,
      })),
    })
  }
  return { turns: out, scrubbed, withMemories, tooLong }
}

/** Enlace que se entrega: el origen del sitio más la ruta de lectura. El token va en el path. */
export const shareUrl = (token: string, origin: string): string =>
  `${origin.replace(/\/+$/, '')}/ask/s/${token}`

/** Fuente compartida con la forma que consume `AnswerBody` (el extracto y el puntaje no viajan). */
export const toAskSource = (s: SharedSource): AskSource => ({
  ...s,
  excerpt: '',
  score: 0,
})

// ---------------------------------------------------------------------------------------------
// GraphQL

export interface ShareClientOptions {
  fetch?: typeof fetch
  base?: string
  signal?: AbortSignal
}

interface GqlBody {
  data?: Record<string, unknown> | null
  errors?: { message?: string; extensions?: Record<string, unknown> }[]
  error?: { code?: unknown; message?: unknown; retryAfter?: unknown }
}

/** Una operación GraphQL. Rechaza con `AskError` (código estable, estado HTTP y `retryAfter`). */
async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  opts: ShareClientOptions,
): Promise<T> {
  const doFetch = opts.fetch ?? fetch
  let res: Response
  try {
    res = await doFetch(`${opts.base ?? API_BASE}/graphql`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new AskError('network', 'Network error')
  }
  let body: GqlBody = {}
  try {
    body = (await res.json()) as GqlBody
  } catch {
    // Proxy caído o cuerpo ilegible: queda el estado HTTP.
  }
  // Fallos previos a GraphQL (origen, tamaño): `{ error: { code } }`.
  if (typeof body.error?.code === 'string')
    throw new AskError(
      body.error.code,
      String(body.error.message ?? res.status),
      res.status,
      typeof body.error.retryAfter === 'number'
        ? body.error.retryAfter
        : undefined,
    )
  const first = body.errors?.[0]
  if (first) {
    const code = first.extensions?.code
    const retryAfter = first.extensions?.retryAfter
    throw new AskError(
      typeof code === 'string' ? code : 'internal',
      first.message ?? 'Error',
      res.status,
      typeof retryAfter === 'number' ? retryAfter : undefined,
    )
  }
  if (!res.ok || !body.data)
    throw new AskError(
      res.status >= 500 ? 'server_unavailable' : 'internal',
      `HTTP ${res.status}`,
      res.status,
    )
  return body.data as T
}

/** Si el server no tiene la función, o no responde, el botón no se muestra. */
export async function fetchShareConfig(
  opts: ShareClientOptions = {},
): Promise<ShareConfig> {
  try {
    const d = await gql<{ shareConfig: ShareConfig }>(
      '{ shareConfig { enabled maxTurns defaultTtlHours maxTtlHours publicAllowed } }',
      {},
      opts,
    )
    return d.shareConfig
  } catch {
    return SHARE_OFF
  }
}

export async function createShare(
  input: {
    turns: SharePayloadTurn[]
    audience: ShareAudience
    ttlHours: number
  },
  opts: ShareClientOptions = {},
): Promise<ShareCreated> {
  const d = await gql<{ shareChat: ShareCreated }>(
    `mutation($turns:[ShareTurnInput!]!,$audience:String!,$ttl:Int){
      shareChat(turns:$turns,audience:$audience,ttlHours:$ttl){ id token audience expiresAt } }`,
    { turns: input.turns, audience: input.audience, ttl: input.ttlHours },
    opts,
  )
  return d.shareChat
}

export async function revokeShare(
  id: string,
  opts: ShareClientOptions = {},
): Promise<void> {
  await gql<{ revokeShare: boolean }>(
    'mutation($id:String!){ revokeShare(id:$id) }',
    { id },
    opts,
  )
}

export async function listMyShares(
  opts: ShareClientOptions = {},
): Promise<ShareSummary[]> {
  const d = await gql<{ myShares: ShareSummary[] }>(
    '{ myShares { id audience createdAt expiresAt turns views } }',
    {},
    opts,
  )
  return d.myShares
}

export async function readSharedChat(
  token: string,
  opts: ShareClientOptions = {},
): Promise<SharedChat> {
  const d = await gql<{ sharedChat: SharedChat }>(
    `query($token:String!){ sharedChat(token:$token){
      audience sharedBy createdAt expiresAt
      turns{ question text refused truncated cited
        sources{ n kind slug title heading anchor path } } } }`,
    { token },
    opts,
  )
  return d.sharedChat
}
