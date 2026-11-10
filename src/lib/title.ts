import { useEffect } from 'react'

const SITE = 'Astra Dev'

/** Título de documento: "Página · Astra Dev" (o solo el sitio si no hay página). */
export function titleOf(page?: string): string {
  return page ? `${page} · ${SITE}` : SITE
}

export function useTitle(page?: string) {
  useEffect(() => {
    document.title = titleOf(page)
  }, [page])
}
