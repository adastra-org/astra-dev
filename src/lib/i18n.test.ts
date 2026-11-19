import { describe, expect, test } from 'bun:test'
import { NAV } from '@/config/nav'
import { MESSAGES, UI_LANGS, t, wantedLang } from './i18n'

describe('diccionario', () => {
  test('ES y EN tienen las mismas claves', () => {
    expect(Object.keys(MESSAGES.en).sort()).toEqual(
      Object.keys(MESSAGES.es).sort(),
    )
  })

  test('ninguna cadena queda vacía', () => {
    for (const lang of UI_LANGS)
      for (const [key, value] of Object.entries(MESSAGES[lang]))
        expect(value.trim(), `${lang}:${key}`).not.toBe('')
  })

  test('los marcadores {x} de ES existen también en EN', () => {
    const marks = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const key of Object.keys(MESSAGES.es) as (keyof typeof MESSAGES.es)[])
      expect(marks(MESSAGES.en[key]), key).toEqual(marks(MESSAGES.es[key]))
  })

  test('cada ítem de navegación tiene texto en los dos idiomas', () => {
    for (const n of NAV)
      for (const lang of UI_LANGS) {
        expect(t(lang, n.label)).not.toBe(n.label)
        expect(t(lang, n.description)).not.toBe(n.description)
      }
  })
})

describe('t y wantedLang', () => {
  test('reemplaza marcadores y deja los que faltan', () => {
    expect(t('es', 'docs.count', { n: 3 })).toBe('3 documentos')
    expect(t('en', 'docs.count', { n: 3 })).toBe('3 documents')
    expect(t('es', 'docs.count')).toBe('{n} documentos')
  })

  test('?lang manda; sin parámetro válido, la interfaz', () => {
    expect(wantedLang('en', 'es')).toBe('en')
    expect(wantedLang('es', 'en')).toBe('es')
    expect(wantedLang(null, 'en')).toBe('en')
    expect(wantedLang('fr', 'es')).toBe('es')
  })
})
