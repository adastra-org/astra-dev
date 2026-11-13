// Estado de la conversación para la interfaz: si hay una respuesta en curso y qué anuncia el lector
// de pantalla. Puro (sin React): `tr` entra como parámetro.
import type { LangValue } from '@/lib/use-lang'
import type { Turn } from './store'

export const isBusy = (t: Turn): boolean =>
  t.status === 'waiting' || t.status === 'streaming'

/** Hay una respuesta en curso en la conversación: no se edita ni se reenvía. */
export const isTurnBusy = (turns: readonly Turn[]): boolean =>
  turns.some(isBusy)

/** Texto para el lector de pantalla mientras cambia la última respuesta. */
export function turnStatusText(
  last: Turn | undefined,
  tr: LangValue['tr'],
): string {
  if (!last) return ''
  switch (last.status) {
    case 'waiting':
      return tr('ask.status.waiting')
    case 'streaming':
      return tr('ask.status.streaming')
    case 'error':
      return '' // el aviso de error ya es un role=alert
    case 'stopped':
      return tr('ask.status.stopped')
    default:
      return last.cited.length === 0
        ? tr('ask.status.done')
        : last.cited.length === 1
          ? tr('ask.status.doneOne')
          : tr('ask.status.doneMany', { n: last.cited.length })
  }
}
