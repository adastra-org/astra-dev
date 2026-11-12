// /tools en los dos idiomas: sin claves crudas y con el playground presente.
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { t, type UiLang } from '@/lib/i18n'
import { LangContext, type LangValue } from '@/lib/use-lang'
import Tools from './Tools'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})

const html = (lang: UiLang) =>
  renderToString(
    <LangContext.Provider value={value(lang)}>
      <MemoryRouter>
        <Tools />
      </MemoryRouter>
    </LangContext.Provider>,
  )

describe('tools en ES y EN', () => {
  test('muestra el sandbox editable y ejecutable en cada idioma', () => {
    const es = html('es')
    const en = html('en')
    expect(es).toContain('Sandbox de Lua')
    expect(en).toContain('Lua sandbox')
    for (const out of [es, en]) {
      expect(out).toContain('<textarea')
      expect(out).toContain('ipairs')
      expect(out).not.toMatch(/\btools\.[a-zA-Z.]+/)
    }
    expect(es).toContain('Ejecutar')
    expect(en).toContain('Run')
  })
})
