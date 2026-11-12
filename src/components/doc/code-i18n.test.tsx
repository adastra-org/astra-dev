// El bloque de código en los dos idiomas: botones del sandbox y diagnósticos.
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { lintLua } from '@/lib/sandbox/lint'
import { t, type UiLang } from '@/lib/i18n'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { CodeBlock } from './CodeBlock'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})

const html = (lang: UiLang, runnable: boolean) =>
  renderToString(
    <LangContext.Provider value={value(lang)}>
      <CodeBlock code="print(1)" lang="lua" runnable={runnable} />
    </LangContext.Provider>,
  )

describe('CodeBlock en ES y EN', () => {
  test('los botones del sandbox cambian de idioma', () => {
    const es = html('es', true)
    const en = html('en', true)
    for (const label of ['Ejecutar', 'Revisar', 'Formatear', 'Copiar'])
      expect(es).toContain(label)
    for (const label of ['Run', 'Check', 'Format', 'Copy'])
      expect(en).toContain(label)
    expect(en).not.toContain('Ejecutar')
  })

  test('sin runnable solo queda copiar', () => {
    expect(html('en', false)).not.toContain('Run')
    expect(html('en', false)).toContain('Copy')
  })

  test('los avisos del lint llevan código y nombre para traducir', () => {
    const d = lintLua('local x = 1\nos.exit()')
    const unused = d.find((x) => x.code === 'unusedLocal')
    const unavailable = d.find((x) => x.code === 'unavailable')
    expect(unused?.name).toBe('x')
    expect(unavailable?.name).toBe('os')
    expect(t('en', 'code.lint.unusedLocal', { name: 'x' })).toContain('“x”')
  })
})
