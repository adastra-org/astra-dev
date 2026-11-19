// Resaltado de sintaxis en build (shiki, motor JS sin WASM). Los colores salen de variables
// CSS `--code-token-*` que `src/styles/prose.css` mapea a roles del design system.
import {
  type BundledLanguage,
  createCssVariablesTheme,
  createHighlighter,
} from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'

const THEME = createCssVariablesTheme({
  name: 'astra',
  variablePrefix: '--code-',
  variableDefaults: {},
  fontStyle: true,
})

/** Lenguajes soportados (con sus alias habituales: sh, ts, js, yml, md, cs). */
export const LANGS = [
  'lua',
  'bash',
  'typescript',
  'tsx',
  'javascript',
  'json',
  'yaml',
  'markdown',
  'sql',
  'css',
  'html',
  'diff',
  'toml',
  'csharp',
] as const

type HL = Awaited<ReturnType<typeof createHighlighter>>

let pending: Promise<HL> | undefined

function getHighlighter(): Promise<HL> {
  pending ??= createHighlighter({
    themes: [THEME],
    langs: [...LANGS],
    engine: createJavaScriptRegexEngine({ forgiving: true }),
  })
  return pending
}

export const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export type Highlight = (code: string, lang: string) => string

/** Devuelve la función de resaltado: HTML del interior de `<code>`, una línea por `\n`. */
export async function createHighlight(): Promise<Highlight> {
  const hl = await getHighlighter()
  const loaded = new Set(hl.getLoadedLanguages())
  return (code, lang) => {
    if (!lang || !loaded.has(lang)) return escapeHtml(code)
    const { tokens } = hl.codeToTokens(code, {
      lang: lang as BundledLanguage,
      theme: 'astra',
    })
    return tokens
      .map((line) =>
        line
          .map((t) => {
            const text = escapeHtml(t.content)
            const style = [
              t.color ? `color:${t.color}` : '',
              // fontStyle de shiki: 1 = cursiva, 2 = negrita.
              t.fontStyle && t.fontStyle & 1 ? 'font-style:italic' : '',
            ]
              .filter(Boolean)
              .join(';')
            return style ? `<span style="${style}">${text}</span>` : text
          })
          .join(''),
      )
      .join('\n')
  }
}
