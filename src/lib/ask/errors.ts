// Mensajes de error del chat, en el idioma de la interfaz y con la acción posible (house: "No se
// pudo X (motivo). Reintentar"). El texto del server está en inglés y es para logs, no para mostrar.
import { t, type MessageKey, type Vars } from '@/lib/i18n'
import { AskError } from './types'

export interface ErrorView {
  /** Qué pasó, en una frase. */
  title: string
  /** Qué hacer o cuándo volver a intentar. */
  hint?: string
  /** Tiene sentido ofrecer "Reintentar". */
  retry: boolean
}

/** Traductor de claves; por defecto español (para probar sin React). */
export type Tr = (key: MessageKey, vars?: Vars) => string
const es: Tr = (key, vars) => t('es', key, vars)

/** "45 s", "3 min", "2 h". */
export function waitLabel(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds))
  if (s < 90) return `${s} s`
  const m = Math.ceil(s / 60)
  if (m < 90) return `${m} min`
  return `${Math.ceil(m / 60)} h`
}

export function describeError(
  code: string,
  retryAfter?: number,
  tr: Tr = es,
): ErrorView {
  const wait = retryAfter === undefined ? undefined : waitLabel(retryAfter)
  switch (code) {
    case 'unauthenticated':
      return {
        title: tr('ask.err.unauthenticated'),
        hint: tr('ask.err.unauthenticated.hint'),
        retry: false,
      }
    case 'subscription_required':
      return {
        title: tr('ask.err.subscription'),
        hint: tr('ask.err.subscription.hint'),
        retry: false,
      }
    case 'rate_limited':
      return {
        title: tr('ask.err.rate'),
        hint:
          wait === undefined
            ? tr('ask.err.rate.wait')
            : tr('ask.err.rate.in', { wait }),
        retry: true,
      }
    case 'budget_exceeded':
      return {
        title: tr('ask.err.budget'),
        hint:
          wait === undefined
            ? tr('ask.err.budget.reset')
            : tr('ask.err.budget.resetIn', { wait }),
        retry: false,
      }
    case 'llm_unavailable':
      return {
        title: tr('ask.err.llm'),
        hint: tr('ask.err.llm.hint'),
        retry: true,
      }
    case 'viewer_unavailable':
      return {
        title: tr('ask.err.viewer'),
        hint: tr('ask.err.viewer.hint'),
        retry: true,
      }
    case 'index_unavailable':
      return {
        title: tr('ask.err.index'),
        hint: tr('ask.err.index.hint'),
        retry: true,
      }
    case 'network':
    case 'server_unavailable':
      return {
        title: tr('ask.err.network'),
        hint: tr('ask.err.network.hint'),
        retry: true,
      }
    case 'stream_interrupted':
      return {
        title: tr('ask.err.stream'),
        hint: tr('ask.err.stream.hint'),
        retry: true,
      }
    case 'forbidden_origin':
    case 'bad_request':
    case 'payload_too_large':
      return {
        title: tr('ask.err.request'),
        hint: tr('ask.err.request.hint'),
        retry: false,
      }
    default:
      return {
        title: tr('ask.err.other'),
        hint: tr('ask.err.other.hint'),
        retry: true,
      }
  }
}

export const describeAskError = (e: AskError, tr?: Tr): ErrorView =>
  describeError(e.code, e.retryAfter, tr)
