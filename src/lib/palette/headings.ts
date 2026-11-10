// Encabezados del documento abierto, publicados por la página y leídos por el palette.
import { useEffect, useSyncExternalStore } from 'react'
import type { TocItem } from '@/lib/docs/types'

const EMPTY: readonly TocItem[] = []
let current: readonly TocItem[] = EMPTY
const listeners = new Set<() => void>()

function set(next: readonly TocItem[]) {
  current = next
  for (const l of listeners) l()
}

/** La página de un doc publica su índice mientras está montada; al desmontar lo retira. */
export function usePublishHeadings(items: readonly TocItem[] | null) {
  useEffect(() => {
    if (!items) return
    set(items)
    return () => set(EMPTY)
  }, [items])
}

export function usePageHeadings(): readonly TocItem[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
    () => EMPTY,
  )
}
