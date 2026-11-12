// Qué fuentes se muestran y cuáles tienen página a la que enlazar. Sin React.
import type { AskSource } from './types'

/**
 * Las páginas `/natives/<slug>` existen desde M2 (v0.7.0) y el slug es el del importador, el mismo
 * que usa el índice del server. Si se quitan, una cita a un native vuelve a mostrarse como texto
 * con su nombre, sin enlace roto.
 */
export const NATIVE_PAGES_PUBLISHED = true

export const isLinkable = (s: AskSource): boolean =>
  s.kind === 'doc' || NATIVE_PAGES_PUBLISHED

/**
 * Fuentes que se listan bajo una respuesta: las que el modelo citó, en el orden de la lista. Un
 * rechazo no lista ninguna (las recuperadas no respondían la pregunta).
 */
export function visibleSources(
  sources: readonly AskSource[],
  cited: readonly number[],
  refused: boolean,
): AskSource[] {
  if (refused) return []
  const set = new Set(cited)
  return sources.filter((s) => set.has(s.n))
}

/** "Título · Sección", sin repetir cuando la sección es el propio título. */
export function sourceLabel(s: AskSource): { title: string; section: string } {
  const section = s.heading && s.heading !== s.title ? s.heading : ''
  return { title: s.title, section }
}
