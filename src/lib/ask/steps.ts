// Texto de cada paso del pipeline que muestra Activity. Sin React: se prueba con `bun test`.
import type { MessageKey, Vars } from '@/lib/i18n'
import type { AskStep } from './types'

export type Tr = (key: MessageKey, vars?: Vars) => string

/** Una línea por paso: qué hizo el server, en palabras. Solo cuentas, nunca el contenido. */
export function stepLabel(step: AskStep, tr: Tr): string {
  switch (step.id) {
    case 'history':
      return tr(step.usedHistory ? 'ask.act.history.yes' : 'ask.act.history.no')
    case 'search':
      return tr('ask.act.search', {
        mode: tr(`ask.act.mode.${step.mode}`),
        docs: step.docs,
        natives: step.natives,
      })
    case 'gate':
      return tr('ask.act.gate', { kept: step.kept, total: step.total })
    case 'cache':
      return tr('ask.act.cache')
  }
}
