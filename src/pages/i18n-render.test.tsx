// Humo de i18n: las páginas del shell se renderizan en los dos idiomas, cambian de texto y no
// dejan claves crudas (`nav.home`) a la vista. No sustituye una pasada en el navegador.
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { t, type UiLang } from '@/lib/i18n'
import { Breadcrumbs } from '@/components/shell/Breadcrumbs'
import { LangSwitch } from '@/components/shell/LangSwitch'
import { Sidebar } from '@/components/shell/Sidebar'
import Docs from './Docs'
import Home from './Home'
import NotFound from './NotFound'
import Tools from './Tools'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})

const render = (lang: UiLang, node: React.ReactNode, path = '/') =>
  renderToString(
    <LangContext.Provider value={value(lang)}>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </LangContext.Provider>,
  )

// Una clave del diccionario sin traducir se ve como `area.clave`.
const RAW_KEY =
  /\b(nav|shell|crumbs|palette|home|docs?|toc|summary|translation|natives|tools|roadmap|notFound|lang|code)\.[a-zA-Z.]+\b/

const pages: [string, () => React.ReactNode, string][] = [
  ['inicio', () => <Home />, '/'],
  ['documentación', () => <Docs />, '/docs'],
  ['herramientas', () => <Tools />, '/tools'],
  ['404', () => <NotFound />, '/nada'],
  ['migas', () => <Breadcrumbs />, '/docs'],
  ['sidebar', () => <Sidebar open onClose={() => {}} />, '/docs'],
  ['selector', () => <LangSwitch />, '/'],
]

describe('páginas en los dos idiomas', () => {
  for (const [name, page, path] of pages)
    test(`${name}: sin claves crudas y distinto texto en ES y EN`, () => {
      const es = render('es', page(), path)
      const en = render('en', page(), path)
      expect(es.replace(/https?:\/\/\S+/g, '')).not.toMatch(RAW_KEY)
      expect(en.replace(/https?:\/\/\S+/g, '')).not.toMatch(RAW_KEY)
      expect(en).not.toBe(es)
    })

  test('el selector marca el idioma activo', () => {
    expect(render('en', <LangSwitch />)).toMatch(/aria-pressed="true"[^>]*>EN/)
    expect(render('es', <LangSwitch />)).toMatch(/aria-pressed="true"[^>]*>ES/)
  })

  test('inicio en inglés usa los textos en inglés', () => {
    const html = render('en', <Home />)
    expect(html).toContain('Documentation')
    expect(html).not.toContain('Documentación')
  })
})
