// Estado del chat Ask Ether fuera de React: la conversación sobrevive a cerrar el panel y el
// palette puede abrirlo sin pasar por un contexto. Se lee con `useSyncExternalStore`
// (`useAsk`, en components/ask). El reductor y el store no importan React ni tocan el DOM, así
// se prueban con `bun test` y un `fetch` simulado.
import { setPaletteAccess } from '@/lib/palette/registry'
import type { Permission } from '@/lib/palette/types'
import { API_BASE, streamChat } from './client'
import { memoryStore, textsTokens } from './memories'
import { prefsStore, type StyleBody } from './prefs'
import {
  AskError,
  type AskEvent,
  type AskSource,
  type AskStep,
  type HistoryTurn,
  type SearchMode,
} from './types'

export type TurnStatus = 'waiting' | 'streaming' | 'done' | 'stopped' | 'error'

export interface Turn {
  id: number
  question: string
  /** Respuesta acumulada (Markdown). */
  text: string
  sources: AskSource[]
  cited: number[]
  status: TurnStatus
  refused: boolean
  truncated: boolean
  /** Vino de la caché del server: sin llamada al modelo. */
  cached: boolean
  mode: SearchMode | null
  degraded: boolean
  /** Lo que hizo el server antes del modelo, en orden. */
  steps: AskStep[]
  /** Razonamiento del modelo (solo staff). No entra al historial ni a la respuesta. */
  thinking: string
  error: { code: string; retryAfter?: number } | null
  /** Milisegundos del reloj del store: al enviar, en el primer texto y al terminar. */
  timing: {
    startedAt: number | null
    firstDeltaAt: number | null
    doneAt: number | null
  }
  /** Uso de tokens que informó el `done`. Null hasta que llega. */
  usage: { inputTokens: number; outputTokens: number } | null
  usageEstimated: boolean
  /** Velocidad que midió el modelo (`done.tps`). Null si el proveedor no la informó. */
  serverTps: number | null
  /** Tokens estimados de las memorias que viajaron con este envío (0 si ninguna). */
  memoryTokens: number
}

export type ViewerRole = Permission | 'unknown'

export interface AskState {
  open: boolean
  /** Texto sin enviar del campo; sobrevive a cerrar el panel. */
  draft: string
  turns: Turn[]
  viewerRole: ViewerRole
  /** Ventana de contexto del modelo, desde `meta`. Null hasta la primera respuesta. */
  contextWindow: number | null
}

export const emptyTurn = (id: number, question: string): Turn => ({
  id,
  question,
  text: '',
  sources: [],
  cited: [],
  status: 'waiting',
  refused: false,
  truncated: false,
  cached: false,
  mode: null,
  degraded: false,
  steps: [],
  thinking: '',
  error: null,
  timing: { startedAt: null, firstDeltaAt: null, doneAt: null },
  usage: null,
  usageEstimated: false,
  serverTps: null,
  memoryTokens: 0,
})

/**
 * Aplica un evento SSE a un turno. Puro: `at` es el instante del evento según el reloj del store
 * (sin él no se registran tiempos).
 */
export function applyEvent(turn: Turn, ev: AskEvent, at?: number): Turn {
  switch (ev.type) {
    case 'meta':
      return { ...turn, mode: ev.mode, degraded: ev.degraded }
    case 'step':
      return { ...turn, steps: [...turn.steps, ev.step] }
    case 'thinking':
      return { ...turn, thinking: turn.thinking + ev.text }
    case 'sources':
      return { ...turn, sources: ev.sources }
    case 'delta': {
      const first = turn.timing.firstDeltaAt === null && at !== undefined
      return {
        ...turn,
        text: turn.text + ev.text,
        status: turn.status === 'waiting' ? 'streaming' : turn.status,
        ...(first ? { timing: { ...turn.timing, firstDeltaAt: at } } : {}),
      }
    }
    case 'done':
      return {
        ...turn,
        status: 'done',
        cited: ev.cited,
        refused: ev.refused,
        truncated: ev.truncated,
        cached: ev.cached === true,
        usage: ev.usage,
        usageEstimated: ev.usageEstimated === true,
        serverTps:
          typeof ev.tps === 'number' && Number.isFinite(ev.tps) && ev.tps > 0
            ? ev.tps
            : null,
        ...(at === undefined ? {} : { timing: { ...turn.timing, doneAt: at } }),
      }
    case 'error':
      return { ...turn, status: 'error', error: { code: ev.code } }
  }
}

const MAX_HISTORY_EXCHANGES = 3
const MAX_HISTORY_CHARS = 800

/** Contexto para la siguiente pregunta: los últimos intercambios que terminaron bien. */
export function historyFor(turns: readonly Turn[]): HistoryTurn[] {
  const ok = turns.filter(
    (t) =>
      (t.status === 'done' || t.status === 'stopped') && t.text && !t.refused,
  )
  return ok.slice(-MAX_HISTORY_EXCHANGES).flatMap((t) => [
    { role: 'user' as const, content: t.question.slice(0, MAX_HISTORY_CHARS) },
    {
      role: 'assistant' as const,
      content: t.text.slice(0, MAX_HISTORY_CHARS),
    },
  ])
}

const MAX_CARRIED_SOURCES = 8

/** Slugs que usó la última respuesta buena: el server los vuelve a usar en un follow-up ("explicame eso"). */
export function sourcesFor(turns: readonly Turn[]): string[] {
  const last = turns.findLast(
    (t) =>
      (t.status === 'done' || t.status === 'stopped') && t.text && !t.refused,
  )
  if (!last) return []
  return [...new Set(last.sources.map((s) => s.slug))].slice(
    0,
    MAX_CARRIED_SOURCES,
  )
}

const isPermission = (v: unknown): v is Permission =>
  v === 'public' || v === 'subscriber' || v === 'staff' || v === 'owner'

export interface AskStoreOptions {
  fetch?: typeof fetch
  base?: string
  /** Reloj en milisegundos para medir tiempos. Por defecto `performance.now`. */
  now?: () => number
  /** Memorias activas a enviar. Por defecto las del navegador (`memoryStore`). */
  memories?: () => string[]
  /** Tono y largo a enviar. Por defecto los del navegador (`prefsStore`). */
  style?: () => StyleBody | undefined
}

export class AskStore {
  #state: AskState = {
    open: false,
    draft: '',
    turns: [],
    viewerRole: 'unknown',
    contextWindow: null,
  }
  #listeners = new Set<() => void>()
  #nextId = 1
  #abort: AbortController | null = null
  readonly #opts: AskStoreOptions
  readonly #now: () => number

  constructor(opts: AskStoreOptions = {}) {
    this.#opts = opts
    this.#now = opts.now ?? (() => performance.now())
  }

  getState = (): AskState => this.#state

  subscribe = (cb: () => void): (() => void) => {
    this.#listeners.add(cb)
    return () => this.#listeners.delete(cb)
  }

  #set(patch: Partial<AskState>) {
    this.#state = { ...this.#state, ...patch }
    for (const l of this.#listeners) l()
  }

  #update(id: number, fn: (t: Turn) => Turn) {
    this.#set({
      turns: this.#state.turns.map((t) => (t.id === id ? fn(t) : t)),
    })
  }

  get busy(): boolean {
    return this.#state.turns.some(
      (t) => t.status === 'waiting' || t.status === 'streaming',
    )
  }

  /** Abre el panel. Con `seed` pregunta de inmediato; si no, deja el texto en el campo. */
  open(seed?: string): void {
    this.#set({ open: true })
    const q = seed?.trim()
    if (q) void this.ask(q)
  }

  close(): void {
    if (this.#state.open) this.#set({ open: false })
  }

  setDraft(draft: string): void {
    this.#set({ draft })
  }

  /** Quién es el visitante, para saber si Ask Ether le corresponde antes de que pregunte. */
  async loadViewer(): Promise<void> {
    const f = this.#opts.fetch ?? fetch
    try {
      const res = await f(`${this.#opts.base ?? API_BASE}/graphql`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ viewer { role } }' }),
      })
      if (!res.ok) return
      const body = (await res.json()) as {
        data?: { viewer?: { role?: unknown } }
      }
      const role = body.data?.viewer?.role
      if (isPermission(role)) {
        this.#set({ viewerRole: role })
        // El palette muestra "Preguntar a Ether" solo a quien lo puede usar.
        setPaletteAccess(role)
      }
    } catch {
      // Servidor caído: queda `unknown` y el chat muestra el error real al preguntar.
    }
  }

  /** Envía la pregunta (o el borrador). Ignora la llamada si ya hay una respuesta en curso. */
  async ask(question?: string): Promise<void> {
    const q = (question ?? this.#state.draft).trim()
    if (!q || this.busy) return
    const history = historyFor(this.#state.turns)
    const sources = sourcesFor(this.#state.turns)
    const memories = (this.#opts.memories ?? (() => memoryStore.active()))()
    const style = (this.#opts.style ?? (() => prefsStore.style()))()
    const id = this.#nextId++
    const usedDraft = question === undefined
    const startedAt = this.#now()
    this.#set({
      turns: [
        ...this.#state.turns,
        {
          ...emptyTurn(id, q),
          memoryTokens: textsTokens(memories),
          timing: { startedAt, firstDeltaAt: null, doneAt: null },
        },
      ],
      ...(usedDraft ? { draft: '' } : {}),
    })

    const ctl = new AbortController()
    this.#abort = ctl
    try {
      await streamChat({
        question: q,
        history,
        memories,
        ...(style ? { style } : {}),
        sources,
        signal: ctl.signal,
        onEvent: (ev) => {
          if (ev.type === 'meta' && typeof ev.contextWindow === 'number')
            this.#set({ contextWindow: ev.contextWindow })
          const at = this.#now()
          this.#update(id, (t) => applyEvent(t, ev, at))
        },
        ...(this.#opts.fetch ? { fetch: this.#opts.fetch } : {}),
        ...(this.#opts.base ? { base: this.#opts.base } : {}),
      })
    } catch (e) {
      const err =
        e instanceof AskError ? e : new AskError('internal', String(e))
      this.#update(id, (t) => ({
        ...t,
        status: 'error',
        error: {
          code: err.code,
          ...(err.retryAfter === undefined
            ? {}
            : { retryAfter: err.retryAfter }),
        },
      }))
      // Un 401/403 confirma el rol aunque la consulta del viewer no haya llegado.
      if (
        err.code === 'unauthenticated' ||
        err.code === 'subscription_required'
      )
        this.#set({ viewerRole: 'public' })
    } finally {
      if (this.#abort === ctl) this.#abort = null
    }
  }

  /** Corta la respuesta en curso y conserva lo recibido. */
  stop(): void {
    this.#abort?.abort()
    this.#abort = null
    this.#set({
      turns: this.#state.turns.map((t) =>
        t.status === 'waiting' || t.status === 'streaming'
          ? { ...t, status: 'stopped' as const }
          : t,
      ),
    })
  }

  /** Reintenta la pregunta de un turno fallido: lo reemplaza por una respuesta nueva. */
  retry(id: number): void {
    const turn = this.#state.turns.find((t) => t.id === id)
    if (!turn || turn.status !== 'error' || this.busy) return
    this.#set({ turns: this.#state.turns.filter((t) => t.id !== id) })
    void this.ask(turn.question)
  }

  /**
   * Quita el turno `id` y los que vienen después. Si hay una respuesta en curso, la corta antes.
   * No envía nada: lo que quede en la conversación es el historial de la próxima pregunta.
   */
  rewind(id: number): void {
    const idx = this.#state.turns.findIndex((t) => t.id === id)
    if (idx < 0) return
    this.stop()
    this.#set({ turns: this.#state.turns.slice(0, idx) })
  }

  /** Edita una pregunta: la conversación vuelve a ese punto y la versión nueva se envía. */
  edit(id: number, question: string): void {
    const q = question.trim()
    if (!q || !this.#state.turns.some((t) => t.id === id)) return
    this.rewind(id)
    void this.ask(q)
  }

  /** Vuelve a preguntar lo mismo desde ese punto: una respuesta nueva reemplaza a la anterior. */
  resend(id: number): void {
    const turn = this.#state.turns.find((t) => t.id === id)
    if (!turn) return
    this.rewind(id)
    void this.ask(turn.question)
  }

  /** Nueva conversación. */
  reset(): void {
    this.#abort?.abort()
    this.#abort = null
    this.#set({ turns: [] })
  }
}

/** Instancia única de la app. */
export const askStore = new AskStore()
