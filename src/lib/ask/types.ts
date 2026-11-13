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
  | {
      type: 'meta'
      requestId: string
      mode: SearchMode
      degraded: boolean
      /** Tokens the model holds (prompt + answer). Absent on a server that does not say. */
      contextWindow?: number
    }
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
      /** The provider did not report usage; the server counted it from the text. */
      usageEstimated?: boolean
      /** The stream ended waiting for the client: a tool result or the owner's confirmation. */
      stop?: 'tool_call' | 'confirm'
      /** Tokens por segundo que midió el propio modelo local (con su razonamiento). Ausente si no los informa. */
      tps?: number
    }
  /** The model asked for a tool; the browser runs it and continues with `steps`. */
  | { type: 'tool_call'; round: number; name: string; body: string }
  /** Owner only: the round cap was reached; "Seguir" sends `continued`. */
  | { type: 'confirm'; reason: 'max_rounds'; rounds: number }
  | { type: 'error'; code: string; message: string }

/** One tool round sent back to the server: what the model wrote, what it called and what came out. */
export interface ToolStepWire {
  text: string
  tool: string
  body: string
  result: import('./tool-result').ToolResult
}

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
