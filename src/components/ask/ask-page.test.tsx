// Render de las piezas que comparten el panel y la página: medidor de contexto, acciones de cada
// pregunta (bloqueadas mientras responde) y la línea de velocidad. Sin navegador: SSR a cadena.
import { describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { contextUsage } from '@/lib/ask/budget'
import { emptyTurn, type Turn } from '@/lib/ask/store'
import { turnStatusText } from '@/lib/ask/status'
import { t, type UiLang } from '@/lib/i18n'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { ContextBudget } from './ContextBudget'
import { Transcript, TurnView } from './Conversation'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})

const wrap = (node: ReactNode, lang: UiLang = 'es') =>
  renderToString(
    <MemoryRouter>
      <LangContext.Provider value={value(lang)}>{node}</LangContext.Provider>
    </MemoryRouter>,
  )

const done = (over: Partial<Turn> = {}): Turn => ({
  ...emptyTurn(1, 'como hago un rollback'),
  status: 'done',
  text: 'Respuesta.',
  usage: { inputTokens: 500, outputTokens: 100 },
  timing: { startedAt: 100, firstDeltaAt: 350, doneAt: 2350 },
  ...over,
})

describe('ContextBudget', () => {
  test('sin ventana, sin envío o con medida: tres textos distintos', () => {
    expect(wrap(<ContextBudget usage={null} />)).toContain(
      'después de la primera respuesta',
    )
    expect(wrap(<ContextBudget usage={null} />)).toContain(
      'después de la primera respuesta',
    )
    const u = contextUsage([done()], 1000, '')
    const html = wrap(<ContextBudget usage={u} />)
    expect(html).toContain('role="meter"')
    expect(html).toContain('aria-valuenow="600"')
    expect(html).toContain('600 de 1000 tokens')
  })

  test('warn y full se dicen con texto, no solo con color', () => {
    const warn = contextUsage(
      [done({ usage: { inputTokens: 850, outputTokens: 0 } })],
      1000,
      '',
    )
    expect(wrap(<ContextBudget usage={warn} />)).toContain('Cerca del límite')
    const full = contextUsage(
      [done({ usage: { inputTokens: 1200, outputTokens: 0 } })],
      1000,
      '',
    )
    expect(wrap(<ContextBudget usage={full} />)).toContain('No hay lugar')
  })

  test('el uso estimado por el server se aclara', () => {
    const u = contextUsage([done({ usageEstimated: true })], 8192, '')
    expect(wrap(<ContextBudget usage={u} />)).toContain('es una estimación')
  })
})

describe('TurnView', () => {
  test('una respuesta terminada ofrece Editar y Reenviar', () => {
    const html = wrap(<TurnView turn={done()} isLast locked={false} />)
    expect(html).toContain('Editar')
    expect(html).toContain('Reenviar')
    expect(html).not.toContain('disabled=""')
  })

  test('mientras otra respuesta está en curso, las acciones quedan deshabilitadas', () => {
    const html = wrap(<TurnView turn={done()} isLast locked />)
    const disabled = html.match(/disabled=""/g) ?? []
    expect(disabled).toHaveLength(2)
  })

  test('una pregunta en curso no ofrece acciones', () => {
    const html = wrap(
      <TurnView turn={emptyTurn(2, 'pendiente')} isLast locked={false} />,
    )
    expect(html).not.toContain('Reenviar')
  })

  test('muestra primer texto y velocidad medidos', () => {
    const html = wrap(<TurnView turn={done()} isLast locked={false} />)
    // 100 tokens de salida en 2000 ms de texto: 50 tok/s; primer texto a 250 ms.
    expect(html).toContain('Primer texto a los 250 ms')
    expect(html).toContain('50 tokens por segundo')
  })

  test('una respuesta de caché no muestra velocidad', () => {
    const html = wrap(
      <TurnView turn={done({ cached: true })} isLast locked={false} />,
    )
    expect(html).not.toContain('tokens por segundo')
  })
})

describe('Transcript', () => {
  test('público sin conversación ve el aviso de acceso', () => {
    const html = wrap(<Transcript turns={[]} viewerRole="public" />)
    expect(html).toContain('Ask Ether es para suscriptores y staff.')
  })

  test('staff sin conversación ve la bienvenida y las sugerencias', () => {
    const html = wrap(<Transcript turns={[]} viewerRole="staff" />)
    expect(html).toContain('Pregunta en lenguaje natural')
    expect(html).toContain('Ejemplos de preguntas')
  })
})

describe('turnStatusText', () => {
  test('anuncia el estado de la última respuesta en los dos idiomas', () => {
    const es = (lang: UiLang) => value(lang).tr
    expect(turnStatusText(done({ cited: [1] }), es('es'))).toBe(
      'Respuesta lista, 1 fuente citada',
    )
    expect(turnStatusText(done({ cited: [] }), es('en'))).toBe('Answer ready')
    expect(turnStatusText(undefined, es('es'))).toBe('')
    expect(turnStatusText(done({ status: 'error' }), es('es'))).toBe('')
  })
})
