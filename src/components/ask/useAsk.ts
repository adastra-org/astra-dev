import { useSyncExternalStore } from 'react'
import { askStore, type AskState } from '@/lib/ask/store'

/** Estado del chat. El store vive fuera de React: la conversación sobrevive a cerrar el panel. */
export function useAsk(): AskState {
  return useSyncExternalStore(
    askStore.subscribe,
    askStore.getState,
    askStore.getState,
  )
}
