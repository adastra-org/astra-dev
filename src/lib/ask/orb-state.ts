// Estado del orbe de Ether según el último turno. Sin React: se prueba con `bun test`.
import type { OrbState } from '@wefaber/orb'
import type { TurnStatus } from './store'

/** Estado del orbe según cómo va el último turno: la espera se ve como "pensando". */
export function orbState(status: TurnStatus | undefined): OrbState {
  switch (status) {
    case 'waiting':
      return 'thinking'
    case 'streaming':
      return 'speaking'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}
