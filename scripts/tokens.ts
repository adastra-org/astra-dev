// Genera src/styles/tokens.css desde design/tokens.json (copia del design system de Ad Astra).
// Uso: bun run tokens
// Tema por defecto (:root) = Void (oscuro). `[data-theme="light"]` = Dawn.
// Las fuentes no salen de acá: fonts.css las declara con las familias self-hosted.

import { resolveTheme, type TokenFile } from '../src/lib/tokens'

const src = (await Bun.file('design/tokens.json').json()) as TokenFile
const [primary, ...rest] = src.color.themes.map((t) => t.id)
if (!primary) throw new Error('tokens.json: sin temas de color')

const block = (sel: string, theme: string) => {
  const vars = resolveTheme(src, theme, { aliasAsVar: true })
  const lines = Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`)
  return `${sel} {\n${lines.join('\n')}\n}\n`
}

// Radios: iguales en todos los temas y con los mismos nombres que Tailwind (rounded-md…).
const radius = src.radius.tokens
  .map((r) => `  --${r.name}: ${String(r.value)};`)
  .join('\n')

const out = [
  `/* ${src.name} — generado desde design/tokens.json por scripts/tokens.ts. No editar a mano. */`,
  '',
  block(':root', primary),
  ...rest.map((id) => block(`[data-theme="${id}"]`, id)),
  `@theme {\n${radius}\n}\n`,
].join('\n')

await Bun.write('src/styles/tokens.css', out)
console.log(
  `tokens.css: ${src.color.tokens.length} colores, temas ${[primary, ...rest].join(', ')}`,
)
