import { describe, expect, test } from 'bun:test'
import tokens from '../../design/tokens.json'
import { contrast, resolveTheme, type TokenFile } from './tokens'

const file = tokens as unknown as TokenFile

// Pares que la UI usa como texto (4.5:1) o como borde / foco / ícono (3:1).
const TEXT: [string, string][] = [
  ['ink', 'surface'],
  ['ink', 'surface-raised'],
  ['ink', 'surface-overlay'],
  ['ink', 'surface-sunken'],
  ['ink-muted', 'surface'],
  ['ink-muted', 'surface-raised'],
  ['ink-subtle', 'surface'],
  ['ink-subtle', 'surface-raised'],
  ['accent', 'surface'],
  ['accent', 'surface-raised'],
  ['on-accent', 'accent-fill'],
  ['on-accent', 'accent-fill-hover'],
  ['on-brand', 'surface-brand'],
  ['success', 'success-surface'],
  ['warning', 'warning-surface'],
  ['danger', 'danger-surface'],
  ['info', 'info-surface'],
]
const UI: [string, string][] = [
  ['border-strong', 'surface'],
  ['border-strong', 'surface-raised'],
  ['focus', 'surface'],
  ['focus', 'surface-raised'],
]

for (const { id } of file.color.themes) {
  const v = resolveTheme(file, id)
  describe(`tema ${id}`, () => {
    for (const [fg, bg] of TEXT)
      test(`${fg} sobre ${bg} ≥ 4.5`, () => {
        expect(contrast(v[fg]!, v[bg]!)).toBeGreaterThanOrEqual(4.5)
      })
    for (const [fg, bg] of UI)
      test(`${fg} sobre ${bg} ≥ 3`, () => {
        expect(contrast(v[fg]!, v[bg]!)).toBeGreaterThanOrEqual(3)
      })
  })
}

test('alias como var() para el CSS', () => {
  expect(resolveTheme(file, 'dark', { aliasAsVar: true }).surface).toBe(
    'var(--brand-dark)',
  )
})
