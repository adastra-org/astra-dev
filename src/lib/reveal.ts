import { useEffect } from 'react'

/** Igual a `--duration-panel` (theme.css). */
const PANEL_MS = 180

/** Lleva al encabezado del hash actual, abriendo las secciones plegadas que lo contienen. */
export function revealHash() {
  const id = decodeURIComponent(window.location.hash.slice(1))
  if (!id) return
  const el = document.getElementById(id)
  if (!el) return
  let opened = false
  let d = el.closest('details')
  while (d) {
    if (!d.open) opened = true
    d.open = true
    d = d.parentElement?.closest('details') ?? null
  }
  el.scrollIntoView()
  // La sección se abre con animación: el destino se mueve mientras crece, así que se
  // vuelve a alinear cuando termina (duración de --duration-panel más un margen).
  if (opened && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    setTimeout(() => el.scrollIntoView(), PANEL_MS + 40)
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
