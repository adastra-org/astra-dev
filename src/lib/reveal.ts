import { useEffect } from 'react'

/** Lleva al encabezado del hash actual, abriendo las secciones plegadas que lo contienen. */
export function revealHash() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  if (!id) return
  const el = document.getElementById(id)
  if (!el) return
  let d = el.closest('details')
  while (d) {
    d.open = true
    d = d.parentElement?.closest('details') ?? null
  }
  el.scrollIntoView()
}

/**
 * El contenido llega por carga diferida, así que el navegador no puede resolver el hash solo:
 * se resuelve cuando `ready` pasa a true y en cada cambio de hash (clics del índice y anclas).
 */
export function useRevealHash(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    revealHash()
    window.addEventListener('hashchange', revealHash)
    return () => window.removeEventListener('hashchange', revealHash)
  }, [ready])
}
