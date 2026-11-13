// La tarjeta de memoria del modelo y la marca en el panel (SSR a cadena, sin navegador).
import { afterEach, describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { memoryStore } from '@/lib/ask/memories'
import { rejected, succeeded } from '@/lib/ask/tool-result'
import type { ToolRun } from '@/lib/ask/store'
import { t, type UiLang } from '@/lib/i18n'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { MemoriesPanel } from './MemoriesPanel'
import { MemoryStep } from './MemoryStep'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})
const wrap = (node: React.ReactNode, lang: UiLang = 'es') =>
  renderToString(
    <LangContext.Provider value={value(lang)}>{node}</LangContext.Provider>,
  )

const run = (over: Partial<ToolRun> = {}): ToolRun => ({
  round: 1,
  name: 'guardar_memoria',
  body: 'Prefiero respuestas cortas',
  at: 0,
  text: '',
  status: 'running',
  result: null,
  proposal: { action: 'save', text: 'Prefiero respuestas cortas' },
  ...over,
})

describe('MemoryStep', () => {
  test('pending: shows what would be saved with Guardar and Descartar', () => {
    const out = wrap(<MemoryStep turnId={1} run={run()} />)
    expect(out).toContain('Ether quiere recordar')
    expect(out).toContain('value="Prefiero respuestas cortas"')
    expect(out).toContain('Guardar')
    expect(out).toContain('Descartar')
    expect(out).toContain('maxLength="280"')
  })

  test('the model text is a value/text, never markup', () => {
    const evil = '<img src=x onerror=alert(1)><b>hola</b>'
    const pending = wrap(
      <MemoryStep
        turnId={1}
        run={run({ proposal: { action: 'save', text: evil } })}
      />,
    )
    expect(pending).not.toContain('<img')
    const finished = wrap(
      <MemoryStep
        turnId={1}
        run={run({
          body: evil,
          status: 'done',
          proposal: null,
          result: succeeded('guardar_memoria', '1 memories, 1 active'),
        })}
      />,
    )
    expect(finished).not.toContain('<img')
    expect(finished).toContain('&lt;img')
  })

  test('edit shows before, delete shows only the old text and a Borrar button', () => {
    const edit = wrap(
      <MemoryStep
        turnId={1}
        run={run({
          name: 'editar_memoria',
          proposal: { action: 'edit', text: 'nuevo', before: 'viejo' },
        })}
      />,
    )
    expect(edit).toContain('Ether quiere cambiar una memoria')
    expect(edit).toContain('viejo')
    expect(edit).toContain('Cambiar')
    const del = wrap(
      <MemoryStep
        turnId={1}
        run={run({
          name: 'borrar_memoria',
          proposal: { action: 'delete', text: '', before: 'viejo' },
        })}
      />,
    )
    expect(del).toContain('Ether quiere olvidar una memoria')
    expect(del).toContain('Borrar')
    expect(del).not.toContain('<input')
  })

  test('finished: saved, discarded and rejected each read differently', () => {
    const base = { status: 'done' as const, proposal: null }
    const saved = wrap(
      <MemoryStep
        turnId={1}
        run={run({
          ...base,
          result: succeeded('guardar_memoria', '1 memories, 1 active'),
        })}
      />,
    )
    expect(saved).toContain('Ether recordó')
    expect(saved).toContain('Guardada en tus memorias.')
    const discarded = wrap(
      <MemoryStep
        turnId={1}
        run={run({
          ...base,
          result: rejected('guardar_memoria', 'discarded'),
        })}
      />,
    )
    expect(discarded).toContain('Ether quiso recordar')
    expect(discarded).toContain('Descartada: no se cambió nada.')
    const full = wrap(
      <MemoryStep
        turnId={1}
        run={run({
          ...base,
          result: rejected('guardar_memoria', 'max_items'),
        })}
      />,
    )
    expect(full).toContain('ya hay 12 memorias')
  })

  test('an unknown reason code from the result is shown as a generic one', () => {
    const out = wrap(
      <MemoryStep
        turnId={1}
        run={run({
          status: 'done',
          proposal: null,
          result: rejected('guardar_memoria', '<script>x</script>'),
        })}
      />,
    )
    expect(out).not.toContain('<script>')
    expect(out).toContain('rechazada')
  })

  test('English dictionary', () => {
    expect(wrap(<MemoryStep turnId={1} run={run()} />, 'en')).toContain(
      'Ether wants to remember',
    )
  })
})

describe('MemoriesPanel: model memories', () => {
  // `memoryStore` is a singleton shared by every test file of the run: leave it as found, or
  // memories-panel.test.tsx (which expects an empty store) breaks depending on file order.
  afterEach(() => {
    for (const m of [...memoryStore.getState().items]) memoryStore.remove(m.id)
    memoryStore.dismissRemoved()
    memoryStore.setAuto(false)
  })

  test('a discrete mark on the ones Ether saved, and the off-by-default switch', () => {
    memoryStore.add('mía')
    memoryStore.add('de Ether', 'model')
    const out = wrap(<MemoriesPanel />)
    expect(out.match(/>Ether</g)).toHaveLength(1)
    expect(out).toContain('Permitir que Ether recuerde sin preguntar')
    expect(out).toMatch(/aria-labelledby="ask-memories-auto"[^>]*/)
    expect(out).toContain('aria-checked="false"')
  })
})
