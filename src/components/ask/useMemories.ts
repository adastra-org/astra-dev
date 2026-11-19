import { useSyncExternalStore } from 'react'
import { memoryStore, type MemoriesState } from '@/lib/ask/memories'

/** Memorias de este navegador. El store vive fuera de React, igual que `useAsk`. */
export function useMemories(): MemoriesState {
  return useSyncExternalStore(
    memoryStore.subscribe,
    memoryStore.getState,
    memoryStore.getState,
  )
}
