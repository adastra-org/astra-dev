// Qué fuentes se muestran y cuáles tienen página a la que enlazar. Sin React.
import type { AskSource } from './types'

/**
 * Las páginas `/natives/<slug>` salen en M2 (fase 3, publicar los natives). Mientras no existan, una
 * cita a un native se muestra como texto con su nombre, sin enlace roto.
 */
export const NATIVE_PAGES_PUBLISHED = false

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
