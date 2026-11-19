// Render (SSR) del onboarding y de su botón en el rail, en los dos idiomas. El flujo con teclado y
// foco se verifica en el navegador (docs/chat/README.md).
import { describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { MESSAGES, t, type UiLang } from '@/lib/i18n'
import { ACCENTS, LENGTHS, TONES } from '@/lib/ask/prefs'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { OnboardingDialog } from './OnboardingDialog'
import { PersonalizePanel } from './PersonalizePanel'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})
const wrap = (node: ReactNode, lang: UiLang = 'es') =>
  renderToString(
    <LangContext.Provider value={value(lang)}>{node}</LangContext.Provider>,
  )

describe('OnboardingDialog', () => {
  test('cerrado es un <dialog> sin contenido (nada enfocable)', () => {
    const html = wrap(<OnboardingDialog open={false} onClose={() => {}} />)
    expect(html).toContain('<dialog')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
  })

  test('abierto muestra el primer paso con progreso y Saltar', () => {
    const es = wrap(<OnboardingDialog open onClose={() => {}} />)
    expect(es).toContain('role="progressbar"')
    expect(es).toContain('aria-valuenow="33"')
    expect(es).toContain('Paso 1 de 3')
    expect(es).toContain('Saltar')
    expect(es).toContain('Hola, soy Ether')
    const en = wrap(<OnboardingDialog open onClose={() => {}} />, 'en')
    expect(en).toContain('Step 1 of 3')
    expect(en).toContain('Skip')
  })
})

describe('PersonalizePanel', () => {
  test('ofrece abrir el onboarding y resume lo elegido', () => {
    const html = wrap(<PersonalizePanel onOpen={() => {}} />)
    expect(html).toContain('Personalizar a Ether')
    expect(html).toContain(
      'Tono: neutro. Respuestas: equilibrado. Color: violeta.',
    )
  })
})

describe('textos del onboarding', () => {
  test('cada opción tiene etiqueta y descripción en ES y EN', () => {
    const keys = [
      ...TONES.flatMap((v) => [`ask.onb.tone.${v}`, `ask.onb.tone.${v}.desc`]),
      ...LENGTHS.flatMap((v) => [
        `ask.onb.length.${v}`,
        `ask.onb.length.${v}.desc`,
      ]),
      ...ACCENTS.map((v) => `ask.onb.color.${v}`),
    ]
    for (const lang of ['es', 'en'] as const)
      for (const k of keys) {
        expect(
          MESSAGES[lang][k as keyof (typeof MESSAGES)['es']],
          k,
        ).toBeTruthy()
      }
  })
})
