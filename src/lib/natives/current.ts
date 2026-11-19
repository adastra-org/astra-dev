// El native abierto, publicado por su página para las migas de pan (el índice no está cargado de
// forma síncrona, así que la miga no puede buscarlo sola). Mismo patrón que `palette/headings.ts`.
import { useEffect, useSyncExternalStore } from 'react'

export interface CurrentNative {
  slug: string
  label: string
  group: string
}

let current: CurrentNative | null = null
const listeners = new Set<() => void>()

function set(next: CurrentNative | null) {
  current = next
  for (const l of listeners) l()
}

export function usePublishNative(value: CurrentNative | null) {
  const key = value ? `${value.slug}|${value.label}|${value.group}` : ''
  useEffect(() => {
    if (!key) return
    const [slug = '', label = '', group = ''] = key.split('|')
    set({ slug, label, group })
    return () => set(null)
  }, [key])
}

export function useCurrentNative(): CurrentNative | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => current,
    () => null,
  )
}
