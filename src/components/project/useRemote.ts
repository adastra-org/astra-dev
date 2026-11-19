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
  // `settled` es la consulta (key + nonce) a la que responde `error`; si no es la actual, hay una
  // carga en curso. Así `loading` se deriva en el render y el efecto no hace setState síncrono.
  const [state, setState] = useState<{
    data: T | null
    error: unknown
    settled: { key: string | number; nonce: number } | null
  }>({ data: null, error: null, settled: null })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const ac = new AbortController()
    const settled = { key, nonce }
    load(ac.signal).then(
      (data) => {
        if (!ac.signal.aborted) setState({ data, error: null, settled })
      },
      (error: unknown) => {
        if (!ac.signal.aborted) setState((s) => ({ ...s, error, settled }))
      },
    )
    return () => ac.abort()
    // `load` es una función nueva en cada render; la consulta la identifica `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  const loading = state.settled?.key !== key || state.settled.nonce !== nonce
  return {
    data: state.data,
    error: loading ? null : state.error,
    loading,
    reload: () => setNonce((n) => n + 1),
  }
}
