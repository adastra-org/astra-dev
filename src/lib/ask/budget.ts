// Presupuesto de contexto y velocidad de salida del chat. Puro: sin React ni DOM, se prueba con
// `bun test`. Los tokens que se muestran son los que informó el server en `done`; el borrador se
// estima con la misma regla que el server (`estimateTokens` en limits.ts).
import type { UiLang } from '@/lib/i18n'
import type { Turn } from './store'

/** Igual que `estimateTokens` del server: un token cada tres caracteres, redondeado hacia arriba. */
export const estimateTokens = (chars: number): number => Math.ceil(chars / 3)

/** A partir de qué fracción de la ventana el medidor avisa y a partir de cuándo no hay lugar. */
export const WARN_RATIO = 0.8
export const FULL_RATIO = 1

export type BudgetLevel = 'ok' | 'warn' | 'full'

export interface ContextUsage {
  /** Tokens del último envío más lo que ocuparía el borrador: el próximo envío. */
  next: number
  /** Tokens del último envío, sin borrador. */
  used: number
  /** Ventana del modelo. */
  limit: number
  /** `next / limit`, sin tope: puede pasar de 1. */
  ratio: number
  level: BudgetLevel
  /** Tokens que el borrador ocupa en la estimación. */
  draft: number
  /** Tokens estimados de las memorias activas ahora (ya incluidos en `next`). */
  memories: number
  /** El último uso lo estimó el server, no lo informó el proveedor. */
  estimated: boolean
}

/** Último uso real de la conversación: respuestas con modelo, sin caché ni rechazo. */
export function lastUsedTurn(turns: readonly Turn[]): Turn | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!
    if (!t.usage || t.cached) continue
    if (t.usage.inputTokens + t.usage.outputTokens > 0) return t
  }
  return null
}

/**
 * Cuánto de la ventana ocupa el próximo envío. Null cuando no hay ventana (el server no la
 * informó) o todavía no hay ningún envío medido: el medidor no se dibuja sin dato.
 */
export function contextUsage(
  turns: readonly Turn[],
  limit: number | null,
  draft: string,
  /** Tokens estimados de las memorias activas ahora; 0 si no hay. */
  memories = 0,
): ContextUsage | null {
  if (limit === null || limit <= 0) return null
  const t = lastUsedTurn(turns)
  if (!t?.usage) return null
  const used = t.usage.inputTokens + t.usage.outputTokens
  const draftTokens = draft ? estimateTokens(draft.length) : 0
  // Lo usado ya trae las memorias de aquel envío: se suma solo la diferencia con las de ahora.
  const next = Math.max(0, used + draftTokens + memories - t.memoryTokens)
  const ratio = next / limit
  return {
    next,
    used,
    limit,
    ratio,
    level: ratio >= FULL_RATIO ? 'full' : ratio >= WARN_RATIO ? 'warn' : 'ok',
    draft: draftTokens,
    memories,
    estimated: t.usageEstimated,
  }
}

/** Mínimo de stream para que la velocidad sea una medida y no un redondeo. */
export const MIN_STREAM_MS = 500
/** Con menos tokens que esto el cociente es ruido. */
export const MIN_SPEED_TOKENS = 8
/** Ningún modelo que corra acá genera más; por encima, el reloj o el conteo están mal. */
export const MAX_PLAUSIBLE_TPS = 1000

/** Milisegundos hasta el primer texto. Null si la respuesta vino de caché o no llegó texto. */
export function ttftMs(turn: Turn): number | null {
  if (turn.cached) return null
  const { startedAt, firstDeltaAt } = turn.timing
  if (startedAt === null || firstDeltaAt === null) return null
  return Math.max(0, Math.round(firstDeltaAt - startedAt))
}

/**
 * Tokens de salida por segundo. Si el modelo midió su propia velocidad (`done.tps`), esa es la
 * medida. Si no, se estima en el navegador de primer a último texto, y solo cuando eso puede ser
 * cierto: los tokens de salida incluyen el razonamiento, que el reloj del texto no ve, así que un
 * turno que razonó (o con una ventana corta, o con una velocidad imposible) no tiene medida.
 * Null = mostrar "—", nunca un número dudoso.
 */
export function outputSpeed(turn: Turn): number | null {
  if (turn.cached || !turn.usage) return null
  const fromModel = turn.serverTps
  if (fromModel !== null)
    return fromModel <= MAX_PLAUSIBLE_TPS
      ? Math.round(fromModel * 10) / 10
      : null
  if (turn.thinking) return null
  const { firstDeltaAt, doneAt } = turn.timing
  if (firstDeltaAt === null || doneAt === null) return null
  const streamMs = doneAt - firstDeltaAt
  const out = turn.usage.outputTokens
  if (streamMs < MIN_STREAM_MS || out < MIN_SPEED_TOKENS) return null
  const tps = Math.round((out / (streamMs / 1000)) * 10) / 10
  return tps > MAX_PLAUSIBLE_TPS ? null : tps
}

/** Último turno con medida de velocidad, para el rail. */
export function lastSpeed(
  turns: readonly Turn[],
): { tps: number; ttft: number | null } | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i]!
    const tps = outputSpeed(t)
    if (tps !== null) return { tps, ttft: ttftMs(t) }
  }
  return null
}

/** Totales de la conversación: preguntas y tokens de todos los envíos medidos. */
export function sessionTotals(turns: readonly Turn[]): {
  questions: number
  tokens: number
} {
  let tokens = 0
  for (const t of turns) {
    if (t.usage && !t.cached)
      tokens += t.usage.inputTokens + t.usage.outputTokens
  }
  return { questions: turns.length, tokens }
}

/** Cuenta con separador de miles del idioma de la interfaz. */
export function fmtCount(n: number, lang: UiLang): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-ES', {
    maximumFractionDigits: 1,
  }).format(n)
}
