// Pasos y razonamiento del chat: parser, reducer, textos en los dos idiomas y render de Activity.
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { orbState } from '@/lib/ask/orb-state'
import { SseParser } from '@/lib/ask/sse'
import { applyEvent, emptyTurn, historyFor, type Turn } from '@/lib/ask/store'
import { stepLabel } from '@/lib/ask/steps'
import type { AskStep } from '@/lib/ask/types'
import { t, type UiLang } from '@/lib/i18n'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { Activity } from './Activity'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})

const STEPS: AskStep[] = [
  { id: 'history', ms: 12, usedHistory: false },
  { id: 'search', ms: 140, mode: 'semantic', docs: 5, natives: 3 },
  { id: 'gate', ms: 90, kept: 3, total: 8 },
]

const render = (turn: Turn, lang: UiLang = 'es') =>
  renderToString(
    <LangContext.Provider value={value(lang)}>
      <Activity turn={turn} />
    </LangContext.Provider>,
  )

describe('eventos step y thinking', () => {
  test('el parser los reconoce', () => {
    const p = new SseParser()
    const out = p.push(
      'event: step\ndata: {"step":{"id":"gate","ms":4,"kept":1,"total":2}}\n\n' +
        'event: thinking\ndata: {"text":"Miro la fuente 1."}\n\n',
    )
    expect(out).toEqual([
      { type: 'step', step: { id: 'gate', ms: 4, kept: 1, total: 2 } },
      { type: 'thinking', text: 'Miro la fuente 1.' },
    ])
  })

  test('el reducer acumula pasos en orden y el razonamiento sin tocar la respuesta', () => {
    let turn = emptyTurn(1, 'q')
    for (const step of STEPS) turn = applyEvent(turn, { type: 'step', step })
    turn = applyEvent(turn, { type: 'thinking', text: 'Veo ' })
    turn = applyEvent(turn, { type: 'thinking', text: 'el slot.' })
    expect(turn.steps.map((s) => s.id)).toEqual(['history', 'search', 'gate'])
    expect(turn.thinking).toBe('Veo el slot.')
    expect(turn.text).toBe('')
    expect(turn.status).toBe('waiting')
  })

  test('el razonamiento no entra al historial de la conversación', () => {
    const turn = {
      ...emptyTurn(1, 'q'),
      status: 'done' as const,
      text: 'respuesta',
      thinking: 'secreto del razonamiento',
    }
    expect(JSON.stringify(historyFor([turn]))).not.toContain('secreto')
  })
})

describe('stepLabel en los dos idiomas', () => {
  test('cada paso tiene texto propio, sin claves crudas, y cambia con el idioma', () => {
    const all: AskStep[] = [
      ...STEPS,
      { id: 'history', ms: 3, usedHistory: true },
      { id: 'search', ms: 1, mode: 'keyword', docs: 0, natives: 0 },
      { id: 'cache', ms: 0 },
    ]
    for (const s of all) {
      const es = stepLabel(s, (k, v) => t('es', k, v))
      const en = stepLabel(s, (k, v) => t('en', k, v))
      expect(es).not.toMatch(/^ask\.|\{/)
      expect(en).not.toMatch(/^ask\.|\{/)
      expect(es, s.id).not.toBe(en)
    }
    expect(stepLabel(STEPS[2]!, (k, v) => t('es', k, v))).toBe(
      'Filtro de contexto: 3 de 8 fragmentos',
    )
  })
})

describe('Activity', () => {
  test('sin pasos ni razonamiento no pinta nada', () => {
    expect(render(emptyTurn(1, 'q'))).toBe('')
  })

  test('esperando: un solo grupo abierto con pasos, estado y razonamiento adentro', () => {
    const html = render({
      ...emptyTurn(1, 'q'),
      steps: STEPS,
      thinking: 'Veo el slot anterior.',
    })
    expect(html).toContain('Búsqueda semántica: 5 docs, 3 natives')
    expect(html).toContain('140 ms')
    expect(html).toContain('Pensando…')
    expect(html).toContain('Veo el slot anterior.')
    // Un único disparador y el razonamiento dentro de la misma lista que los pasos.
    expect(html.match(/<button/g)?.length).toBe(1)
    expect(html).not.toContain('<details')
    expect(html).toContain('aria-expanded="true"')
    const list = html.slice(html.indexOf('<ol'), html.indexOf('</ol>'))
    expect(list).toContain('Razonamiento del modelo')
    expect(list).toContain('Filtro de contexto')
  })

  test('escribiendo: pasa de pensar a escribir', () => {
    const html = render({
      ...emptyTurn(1, 'q'),
      status: 'streaming',
      steps: STEPS,
      thinking: 'x',
      text: 'La respuesta',
    })
    expect(html).toContain('Escribiendo la respuesta…')
    expect(html).not.toContain('Pensando…')
  })

  test('terminado: compacto, con resumen de una línea', () => {
    const turn = {
      ...emptyTurn(1, 'q'),
      status: 'done' as const,
      steps: STEPS,
      thinking: 'x',
      text: 'ok',
      timing: { startedAt: 1000, firstDeltaAt: 1500, doneAt: 2230 },
    }
    const en = render(turn, 'en')
    expect(en).toContain('3 steps · reasoning · 1.2 s')
    expect(en).toContain('aria-expanded="false"')
    expect(en).toContain('inert')
    expect(en).not.toContain('Writing the answer…')
    expect(render(turn)).toContain('3 pasos · razonamiento · 1,2 s')
  })

  test('sin razonamiento (público) el resumen solo cuenta pasos', () => {
    const html = render({
      ...emptyTurn(1, 'q'),
      status: 'done',
      steps: [STEPS[0]!],
      text: 'ok',
    })
    expect(html).toContain('1 paso<')
    expect(html).not.toContain('razonamiento')
    expect(html).not.toContain('Razonamiento del modelo')
  })

  test('el razonamiento es texto plano: el HTML se escapa', () => {
    const html = render({
      ...emptyTurn(1, 'q'),
      steps: STEPS,
      thinking: '<img src=x onerror=alert(1)>',
    })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('orbe de Ether', () => {
  test('el estado sigue al turno: esperar es pensar, responder es hablar', () => {
    expect(orbState('waiting')).toBe('thinking')
    expect(orbState('streaming')).toBe('speaking')
    expect(orbState('error')).toBe('error')
    expect(orbState('done')).toBe('idle')
    expect(orbState(undefined)).toBe('idle')
  })
})
