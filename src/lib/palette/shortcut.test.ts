import { describe, expect, test } from 'bun:test'
import {
  isApple,
  isPaletteShortcut,
  type ShortcutEvent,
  type ShortcutTarget,
} from './shortcut'

const ev = (o: Partial<ShortcutEvent> = {}): ShortcutEvent => ({
  key: 'k',
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  isComposing: false,
  defaultPrevented: false,
  ...o,
})
const target = (o: Partial<ShortcutTarget> = {}): ShortcutTarget => ({
  tag: 'div',
  isContentEditable: false,
  ignored: false,
  insidePalette: false,
  ...o,
})
const meta = { ctrlKey: false, metaKey: true }

describe('isPaletteShortcut', () => {
  test('Ctrl+K fuera de Mac, Cmd+K en Mac', () => {
    expect(isPaletteShortcut(ev(), null, false)).toBe(true)
    expect(isPaletteShortcut(ev({ key: 'K' }), null, false)).toBe(true)
    expect(isPaletteShortcut(ev(meta), null, false)).toBe(false)
    expect(isPaletteShortcut(ev(meta), null, true)).toBe(true)
    // En Mac, Ctrl+K es "borrar hasta fin de línea": no se intercepta.
    expect(isPaletteShortcut(ev(), null, true)).toBe(false)
  })

  test('otras teclas y modificadores extra no lo activan', () => {
    expect(isPaletteShortcut(ev({ key: 'j' }), null, false)).toBe(false)
    expect(isPaletteShortcut(ev({ shiftKey: true }), null, false)).toBe(false)
    expect(isPaletteShortcut(ev({ altKey: true }), null, false)).toBe(false)
    expect(isPaletteShortcut(ev({ repeat: true }), null, false)).toBe(false)
    expect(isPaletteShortcut(ev({ isComposing: true }), null, false)).toBe(
      false,
    )
    expect(isPaletteShortcut(ev({ defaultPrevented: true }), null, false)).toBe(
      false,
    )
  })

  test('funciona desde un input de una línea y desde el body', () => {
    expect(isPaletteShortcut(ev(), target({ tag: 'input' }), false)).toBe(true)
    expect(isPaletteShortcut(ev(), target({ tag: 'body' }), false)).toBe(true)
  })

  test('respeta textarea, elementos editables y [data-palette-ignore]', () => {
    expect(isPaletteShortcut(ev(), target({ tag: 'textarea' }), false)).toBe(
      false,
    )
    expect(
      isPaletteShortcut(ev(), target({ isContentEditable: true }), false),
    ).toBe(false)
    expect(isPaletteShortcut(ev(), target({ ignored: true }), false)).toBe(
      false,
    )
  })

  test('dentro del palette siempre alterna (cierra), aunque el campo sea editable', () => {
    const inside = target({
      tag: 'textarea',
      ignored: true,
      insidePalette: true,
    })
    expect(isPaletteShortcut(ev(), inside, false)).toBe(true)
  })
})

test('isApple', () => {
  expect(isApple('MacIntel')).toBe(true)
  expect(isApple('iPhone')).toBe(true)
  expect(isApple('Win32')).toBe(false)
  expect(isApple('Linux x86_64')).toBe(false)
})
