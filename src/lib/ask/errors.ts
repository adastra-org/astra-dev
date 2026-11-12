// Mensajes de error del chat, en el idioma del usuario y con la acción posible (house: "No se
// pudo X (motivo). Reintentar"). El texto del server está en inglés y es para logs, no para mostrar.
import { AskError } from './types'

export interface ErrorView {
  /** Qué pasó, en una frase. */
  title: string
  /** Qué hacer o cuándo volver a intentar. */
  hint?: string
  /** Tiene sentido ofrecer "Reintentar". */
  retry: boolean
}

/** "en 45 s", "en 3 min", "en 2 h". */
export function waitLabel(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds))
  if (s < 90) return `${s} s`
  const m = Math.ceil(s / 60)
  if (m < 90) return `${m} min`
  return `${Math.ceil(m / 60)} h`
}

export function describeError(code: string, retryAfter?: number): ErrorView {
  switch (code) {
    case 'unauthenticated':
      return {
        title: 'Inicia sesión para usar Ask Ether.',
        hint: 'La búsqueda en Ctrl+K sigue disponible sin cuenta.',
        retry: false,
      }
    case 'subscription_required':
      return {
        title: 'Ask Ether es para suscriptores y staff de Ad Astra.',
        hint: 'Tu cuenta no tiene una suscripción activa.',
        retry: false,
      }
    case 'rate_limited':
      return {
        title: 'Hiciste demasiadas preguntas seguidas.',
        hint:
          retryAfter === undefined
            ? 'Espera un momento y vuelve a intentar.'
            : `Puedes volver a intentar en ${waitLabel(retryAfter)}.`,
        retry: true,
      }
    case 'budget_exceeded':
      return {
        title: 'Se alcanzó el límite diario de Ask Ether.',
        hint:
          retryAfter === undefined
            ? 'Se restablece a las 00:00 UTC.'
            : `Se restablece a las 00:00 UTC, en ${waitLabel(retryAfter)}.`,
        retry: false,
      }
    case 'llm_unavailable':
      return {
        title: 'No se pudo generar la respuesta (el modelo no responde).',
        hint: 'Las fuentes de la documentación sí se encontraron. Reintenta en unos segundos.',
        retry: true,
      }
    case 'viewer_unavailable':
      return {
        title:
          'No se pudo verificar tu sesión (el servicio de cuentas no responde).',
        hint: 'Reintenta en unos minutos.',
        retry: true,
      }
    case 'index_unavailable':
      return {
        title: 'El índice de la documentación no está disponible.',
        hint: 'Reintenta más tarde.',
        retry: true,
      }
    case 'network':
    case 'server_unavailable':
      return {
        title: 'No se pudo conectar con el servidor de Ask Ether.',
        hint: 'Revisa tu conexión y reintenta.',
        retry: true,
      }
    case 'stream_interrupted':
      return {
        title: 'La respuesta se cortó antes de terminar.',
        hint: 'Reintenta para obtenerla completa.',
        retry: true,
      }
    case 'forbidden_origin':
    case 'bad_request':
    case 'payload_too_large':
      return {
        title: 'No se pudo enviar la pregunta.',
        hint: 'Prueba con una pregunta más corta.',
        retry: false,
      }
    default:
      return {
        title: 'Algo falló en el servidor de Ask Ether.',
        hint: 'Reintenta en unos segundos.',
        retry: true,
      }
  }
}

export const describeAskError = (e: AskError): ErrorView =>
  describeError(e.code, e.retryAfter)
