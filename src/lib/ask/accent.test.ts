// Los presets de color del chat (`styles/ask.css`) cumplen el mismo contraste que el tema base:
// texto de acento a 4.5:1 sobre las superficies del chat y texto sobre el relleno a 4.5:1.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import tokens from '../../../design/tokens.json'
import { contrast, resolveTheme, type TokenFile } from '../tokens'
import { ACCENTS, DEFAULT_PREFS } from './prefs'

const file = tokens as unknown as TokenFile
const css = readFileSync(
  new URL('../../styles/ask.css', import.meta.url),
  'utf8',
)

/** Variables que declara un bloque `selector { ... }` de ask.css. */
function block(selector: string): Record<string, string> {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css)
  if (!m?.[1]) return {}
  const out: Record<string, string> = {}
  for (const d of m[1].matchAll(/--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)/g))
    out[d[1]!] = d[2]!
  return out
}

for (const { id } of file.color.themes) {
  const base = resolveTheme(file, id)
  describe(`acento del chat en ${id}`, () => {
    for (const accent of ACCENTS) {
      const own = block(
        id === 'light'
          ? `[data-theme='light'] [data-chat-accent='${accent}']`
          : `[data-chat-accent='${accent}']`,
      )
      const dark = block(`[data-chat-accent='${accent}']`)
      // En claro, lo que el bloque no redefine lo hereda del de oscuro (mono usa roles).
      const vars = { ...dark, ...own }
      const role = (name: string): string => {
        const ref = vars[name]
        const key = ref ?? name
        const hex = base[key]
        if (!hex) throw new Error(`sin valor para ${name} (${accent}, ${id})`)
        return hex
      }
      test(`${accent}: define acento, relleno y hover`, () => {
        expect(vars.accent).toBeDefined()
        expect(vars['accent-fill']).toBeDefined()
        expect(vars['accent-fill-hover']).toBeDefined()
      })
      for (const bg of ['surface', 'surface-raised'])
        test(`${accent}: accent sobre ${bg} ≥ 4.5`, () => {
          expect(contrast(role('accent'), base[bg]!)).toBeGreaterThanOrEqual(
            4.5,
          )
        })
      for (const fill of ['accent-fill', 'accent-fill-hover'])
        test(`${accent}: on-accent sobre ${fill} ≥ 4.5`, () => {
          expect(
            contrast(role('on-accent'), role(fill)),
          ).toBeGreaterThanOrEqual(4.5)
        })
    }
  })
}

test('el acento por defecto repite los valores base del tema', () => {
  for (const { id } of file.color.themes) {
    const base = resolveTheme(file, id)
    const sel =
      id === 'light'
        ? `[data-theme='light'] [data-chat-accent='${DEFAULT_PREFS.accent}']`
        : `[data-chat-accent='${DEFAULT_PREFS.accent}']`
    const v = block(sel)
    expect(base[v.accent!]).toBe(base.accent)
    expect(base[v['accent-fill']!]).toBe(base['accent-fill'])
    expect(base[v['accent-fill-hover']!]).toBe(base['accent-fill-hover'])
  }
})
