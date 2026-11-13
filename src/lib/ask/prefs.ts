// Preferencias de Ether para el chat (las que define el onboarding): tono, largo de respuesta,
// color de acento y nombre. Viven SOLO en este navegador (localStorage). Al server viajan
// únicamente `tone` y `length`, como enums en el campo `style` de `POST /chat`; el nombre y el
// color no salen de acá. Mismo patrón que `memories.ts`: store externo, storage inyectable y todo
// acceso a `localStorage` en try/catch. Plan: docs/chat/README.md (Onboarding).

export const PREFS_KEY = 'astra.ask.prefs.v1'
const VERSION = 1

/** Espejo de `server/src/chat/style.ts`: el server rechaza (400) cualquier otro valor. */
export const TONES = ['neutral', 'formal', 'cercano'] as const
export const LENGTHS = ['brief', 'balanced', 'detailed'] as const
/** Solo cliente: el color de acento de la zona de chat (presets en `styles/ask.css`). */
export const ACCENTS = ['violet', 'orchid', 'pink', 'mono'] as const
export const NAME_MAX = 40

export type Tone = (typeof TONES)[number]
export type Length = (typeof LENGTHS)[number]
export type Accent = (typeof ACCENTS)[number]

export interface AskPrefs {
  tone: Tone
  length: Length
  accent: Accent
  /** Opcional. Texto libre: solo se muestra en la interfaz, nunca se envía. */
  name: string
  /** El onboarding ya se completó o se saltó: no vuelve a abrirse solo. */
  done: boolean
}

export const DEFAULT_PREFS: AskPrefs = {
  tone: 'neutral',
  length: 'balanced',
  accent: 'violet',
  name: '',
  done: false,
}

/** Lo que viaja en `POST /chat`: solo lo que difiere del valor por defecto. */
export interface StyleBody {
  tone?: Tone
  length?: Length
}

// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g

/** Una línea, sin caracteres de control ni espacios repetidos, con tope. */
export function normalizeName(raw: string): string {
  return raw
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

const oneOf = <T extends string>(
  list: readonly T[],
  v: unknown,
  fallback: T,
): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v)
    ? (v as T)
    : fallback

/** Lee lo guardado. Nunca lanza: forma inválida = valores por defecto; cada campo malo, el suyo. */
export function parseStored(raw: string | null): AskPrefs {
  if (!raw) return DEFAULT_PREFS
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return DEFAULT_PREFS
  }
  if (!isRecord(data) || data.v !== VERSION || !isRecord(data.prefs))
    return DEFAULT_PREFS
  const p = data.prefs
  return {
    tone: oneOf(TONES, p.tone, DEFAULT_PREFS.tone),
    length: oneOf(LENGTHS, p.length, DEFAULT_PREFS.length),
    accent: oneOf(ACCENTS, p.accent, DEFAULT_PREFS.accent),
    name: typeof p.name === 'string' ? normalizeName(p.name) : '',
    done: p.done === true,
  }
}

export const serialize = (prefs: AskPrefs): string =>
  JSON.stringify({ v: VERSION, prefs })

/** `style` del request: `undefined` si todo es por defecto (el campo se omite). */
export function toStyle(prefs: AskPrefs): StyleBody | undefined {
  const out: StyleBody = {}
  if (prefs.tone !== DEFAULT_PREFS.tone) out.tone = prefs.tone
  if (prefs.length !== DEFAULT_PREFS.length) out.length = prefs.length
  return Object.keys(out).length ? out : undefined
}

type Storage2 = Pick<Storage, 'getItem' | 'setItem'>

export interface PrefsState {
  prefs: AskPrefs
  /** false = el navegador no deja guardar (modo privado, bloqueado, cuota): viven en memoria. */
  persisted: boolean
}

export interface PrefsStoreOptions {
  /** Por defecto `localStorage` si existe; acceder a él puede lanzar. */
  storage?: () => Storage2 | null
}

function defaultStorage(): Storage2 | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Store externo (`useSyncExternalStore`): las preferencias de este navegador. */
export class PrefsStore {
  #state: PrefsState = { prefs: DEFAULT_PREFS, persisted: true }
  readonly #listeners = new Set<() => void>()
  readonly #storage: () => Storage2 | null
  #loaded = false

  constructor(opts: PrefsStoreOptions = {}) {
    this.#storage = opts.storage ?? defaultStorage
  }

  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb)
    return () => this.#listeners.delete(cb)
  }

  /** Carga perezosa: la primera lectura toca el storage. */
  getState = (): PrefsState => {
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
      else raw = s.getItem(PREFS_KEY)
    } catch {
      readable = false
    }
    // Sin storage se conserva lo que hay en memoria de la sesión; solo se avisa que no se guarda.
    this.#state = readable
      ? { prefs: parseStored(raw), persisted: true }
      : { ...this.#state, persisted: false }
  }

  /** Vuelve a leer el storage (evento `storage` de otra pestaña). */
  reload(): void {
    this.#read()
    this.#emit()
  }

  /** Aplica un cambio parcial (validado campo a campo) y lo guarda. */
  update(patch: Partial<AskPrefs>): void {
    const cur = this.getState().prefs
    const next: AskPrefs = {
      tone: oneOf(TONES, patch.tone ?? cur.tone, cur.tone),
      length: oneOf(LENGTHS, patch.length ?? cur.length, cur.length),
      accent: oneOf(ACCENTS, patch.accent ?? cur.accent, cur.accent),
      name: patch.name === undefined ? cur.name : normalizeName(patch.name),
      done: patch.done ?? cur.done,
    }
    let persisted = true
    try {
      const s = this.#storage()
      if (!s) persisted = false
      else s.setItem(PREFS_KEY, serialize(next))
    } catch {
      persisted = false
    }
    this.#state = { prefs: next, persisted }
    this.#emit()
  }

  /** Marca el onboarding como visto sin tocar el resto (saltar, cerrar con Esc). */
  markDone(): void {
    this.update({ done: true })
  }

  /** `style` del request con las preferencias actuales. */
  style(): StyleBody | undefined {
    return toStyle(this.getState().prefs)
  }
}

export const prefsStore = new PrefsStore()
