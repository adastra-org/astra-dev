// El chat en los dos idiomas: errores, entrada de la barra y claves del diccionario.
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { describeError } from '@/lib/ask/errors'
import { MESSAGES, t, type MessageKey, type UiLang } from '@/lib/i18n'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { AskTrigger } from './AskTrigger'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})

const CODES = [
  'unauthenticated',
  'subscription_required',
  'rate_limited',
  'budget_exceeded',
  'llm_unavailable',
  'viewer_unavailable',
  'index_unavailable',
  'network',
  'stream_interrupted',
  'bad_request',
  'desconocido',
]

describe('ask en los dos idiomas', () => {
  test('cada error tiene título y pista en EN, distintos de ES', () => {
    const en = (key: MessageKey, vars?: Record<string, string | number>) =>
      t('en', key, vars)
    for (const code of CODES) {
      const es = describeError(code, 45)
      const e = describeError(code, 45, en)
      expect(e.title, code).not.toBe(es.title)
      expect(e.title).not.toMatch(/^ask\./)
      expect(e.hint ?? '').not.toMatch(/^ask\./)
      expect(e.retry).toBe(es.retry)
    }
  })

  test('el tiempo de espera entra en el mensaje', () => {
    const en = (key: MessageKey, vars?: Record<string, string | number>) =>
      t('en', key, vars)
    expect(describeError('rate_limited', 45, en).hint).toContain('45 s')
    expect(describeError('budget_exceeded', 7200, en).hint).toContain('2 h')
  })

  test('la entrada de la barra cambia con el idioma', () => {
    const html = (lang: UiLang) =>
      renderToString(
        <LangContext.Provider value={value(lang)}>
          <AskTrigger />
        </LangContext.Provider>,
      )
    expect(html('es')).toContain('Preguntar a Ether')
    expect(html('en')).toContain('Ask Ether')
    expect(html('en')).not.toContain('Preguntar')
  })

  test('las claves ask.* existen en los dos idiomas', () => {
    const keys = Object.keys(MESSAGES.es).filter((k) => k.startsWith('ask.'))
    expect(keys.length).toBeGreaterThan(40)
    for (const k of keys) expect(MESSAGES.en[k as MessageKey], k).toBeTruthy()
  })
})
