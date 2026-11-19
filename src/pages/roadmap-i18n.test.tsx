// Roadmap en los dos idiomas: encabezados, errores y formatos de fecha y número.
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { t, type MessageKey, type UiLang } from '@/lib/i18n'
import { ApiError, describeError } from '@/lib/project/api'
import { formatDay, formatStamp, formatValue } from '@/lib/project/series'
import { LangContext, type LangValue } from '@/lib/use-lang'
import Roadmap from './Roadmap'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})

const html = (lang: UiLang) =>
  renderToString(
    <LangContext.Provider value={value(lang)}>
      <MemoryRouter>
        <Roadmap />
      </MemoryRouter>
    </LangContext.Provider>,
  )

describe('roadmap en ES y EN', () => {
  test('las secciones cambian de idioma y no quedan claves crudas', () => {
    const es = html('es')
    const en = html('en')
    expect(es).toContain('Evolución')
    expect(es).toContain('Complejidad')
    expect(en).toContain('Evolution')
    expect(en).toContain('Complexity')
    expect(en).not.toContain('Evolución')
    for (const out of [es, en]) expect(out).not.toMatch(/\brm\.[a-zA-Z.]+/)
  })

  test('los errores se traducen y conservan el tiempo de espera', () => {
    const en = (key: MessageKey, vars?: Record<string, string | number>) =>
      t('en', key, vars)
    const gate = describeError(new ApiError('unauthenticated', 'x'), en)
    expect(gate.title).toBe('Sign in')
    const rate = describeError(new ApiError('rate_limited', 'x', 30), en)
    expect(rate.hint).toContain('30 s')
    expect(describeError(new Error('x'), en).title).toBe('Something failed')
    expect(describeError(new Error('x')).title).toBe('Algo falló')
  })

  test('fechas y números siguen el idioma', () => {
    expect(formatDay('2026-11-12', 'es')).toMatch(/12\s+nov/i)
    expect(formatDay('2026-11-12', 'en')).toMatch(/Nov\s+12/)
    expect(formatValue(1234.5, 'es')).toContain(',5')
    expect(formatValue(1234.5, 'en')).toContain('.5')
    expect(formatStamp('2026-11-12T14:30:00Z', 'en')).toMatch(/Nov/)
  })
})
