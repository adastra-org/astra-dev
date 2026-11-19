// Opciones del selector de `@` en el campo de /ask. La lógica pura vive en `lib/ask/mentions.ts`;
// acá solo hay estado de pantalla (pausa al escribir, cancelación, sesiones del navegador).
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  type Mention,
  searchIssueMentions,
  searchNativeMentions,
  sessionMention,
} from '@/lib/ask/mentions'
import { searchSessions, sessionStore } from '@/lib/ask/sessions'
import type { ViewerRole } from '@/lib/ask/store'

const DEBOUNCE_MS = 150

export interface MentionOptions {
  /** Ya sin las que están adjuntas, en el orden en que se ven. */
  items: Mention[]
  loading: boolean
}

export const optionId = (listId: string, key: string) => `${listId}-${key}`

/**
 * Opciones para la `@consulta` en curso (`null` = lista cerrada). Las sesiones salen del navegador
 * al instante; natives e issues se piden con una pausa y se cancelan al seguir escribiendo.
 * Los issues solo se piden a staff: para el resto la sección no existe.
 */
export function useMentionOptions(
  query: string | null,
  opts: { role: ViewerRole; sessionId: string; attached: readonly Mention[] },
): MentionOptions {
  const sessions = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getState,
    sessionStore.getState,
  )
  const [remote, setRemote] = useState<{
    query: string
    natives: Mention[]
    issues: Mention[]
  } | null>(null)
  const canIssues = opts.role === 'staff' || opts.role === 'owner'

  useEffect(() => {
    if (query === null) return
    const ctl = new AbortController()
    const timer = setTimeout(() => {
      void Promise.all([
        searchNativeMentions(query, 5, ctl.signal).catch(() => []),
        canIssues
          ? searchIssueMentions(query, 5, ctl.signal)
          : Promise.resolve([]),
      ]).then(([natives, issues]) => {
        if (!ctl.signal.aborted) setRemote({ query, natives, issues })
      })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctl.abort()
    }
  }, [query, canIssues])

  if (query === null) return { items: [], loading: false }
  const taken = new Set(opts.attached.map((m) => m.key))
  const local = searchSessions(sessions.items, query, {
    exclude: opts.sessionId,
    limit: 5,
  }).map(sessionMention)
  const ready = remote?.query === query
  const items = [
    ...local,
    ...(ready ? [...remote.natives, ...remote.issues] : []),
  ].filter((m) => !taken.has(m.key))
  return { items, loading: !ready }
}
