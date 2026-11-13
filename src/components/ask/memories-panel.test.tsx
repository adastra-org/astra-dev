// Render del panel de memorias (SSR a cadena, sin navegador). Sin `localStorage` en bun el store
// cae a memoria de sesión: es justo el caso de "no se puede guardar" y se verifica el aviso.
import { describe, expect, test } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { memoryStore } from '@/lib/ask/memories'
import { t, type UiLang } from '@/lib/i18n'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { MemoriesPanel } from './MemoriesPanel'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})

const html = (lang: UiLang = 'es') =>
  renderToString(
    <LangContext.Provider value={value(lang)}>
      <MemoriesPanel />
    </LangContext.Provider>,
  )

describe('MemoriesPanel', () => {
  test('vacío: explica qué son y avisa que no se puede guardar sin localStorage', () => {
    const out = html()
    expect(out).toContain('Memorias')
    expect(out).toContain('Todavía no hay memorias.')
    expect(out).toContain('solo en este navegador')
    expect(out).toContain('No se pueden guardar en este navegador')
    expect(out).toContain('aria-label="Nueva memoria"')
  })

  test('lista con interruptor accesible, editar y borrar con nombre', () => {
    memoryStore.add('Responde corto')
    memoryStore.add('Uso <Windows>')
    memoryStore.toggle(memoryStore.getState().items[1]!.id)
    const out = html()
    expect(out).toContain('role="switch"')
    expect(out).toContain('aria-checked="true"')
    expect(out).toContain('aria-checked="false"')
    expect(out).toContain('1 activas de 2')
    expect(out).toContain('Editar: Responde corto')
    expect(out).toContain('Borrar: Responde corto')
    // El texto de la persona sale escapado.
    expect(out).toContain('Uso &lt;Windows&gt;')
    expect(out).not.toContain('<Windows>')
  })

  test('en inglés usa el diccionario en inglés', () => {
    const out = html('en')
    expect(out).toContain('Memories')
    expect(out).toContain('They stay in this browser only.')
  })

  test('borrar deja el aviso con Deshacer', () => {
    memoryStore.remove(memoryStore.getState().items[0]!.id)
    const out = html()
    expect(out).toContain('Memoria borrada.')
    expect(out).toContain('Deshacer')
  })
})
