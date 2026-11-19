// Sesiones de /ask guardadas en este navegador (localStorage): cada conversación terminada queda
// como una lista corta de pares pregunta/respuesta para poder mencionarla con `@` en otra. Nunca
// salen del navegador salvo como resumen acotado dentro de `mentions` (ver `mentions.ts`).
// Mismo patrón que `MemoryStore`: JSON versionado, `parseStored` no lanza, storage inyectable.
import { normalizeText } from './memories'

export const SESSIONS_KEY = 'astra.ask.sessions.v1'
const VERSION = 1

/** Espejo de `server/src/chat/mentions.ts` (un resumen de sesión y su título). */
export const SUMMARY_MAX_CHARS = 2000
export const TITLE_MAX_CHARS = 120

export const SESSIONS_MAX = 20
export const SESSION_MAX_TURNS = 12
const QUESTION_MAX = 400
const ANSWER_MAX = 600

export interface SessionTurn {
  question: string
  answer: string
}

export interface Session {
  id: string
  /** La primera pregunta, en una línea. */
  title: string
  updatedAt: number
  turns: SessionTurn[]
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const clip = (s: string, max: number) =>
  s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`

/** Lee lo guardado. Nunca lanza: forma inválida = lista vacía; lo malo se descarta. */
export function parseStored(raw: string | null): Session[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!isRecord(data) || data.v !== VERSION || !Array.isArray(data.items))
    return []
  const out: Session[] = []
  const seen = new Set<string>()
  for (const it of data.items) {
    if (!isRecord(it)) continue
    const { id, title, updatedAt, turns } = it
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    if (typeof title !== 'string' || !Array.isArray(turns)) continue
    const cleanTitle = clip(normalizeText(title), TITLE_MAX_CHARS)
    const cleanTurns: SessionTurn[] = []
    for (const t of turns) {
      if (!isRecord(t)) continue
      if (typeof t.question !== 'string' || typeof t.answer !== 'string')
        continue
      const question = clip(normalizeText(t.question), QUESTION_MAX)
      const answer = clip(normalizeText(t.answer), ANSWER_MAX)
      if (question && answer) cleanTurns.push({ question, answer })
      if (cleanTurns.length >= SESSION_MAX_TURNS) break
    }
    if (!cleanTitle || !cleanTurns.length) continue
    if (out.length >= SESSIONS_MAX) break
    seen.add(id)
    out.push({
      id,
      title: cleanTitle,
      updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
      turns: cleanTurns,
    })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export const serialize = (items: readonly Session[]): string =>
  JSON.stringify({ v: VERSION, items })

/**
 * Resumen de una sesión para `mentions`: los últimos intercambios que entran en `max` caracteres,
 * en orden cronológico. Es dato del usuario, nunca instrucciones.
 */
export function summarize(
  session: Pick<Session, 'turns'>,
  max = SUMMARY_MAX_CHARS,
): string {
  const lines: string[] = []
  let used = 0
  for (const t of [...session.turns].reverse()) {
    const block = `P: ${clip(t.question, QUESTION_MAX)}\nR: ${clip(t.answer, ANSWER_MAX)}`
    const cost = block.length + (lines.length ? 1 : 0)
    if (used + cost > max) {
      // Si ni siquiera entra el último intercambio, se manda recortado en vez de nada.
      if (!lines.length) lines.unshift(clip(block, max))
      break
    }
    lines.unshift(block)
    used += cost
  }
  return lines.join('\n')
}

/** Sesiones cuyo título o contenido tiene todas las palabras; sin consulta, las más recientes. */
export function searchSessions(
  items: readonly Session[],
  query: string,
  opts: { exclude?: string; limit?: number } = {},
): Session[] {
  const words = normalizeText(query).toLowerCase().split(' ').filter(Boolean)
  return items
    .filter((s) => s.id !== opts.exclude)
    .filter((s) => {
      if (!words.length) return true
      const hay = `${s.title} ${s.turns.map((t) => `${t.question} ${t.answer}`).join(' ')}`
      const low = hay.toLowerCase()
      return words.every((w) => low.includes(w))
    })
    .slice(0, opts.limit ?? 5)
}

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export const newSessionId = newId

type Storage2 = Pick<Storage, 'getItem' | 'setItem'>

export interface SessionsState {
  items: Session[]
  /** false = el navegador no deja guardar: viven en memoria. */
  persisted: boolean
}

export interface SessionStoreOptions {
  /** Por defecto `localStorage` si existe; acceder a él puede lanzar. */
  storage?: () => Storage2 | null
  now?: () => number
}

function defaultStorage(): Storage2 | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Store externo (`useSyncExternalStore`): las conversaciones de este navegador. */
export class SessionStore {
  #state: SessionsState = { items: [], persisted: true }
  readonly #listeners = new Set<() => void>()
  readonly #storage: () => Storage2 | null
  readonly #now: () => number
  #loaded = false

  constructor(opts: SessionStoreOptions = {}) {
    this.#storage = opts.storage ?? defaultStorage
    this.#now = opts.now ?? Date.now
  }

  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb)
    return () => this.#listeners.delete(cb)
  }

  /** Carga perezosa: la primera lectura toca el storage. */
  getState = (): SessionsState => {
    if (!this.#loaded) this.#read()
    return this.#state
  }

  #emit() {
    for (const cb of this.#listeners) cb()
  }

  #read() {
    this.#loaded = true
    let raw: string | null = null
    let readable = true
    try {
      const s = this.#storage()
      if (!s) readable = false
      else raw = s.getItem(SESSIONS_KEY)
    } catch {
      readable = false
    }
    this.#state = readable
      ? { items: parseStored(raw), persisted: true }
      : { ...this.#state, persisted: false }
  }

  /** Vuelve a leer el storage (evento `storage` de otra pestaña). */
  reload(): void {
    this.#read()
    this.#emit()
  }

  #commit(items: Session[]) {
    let persisted = true
    try {
      const s = this.#storage()
      if (!s) persisted = false
      else s.setItem(SESSIONS_KEY, serialize(items))
    } catch {
      persisted = false
    }
    this.#state = { items, persisted }
    this.#emit()
  }

  /**
   * Guarda (o reemplaza) la sesión `id` con los pares terminados de la conversación. Sin pares
   * completos la sesión no se guarda (o se borra si ya estaba).
   */
  save(id: string, turns: readonly SessionTurn[]): void {
    const items = this.getState().items
    const clean: SessionTurn[] = []
    for (const t of turns) {
      const question = clip(normalizeText(t.question), QUESTION_MAX)
      const answer = clip(normalizeText(t.answer), ANSWER_MAX)
      if (question && answer) clean.push({ question, answer })
    }
    const kept = clean.slice(-SESSION_MAX_TURNS)
    const rest = items.filter((s) => s.id !== id)
    if (!kept.length) {
      if (rest.length !== items.length) this.#commit(rest)
      return
    }
    const title = clip(normalizeText(clean[0]!.question), TITLE_MAX_CHARS)
    this.#commit(
      [{ id, title, updatedAt: this.#now(), turns: kept }, ...rest].slice(
        0,
        SESSIONS_MAX,
      ),
    )
  }

  remove(id: string): void {
    const items = this.getState().items
    const rest = items.filter((s) => s.id !== id)
    if (rest.length !== items.length) this.#commit(rest)
  }
}

export const sessionStore = new SessionStore()
