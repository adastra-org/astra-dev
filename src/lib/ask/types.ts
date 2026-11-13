// Contrato del chat (POST /chat, SSE). Espejo de `server/src/chat/service.ts`; documentado en
// docs/server/README.md. Sin React: todo `lib/ask` se prueba con `bun test`.

export type SourceKind = 'doc' | 'native'
export type SearchMode = 'semantic' | 'keyword'

export interface AskSource {
  /** Número con el que el modelo cita la fuente: `[n]`. */
  n: number
  kind: SourceKind
  slug: string
  title: string
  heading: string | null
  anchor: string | null
  /** Ruta del sitio (`/docs/<slug>#<ancla>`). La decide el server, nunca el modelo. */
  path: string
  excerpt: string
  score: number
}

/** Qué hizo el server antes de llamar al modelo: solo cuentas y tiempos. Espejo de `ChatStep`. */
export type AskStep =
  | { id: 'history'; ms: number; usedHistory: boolean }
  | {
      id: 'search'
      ms: number
      mode: SearchMode
      docs: number
      natives: number
    }
  | { id: 'gate'; ms: number; kept: number; total: number }
  | { id: 'cache'; ms: number }

export type AskEvent =
  | { type: 'meta'; requestId: string; mode: SearchMode; degraded: boolean }
  | { type: 'step'; step: AskStep }
  /** Razonamiento del modelo; el server solo lo manda a staff. */
  | { type: 'thinking'; text: string }
  | { type: 'sources'; sources: AskSource[] }
  | { type: 'delta'; text: string }
  | {
      type: 'done'
      cited: number[]
      refused: boolean
      truncated: boolean
      cached?: boolean
      usage: { inputTokens: number; outputTokens: number }
    }
  | { type: 'error'; code: string; message: string }

export interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

/** Error del chat, ya sea una respuesta JSON previa al stream o un evento `error`. */
export class AskError extends Error {
  readonly code: string
  readonly status: number
  /** Segundos hasta que tiene sentido reintentar (429). */
  readonly retryAfter?: number

  constructor(code: string, message: string, status = 0, retryAfter?: number) {
    super(message)
    this.name = 'AskError'
    this.code = code
    this.status = status
    if (retryAfter !== undefined) this.retryAfter = retryAfter
  }
}

/** Tope de la pregunta en el server (`CHAT_MAX_QUESTION_CHARS`, 800 por defecto). */
export const ASK_MAX_QUESTION = 800
