// Mensajes entre la página y los workers. La página trata TODO lo que llega de un worker como
// datos no confiables: `parseWorkerMessage` valida forma y tamaño antes de usarlos.
import { LIMITS, type LimitReason } from './limits.ts'
import type { RunOutcome } from './runner.ts'

export type ToWorker = {
  type: 'run'
  code: string
  wasm: Uint8Array<ArrayBuffer>
}

export type ToClient =
  | { type: 'started' }
  | { type: 'out'; line: string }
  | { type: 'done'; outcome: RunOutcome; ms: number }

const REASONS: readonly LimitReason[] = [
  'time',
  'instructions',
  'memory',
  'output',
]

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/** Devuelve el mensaje si es válido; `null` si no (se ignora). Recorta textos largos. */
export function parseWorkerMessage(data: unknown): ToClient | null {
  if (!isRecord(data)) return null
  if (data.type === 'started') return { type: 'started' }
  if (data.type === 'out') {
    if (typeof data.line !== 'string') return null
    return { type: 'out', line: data.line.slice(0, LIMITS.maxLineChars) }
  }
  if (data.type === 'done') {
    const o = data.outcome
    const ms =
      typeof data.ms === 'number' && Number.isFinite(data.ms) ? data.ms : 0
    if (!isRecord(o)) return null
    if (o.status === 'ok')
      return { type: 'done', outcome: { status: 'ok' }, ms }
    if (o.status === 'limit' && REASONS.includes(o.reason as LimitReason))
      return {
        type: 'done',
        outcome: { status: 'limit', reason: o.reason as LimitReason },
        ms,
      }
    if (o.status === 'error' && typeof o.message === 'string')
      return {
        type: 'done',
        outcome: {
          status: 'error',
          message: o.message.slice(0, LIMITS.maxErrorChars),
          line:
            typeof o.line === 'number' && Number.isInteger(o.line) && o.line > 0
              ? o.line
              : null,
        },
        ms,
      }
  }
  return null
}
