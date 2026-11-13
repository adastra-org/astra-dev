// Cliente de `POST /chat`. nginx quita el prefijo `/api`: el navegador llama `/api/chat` y el
// server recibe `/chat`. En desarrollo, Vite hace el mismo trabajo con un proxy (vite.config.ts),
// así la cookie de sesión y el `Origin` son los del propio sitio.
import { readStoredLang, type UiLang } from '@/lib/i18n'
import { SseParser } from './sse'
import {
  AskError,
  type AskEvent,
  type HistoryTurn,
  type ToolStepWire,
} from './types'

/** Prefijo de la API. `VITE_API_BASE` solo para apuntar a otro origen. */
export const API_BASE: string =
  (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_API_BASE ?? '/api'

export interface StreamOptions {
  question: string
  history: HistoryTurn[]
  /** Memorias activas del usuario (solo texto). Se omite el campo si no hay. */
  memories?: string[]
  /** Slugs de las fuentes de la respuesta anterior: el server las usa si la pregunta sigue la charla. */
  sources?: string[]
  /** Herramientas que este cliente sabe ejecutar. Sin ellas el chat no tiene herramientas. */
  tools?: readonly string[]
  /** Rondas de herramientas ya hechas en esta respuesta (la continuación de un `tool_call`). */
  steps?: ToolStepWire[]
  /** Veces que el owner confirmó "Seguir". */
  continued?: number
  /** Idioma de la interfaz; por defecto el guardado. */
  lang?: UiLang
  signal?: AbortSignal
  onEvent: (e: AskEvent) => void
  fetch?: typeof fetch
  base?: string
}

/** Respuesta JSON de error previa al stream: `{"error":{"code","message","retryAfter?"}}`. */
async function readJsonError(res: Response): Promise<AskError> {
  let code = 'internal'
  let message = `HTTP ${res.status}`
  let retryAfter: number | undefined
  try {
    const body = (await res.json()) as {
      error?: { code?: unknown; message?: unknown; retryAfter?: unknown }
    }
    if (typeof body.error?.code === 'string') code = body.error.code
    if (typeof body.error?.message === 'string') message = body.error.message
    if (typeof body.error?.retryAfter === 'number')
      retryAfter = body.error.retryAfter
  } catch {
    // Cuerpo ilegible (proxy, 502 de nginx): se queda con el estado HTTP.
    if (res.status === 502 || res.status === 503 || res.status === 504)
      code = 'server_unavailable'
  }
  const header = Number(res.headers.get('retry-after'))
  if (retryAfter === undefined && Number.isFinite(header) && header > 0)
    retryAfter = header
  return new AskError(code, message, res.status, retryAfter)
}

/**
 * Hace la pregunta y entrega cada evento SSE a `onEvent`. Resuelve cuando el stream termina con
 * `done` o `error`; rechaza con `AskError` ante un fallo previo al stream, de red o un corte.
 * Si `signal` se aborta, resuelve en silencio (quien aborta ya sabe que paró).
 */
export async function streamChat(opts: StreamOptions): Promise<void> {
  const doFetch = opts.fetch ?? fetch
  let res: Response
  try {
    res = await doFetch(`${opts.base ?? API_BASE}/chat`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify({
        question: opts.question,
        history: opts.history,
        ...(opts.memories?.length ? { memories: opts.memories } : {}),
        ...(opts.sources?.length ? { sources: opts.sources } : {}),
        ...(opts.tools?.length ? { tools: opts.tools } : {}),
        ...(opts.steps?.length ? { steps: opts.steps } : {}),
        ...(opts.continued ? { continued: opts.continued } : {}),
        lang: opts.lang ?? readStoredLang(),
      }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
  } catch (e) {
    if (opts.signal?.aborted) return
    throw new AskError('network', (e as Error).message || 'network error')
  }

  if (!res.ok) throw await readJsonError(res)
  if (!res.body) throw new AskError('stream_interrupted', 'No stream body')

  const parser = new SseParser()
  const decoder = new TextDecoder()
  const reader = res.body.getReader()
  let finished = false
  // Cancelar el lector corta la lectura aunque el `fetch` en uso no propague el aborto al cuerpo.
  const onAbort = () => void reader.cancel().catch(() => {})
  opts.signal?.addEventListener('abort', onAbort)
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
        if (ev.type === 'done' || ev.type === 'error') finished = true
        opts.onEvent(ev)
      }
    }
    for (const ev of parser.push(decoder.decode() + '\n\n')) {
      if (ev.type === 'done' || ev.type === 'error') finished = true
      opts.onEvent(ev)
    }
  } catch (e) {
    if (opts.signal?.aborted) return
    throw new AskError('stream_interrupted', (e as Error).message || 'stream')
  } finally {
    opts.signal?.removeEventListener('abort', onAbort)
  }
  if (!finished && !opts.signal?.aborted)
    throw new AskError('stream_interrupted', 'The stream ended early')
}
