import { useEffect, useState } from 'react'

export interface Remote<T> {
  data: T | null
  error: unknown
  loading: boolean
  reload: () => void
}

/**
 * Carga datos y los conserva mientras se recargan (el marco no salta: DESIGN.md, "Refetch keeps the
 * frame"). Si la recarga falla, `data` sigue siendo la última copia buena y `error` dice qué pasó.
 * `key` identifica la consulta: cambiarlo la vuelve a pedir.
 */
export function useRemote<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key: string | number,
): Remote<T> {
  const [state, setState] = useState<{
    data: T | null
    error: unknown
    loading: boolean
  }>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    setState((s) => ({ ...s, error: null, loading: true }))
    load(ac.signal).then(
      (data) => {
        if (!ac.signal.aborted) setState({ data, error: null, loading: false })
      },
      (error: unknown) => {
        if (!ac.signal.aborted)
          setState((s) => ({ ...s, error, loading: false }))
      },
    )
    return () => ac.abort()
    // `load` es una función nueva en cada render; la consulta la identifica `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  return { ...state, reload: () => setNonce((n) => n + 1) }
}
