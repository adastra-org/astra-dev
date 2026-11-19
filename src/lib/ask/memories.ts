// Memorias del usuario para el chat: frases cortas ("respondé corto", "uso Windows") que viven
// SOLO en este navegador (localStorage) y viajan en el campo `memories` de `POST /chat`. El server
// no las guarda ni las cachea. Fuera de React: el store y las funciones puras se prueban con
// `bun test`, con un `Storage` simulado. Plan y límites: docs/chat/README.md (Fase 3).
import { estimateTokens } from './budget'

export const MEMORIES_KEY = 'astra.ask.memories.v1'
const VERSION = 1

/** Espejo de `server/src/chat/memories.ts`: el server rechaza (400) lo que pase de acá. */
export const MEMORIES_MAX_ITEMS = 12
export const MEMORY_MAX_CHARS = 280
export const MEMORIES_MAX_TOTAL = 2000

export interface Memory {
  id: string
  text: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export type MemoryFailure =
  | 'empty'
  | 'too_long'
  | 'duplicate'
  | 'max_items'
  | 'max_total'
  | 'not_found'

export type MemoryResult = { ok: true } | { ok: false; reason: MemoryFailure }

// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g

/** Una línea, sin caracteres de control ni espacios repetidos. */
export function normalizeText(raw: string): string {
  return raw.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** Lee lo guardado. Nunca lanza: forma inválida = lista vacía; los ítems malos se descartan. */
export function parseStored(raw: string | null): Memory[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!isRecord(data) || data.v !== VERSION || !Array.isArray(data.items))
    return []
  const out: Memory[] = []
  const seen = new Set<string>()
  for (const it of data.items) {
    if (!isRecord(it)) continue
    const { id, text, enabled, createdAt, updatedAt } = it
    if (typeof id !== 'string' || !id || seen.has(id)) continue
    if (typeof text !== 'string') continue
    const clean = normalizeText(text)
    if (!clean || clean.length > MEMORY_MAX_CHARS) continue
    if (out.length >= MEMORIES_MAX_ITEMS) break
    seen.add(id)
    out.push({
      id,
      text: clean,
      enabled: enabled !== false,
      createdAt: typeof createdAt === 'number' ? createdAt : 0,
      updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
    })
  }
  return out
}

export const serialize = (items: readonly Memory[]): string =>
  JSON.stringify({ v: VERSION, items })

/** Textos de las memorias activas, en orden: lo que viaja en el request. */
export const activeTexts = (items: readonly Memory[]): string[] =>
  items.filter((m) => m.enabled).map((m) => m.text)

/** Caracteres de las activas. Lo guardado puede pasar el tope total: se recorta al enviar. */
export const activeChars = (items: readonly Memory[]): number =>
  items.reduce((n, m) => (m.enabled ? n + m.text.length : n), 0)

/** Tokens estimados de unos textos (misma regla que el server: un token cada tres caracteres). */
export const textsTokens = (texts: readonly string[]): number => {
  const chars = texts.reduce((n, t) => n + t.length, 0)
  return chars === 0 ? 0 : estimateTokens(chars)
}

/** Tokens estimados de las memorias activas. */
export const memoryTokens = (items: readonly Memory[]): number =>
  textsTokens(activeTexts(items))

const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function newId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

type Storage2 = Pick<Storage, 'getItem' | 'setItem'>

export interface MemoriesState {
  items: Memory[]
  /** false = el navegador no deja guardar (modo privado, bloqueado, cuota): viven en memoria. */
  persisted: boolean
  /** Último borrado, para deshacer. */
  removed: { memory: Memory; index: number } | null
}

export interface MemoryStoreOptions {
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

/** Store externo (`useSyncExternalStore`): las memorias de este navegador. */
export class MemoryStore {
  #state: MemoriesState = { items: [], persisted: true, removed: null }
  readonly #listeners = new Set<() => void>()
  readonly #storage: () => Storage2 | null
  readonly #now: () => number
  #loaded = false

  constructor(opts: MemoryStoreOptions = {}) {
    this.#storage = opts.storage ?? defaultStorage
    this.#now = opts.now ?? Date.now
  }

  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb)
    return () => this.#listeners.delete(cb)
  }

  /** Carga perezosa: la primera lectura toca el storage. */
  getState = (): MemoriesState => {
    if (!this.#loaded) this.#read()
    return this.#state
  }

  #emit() {
    for (const cb of this.#listeners) cb()
  }

  #set(patch: Partial<MemoriesState>) {
    this.#state = { ...this.#state, ...patch }
    this.#emit()
  }

  #read() {
    this.#loaded = true
    let raw: string | null = null
    let readable = true
    try {
      const s = this.#storage()
      if (!s) readable = false
      else raw = s.getItem(MEMORIES_KEY)
    } catch {
      readable = false
    }
    // Sin storage se conserva lo que hay en memoria de la sesión; solo se avisa que no se guarda.
    this.#state = readable
      ? { items: parseStored(raw), persisted: true, removed: null }
      : { ...this.#state, persisted: false }
  }

  /** Vuelve a leer el storage (evento `storage` de otra pestaña). */
  reload(): void {
    this.#read()
    this.#emit()
  }

  #commit(items: Memory[], removed: MemoriesState['removed'] = null) {
    let persisted = true
    try {
      const s = this.#storage()
      if (!s) persisted = false
      else s.setItem(MEMORIES_KEY, serialize(items))
    } catch {
      persisted = false
    }
    this.#set({ items, persisted, removed })
  }

  /** `others` = el resto de las memorias; `enabled` = si la memoria cuenta para el tope total. */
  #check(
    text: string,
    others: readonly Memory[],
    enabled: boolean,
  ): MemoryFailure | null {
    if (!text) return 'empty'
    if (text.length > MEMORY_MAX_CHARS) return 'too_long'
    if (others.some((m) => sameText(m.text, text))) return 'duplicate'
    if (enabled && activeChars(others) + text.length > MEMORIES_MAX_TOTAL)
      return 'max_total'
    return null
  }

  add(raw: string): MemoryResult {
    const items = this.getState().items
    const text = normalizeText(raw)
    if (items.length >= MEMORIES_MAX_ITEMS)
      return { ok: false, reason: 'max_items' }
    const bad = this.#check(text, items, true)
    if (bad) return { ok: false, reason: bad }
    const at = this.#now()
    this.#commit([
      ...items,
      { id: newId(), text, enabled: true, createdAt: at, updatedAt: at },
    ])
    return { ok: true }
  }

  edit(id: string, raw: string): MemoryResult {
    const items = this.getState().items
    const cur = items.find((m) => m.id === id)
    if (!cur) return { ok: false, reason: 'not_found' }
    const text = normalizeText(raw)
    const bad = this.#check(
      text,
      items.filter((m) => m.id !== id),
      cur.enabled,
    )
    if (bad) return { ok: false, reason: bad }
    this.#commit(
      items.map((m) =>
        m.id === id ? { ...m, text, updatedAt: this.#now() } : m,
      ),
    )
    return { ok: true }
  }

  toggle(id: string): MemoryResult {
    const items = this.getState().items
    const cur = items.find((m) => m.id === id)
    if (!cur) return { ok: false, reason: 'not_found' }
    if (
      !cur.enabled &&
      activeChars(items) + cur.text.length > MEMORIES_MAX_TOTAL
    )
      return { ok: false, reason: 'max_total' }
    this.#commit(
      items.map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled, updatedAt: this.#now() } : m,
      ),
    )
    return { ok: true }
  }

  remove(id: string): MemoryResult {
    const items = this.getState().items
    const index = items.findIndex((m) => m.id === id)
    if (index < 0) return { ok: false, reason: 'not_found' }
    this.#commit(
      items.filter((m) => m.id !== id),
      { memory: items[index]!, index },
    )
    return { ok: true }
  }

  /** Devuelve la última memoria borrada a su lugar. */
  undoRemove(): MemoryResult {
    const { items, removed } = this.getState()
    if (!removed) return { ok: false, reason: 'not_found' }
    const { memory, index } = removed
    if (items.length >= MEMORIES_MAX_ITEMS)
      return { ok: false, reason: 'max_items' }
    if (items.some((m) => m.id === memory.id || sameText(m.text, memory.text)))
      return { ok: false, reason: 'duplicate' }
    if (
      memory.enabled &&
      activeChars(items) + memory.text.length > MEMORIES_MAX_TOTAL
    )
      return { ok: false, reason: 'max_total' }
    const next = [...items]
    next.splice(Math.min(index, next.length), 0, memory)
    this.#commit(next)
    return { ok: true }
  }

  /** Cierra el aviso de "Deshacer" sin tocar las memorias. */
  dismissRemoved(): void {
    if (this.#state.removed) this.#set({ removed: null })
  }

  /** Lo que se manda en el request: las activas, y nunca más de lo que el server acepta. */
  active(): string[] {
    const out: string[] = []
    let total = 0
    for (const text of activeTexts(this.getState().items)) {
      if (total + text.length > MEMORIES_MAX_TOTAL) break
      total += text.length
      out.push(text)
    }
    return out
  }
}

export const memoryStore = new MemoryStore()
