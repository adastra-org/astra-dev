// Render de la tarjeta de herramienta y del lugar que ocupa en la respuesta. SSR a cadena.
import { describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { emptyTurn, type ToolRun, type Turn } from '@/lib/ask/store'
import { fromLint, fromRun, rejected } from '@/lib/ask/tool-result'
import { t, type UiLang } from '@/lib/i18n'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { TurnView } from './Conversation'
import { ToolStep } from './ToolStep'

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

const run = (over: Partial<ToolRun> = {}): ToolRun => ({
  round: 1,
  name: 'ejecutar',
  body: 'print(1 + 1)',
  at: 8,
  text: 'Probemos:',
  status: 'done',
  result: fromRun('ejecutar', {
    status: 'finished',
    outcome: { status: 'ok' },
    ms: 12,
    lines: ['2'],
  }),
  ...over,
})

describe('ToolStep', () => {
  test('ok: code, state, output and duration', () => {
    const html = wrap(<ToolStep run={run()} />)
    expect(html).toContain('Código ejecutado')
    expect(html).toContain('print(1 + 1)')
    expect(html).toContain('Listo')
    expect(html).toContain('12 ms')
    expect(html).toContain('>2</pre>')
  })

  test('an error shows the line and the message', () => {
    const html = wrap(
      <ToolStep
        run={run({
          result: fromRun('ejecutar', {
            status: 'finished',
            outcome: { status: 'error', message: 'snippet:3: boom', line: 3 },
            ms: 2,
            lines: [],
          }),
        })}
      />,
    )
    expect(html).toContain('Error en la línea 3')
    expect(html).toContain('snippet:3: boom')
  })

  test('running shows a status and no result yet', () => {
    const html = wrap(
      <ToolStep run={run({ status: 'running', result: null })} />,
    )
    expect(html).toContain('Ejecutando código')
    expect(html).toContain('role="status"')
    expect(html).toContain('Ejecutando…')
  })

  test('the model code is text: markup in it is escaped', () => {
    const html = wrap(
      <ToolStep
        run={run({ body: '<img src=x onerror=alert(1)><script>x</script>' })}
      />,
    )
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img')
  })

  test('markup in the output and in the error is escaped too', () => {
    const html = wrap(
      <ToolStep
        run={run({
          result: fromRun('ejecutar', {
            status: 'finished',
            outcome: {
              status: 'error',
              message: 'snippet:1: <b onclick=x>',
              line: 1,
            },
            ms: 1,
            lines: ['<script>alert(1)</script>'],
          }),
        })}
      />,
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b onclick')
  })

  test('limit and rejected read in plain words', () => {
    const limit = wrap(
      <ToolStep
        run={run({
          result: fromRun('ejecutar', {
            status: 'finished',
            outcome: { status: 'limit', reason: 'instructions' },
            ms: 3000,
            lines: [],
          }),
        })}
      />,
    )
    expect(limit).toContain('bucle infinito')
    const rej = wrap(
      <ToolStep run={run({ result: rejected('ejecutar', 'body_too_long') })} />,
    )
    expect(rej).toContain('No se pudo ejecutar (body_too_long)')
  })

  test('check: findings with line and column', () => {
    const html = wrap(
      <ToolStep
        run={run({
          name: 'check',
          body: 'local x',
          result: fromLint(
            'check',
            [
              {
                severity: 'error',
                line: 4,
                column: 1,
                message: 'unexpected symbol',
              },
              { severity: 'warning', line: 1, column: 6, message: 'sin usar' },
            ],
            2,
          ),
        })}
      />,
    )
    expect(html).toContain('Código revisado')
    expect(html).toContain('4:1')
    expect(html).toContain('unexpected symbol')
    expect(html).toContain('1:6')
  })

  test('check without findings says so', () => {
    const html = wrap(
      <ToolStep
        run={run({ name: 'check', result: fromLint('check', [], 1) })}
      />,
    )
    expect(html).toContain('Sin observaciones')
  })

  test('English', () => {
    expect(wrap(<ToolStep run={run()} />, 'en')).toContain('Code run')
  })
})

describe('TurnView with tool calls', () => {
  const turn = (over: Partial<Turn> = {}): Turn => ({
    ...emptyTurn(1, 'probá'),
    status: 'done',
    text: 'Probemos:\nListo, dio 2.',
    tools: [run({ at: 10 })],
    ...over,
  })

  test('text, then the card, then the text, in that order', () => {
    const html = wrap(<TurnView turn={turn()} isLast locked={false} />)
    const a = html.indexOf('Probemos:')
    const c = html.indexOf('Código ejecutado')
    const b = html.indexOf('Listo, dio 2.')
    expect(a).toBeGreaterThan(-1)
    expect(c).toBeGreaterThan(a)
    expect(b).toBeGreaterThan(c)
  })

  test('the owner confirmation shows Seguir, disabled while something runs', () => {
    const ok = wrap(
      <TurnView
        turn={turn({ confirm: { rounds: 8 } })}
        isLast
        locked={false}
      />,
    )
    expect(ok).toContain('8 pasos con herramientas')
    expect(ok).toContain('Seguir')
    const locked = wrap(
      <TurnView turn={turn({ confirm: { rounds: 8 } })} isLast locked />,
    )
    expect(locked).toMatch(/<button[^>]*disabled[^>]*>Seguir/)
  })

  test('no Seguir without a confirmation', () => {
    expect(
      wrap(<TurnView turn={turn()} isLast locked={false} />),
    ).not.toContain('Seguir')
  })

  test('lua blocks get Ejecutar only when the answer is finished', () => {
    const text = 'Mirá:\n```lua\nprint(1)\n```\n'
    const done = wrap(
      <TurnView turn={turn({ text, tools: [] })} isLast locked={false} />,
    )
    expect(done).toContain('Ejecutar')
    const live = wrap(
      <TurnView
        turn={turn({ text, tools: [], status: 'streaming' })}
        isLast
        locked
      />,
    )
    expect(live).not.toContain('Ejecutar')
    const js = wrap(
      <TurnView
        turn={turn({ text: '```js\nx()\n```', tools: [] })}
        isLast
        locked={false}
      />,
    )
    expect(js).not.toContain('Ejecutar')
  })
})
