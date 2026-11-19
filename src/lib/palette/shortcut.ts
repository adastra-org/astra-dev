// Atajo global Ctrl+K / Cmd+K. Puro: recibe un resumen del evento, para probarlo sin DOM.

export interface ShortcutEvent {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat: boolean
  isComposing: boolean
  defaultPrevented: boolean
}

export interface ShortcutTarget {
  /** Nombre de etiqueta en minúsculas. */
  tag: string
  isContentEditable: boolean
  /** El elemento o un ancestro lleva `data-palette-ignore` (p. ej. un editor de código). */
  ignored: boolean
  /** El elemento está dentro del propio palette. */
  insidePalette: boolean
}

/** macOS e iOS usan Cmd; el resto, Ctrl. En Mac, Ctrl+K es "borrar hasta fin de línea" en los campos de texto. */
export function isApple(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/**
 * Regla del atajo:
 * - Alterna el palette desde cualquier página y desde cualquier elemento, incluido un `<input>`
 *   de una línea (Ctrl+K no tiene función nativa ahí) y el propio campo del palette.
 * - No se intercepta en `<textarea>` ni en elementos editables (Ctrl+K inserta un enlace en los
 *   editores de texto enriquecido), ni dentro de `[data-palette-ignore]` (editores de código del
 *   sandbox, M4), salvo que el foco esté en el palette.
 * - No se intercepta con Alt o Shift, con la tecla mantenida, durante una composición IME ni si
 *   otro manejador ya llamó a `preventDefault`.
 */
export function isPaletteShortcut(
  e: ShortcutEvent,
  target: ShortcutTarget | null,
  apple: boolean,
): boolean {
  if (e.key.toLowerCase() !== 'k') return false
  if (apple ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return false
  if (e.altKey || e.shiftKey || e.repeat || e.isComposing) return false
  if (e.defaultPrevented) return false
  if (target && !target.insidePalette) {
    if (target.tag === 'textarea' || target.isContentEditable || target.ignored)
      return false
  }
  return true
}

/** Resumen del elemento de un evento real (lo único que toca el DOM). */
export function describeTarget(t: EventTarget | null): ShortcutTarget | null {
  if (!(t instanceof HTMLElement)) return null
  return {
    tag: t.tagName.toLowerCase(),
    isContentEditable: t.isContentEditable,
    ignored: t.closest('[data-palette-ignore]') !== null,
    insidePalette: t.closest('[data-palette]') !== null,
  }
}
