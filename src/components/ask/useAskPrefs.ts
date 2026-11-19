import { useSyncExternalStore } from 'react'
import { prefsStore, type PrefsState } from '@/lib/ask/prefs'

/** Preferencias de Ether de este navegador. El store vive fuera de React, igual que `useMemories`. */
export function useAskPrefs(): PrefsState {
  return useSyncExternalStore(
    prefsStore.subscribe,
    prefsStore.getState,
    prefsStore.getState,
  )
}
