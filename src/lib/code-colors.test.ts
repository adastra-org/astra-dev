import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import tokens from '../../design/tokens.json'
import { contrast, resolveTheme, type TokenFile } from './tokens'

// Cada `--code-token-*` de prose.css es un rol del design system; el código vive sobre
// surface-sunken, así que cada color debe leerse a 4.5:1 sobre él (tema Void, el único que se publica).
const css = readFileSync(
  new URL('../styles/prose.css', import.meta.url),
  'utf8',
)
const pairs = [...css.matchAll(/--(code-[a-z-]+):\s*var\(--([a-z-]+)\)/g)].map(
  (m) => [m[1]!, m[2]!] as const,
)
const v = resolveTheme(tokens as unknown as TokenFile, 'dark')

describe('colores del resaltado', () => {
  test('prose.css define los tokens que usa shiki', () => {
    const names = pairs.map(([n]) => n)
    for (const n of [
      'code-foreground',
      'code-token-comment',
      'code-token-keyword',
      'code-token-string',
      'code-token-constant',
      'code-token-function',
    ])
      expect(names).toContain(n)
  })

  for (const [name, role] of pairs)
    test(`${name} (${role}) sobre surface-sunken ≥ 4.5`, () => {
      expect(v[role]).toBeDefined()
      expect(contrast(v[role]!, v['surface-sunken']!)).toBeGreaterThanOrEqual(
        4.5,
      )
    })
})
