// Lectura del tokens.json del design system: resolución de alias por tema y contraste WCAG.

type Value = string | Record<string, string>
interface Token {
  name: string
  value: Value
  usage?: string
}
interface Family {
  tokens: Token[]
}

export interface TokenFile {
  name: string
  color: { themes: { id: string; name: string }[]; tokens: Token[] }
  type: { families: Record<string, string> }
  spacing: Family
  radius: Family
  shadow: Family
  gradient: Family
}

const ALIAS = /^\{([A-Za-z0-9_.-]+)\}$/

/** Valor de un token para un tema; sin valor propio hereda el del primer tema. */
function pick(v: Value, theme: string, first: string): string {
  if (typeof v === 'string') return v
  return v[theme] ?? v[first] ?? ''
}

/**
 * Todas las variables de un tema. Con `aliasAsVar` un alias `{x}` queda como `var(--x)`
 * (para el CSS); sin él se resuelve hasta el valor final (para medir contraste).
 */
export function resolveTheme(
  file: TokenFile,
  theme: string,
  { aliasAsVar = false } = {},
): Record<string, string> {
  const first = file.color.themes[0]?.id ?? theme
  const raw = new Map<string, string>()
  for (const fam of [
    file.color,
    file.spacing,
    file.radius,
    file.shadow,
    file.gradient,
  ]) {
    for (const t of fam.tokens) raw.set(t.name, pick(t.value, theme, first))
  }

  const resolve = (name: string, seen = new Set<string>()): string => {
    const v = raw.get(name)
    if (v === undefined) throw new Error(`token inexistente: ${name}`)
    const m = ALIAS.exec(v)
    if (!m?.[1]) return v
    if (seen.has(name)) throw new Error(`alias circular: ${name}`)
    seen.add(name)
    return resolve(m[1], seen)
  }

  const out: Record<string, string> = {}
  for (const [name, v] of raw) {
    const m = ALIAS.exec(v)
    out[name] = m?.[1] && aliasAsVar ? `var(--${m[1]})` : resolve(name)
  }
  return out
}

function channel(c: number) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa de un hex `#rgb` / `#rrggbb`. */
export function luminance(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`hex no soportado: ${hex}`)
  const n = Number.parseInt(h, 16)
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  )
}

/** Relación de contraste WCAG 2.x entre dos hex. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (hi + 0.05) / (lo + 0.05)
}
