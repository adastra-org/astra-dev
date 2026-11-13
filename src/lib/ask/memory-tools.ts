// Herramientas del modelo para sus propias memorias (#41): guardar, editar, borrar. Corren en el
// CLIENTE: las memorias viven solo en `localStorage` y el server nunca las guarda. El modelo no
// escribe nada por su cuenta: cada escritura es una PROPUESTA que el usuario acepta o descarta
// (la tarjeta de `MemoryStep`), salvo que él active "recordar sin preguntar", y aun así borrar
// y reescribir lo que escribió el usuario preguntan siempre. Todo el texto del modelo es no
// confiable: se normaliza, tiene los topes de F3 y nunca se interpreta. Plan: docs/chat/README.md.
import {
  memoryStore,
  normalizeText,
  type MemoryFailure,
  type MemoryRef,
  type MemorySource,
  type MemoryStore,
} from './memories'
import { rejected, succeeded, type ToolResult } from './tool-result'

export const MEMORY_TOOLS = [
  'guardar_memoria',
  'editar_memoria',
  'borrar_memoria',
] as const
export type MemoryToolName = (typeof MEMORY_TOOLS)[number]

export const isMemoryTool = (name: string): name is MemoryToolName =>
  (MEMORY_TOOLS as readonly string[]).includes(name)

/** Escrituras de memoria que el modelo puede proponer en una sola respuesta (las descartadas cuentan). */
export const MAX_MEMORY_WRITES = 3

/** Lo que el usuario ve antes de decidir. */
export interface MemoryProposal {
  action: 'save' | 'edit' | 'delete'
  /** Texto que se guardaría (vacío al borrar). El usuario puede cambiarlo antes de aceptar. */
  text: string
  /** Texto actual de la memoria que se edita o borra. */
  before?: string
}

export type MemoryDecision = { ok: true; text: string } | { ok: false }

/** Lo que el store le da a la herramienta en esta llamada. */
export interface MemoryToolContext {
  /** Las memorias que viajaron con este envío, por posición (el modelo las ve numeradas desde 1). */
  refs: readonly MemoryRef[]
  /** Escrituras de memoria que el modelo ya propuso antes en esta respuesta. */
  priorWrites: number
  /** Pide la decisión del usuario. Se resuelve con `ok:false` si se detiene la respuesta. */
  confirm(p: MemoryProposal): Promise<MemoryDecision>
}

/** Códigos fijos que ve el modelo (y el usuario, traducidos). Nunca texto de memorias. */
export type MemoryReason =
  | MemoryFailure
  | 'bad_format'
  | 'changed'
  | 'discarded'
  | 'too_many_writes'
  | 'unavailable'

export interface MemoryToolRun {
  name: MemoryToolName
  /** Mismo tope que el server (`TOOLS[x].bodyMax`): un cuerpo más largo ni se corre. */
  bodyMax: number
  run(body: string, ctx: { memory?: MemoryToolContext }): Promise<ToolResult>
}

const NUM = /^\s*(\d{1,2})\s*$/
const EDIT = /^\s*(\d{1,2})[ \t]*\r?\n([\s\S]+)$/

export function createMemoryTools(
  store: MemoryStore = memoryStore,
): Record<MemoryToolName, MemoryToolRun> {
  type Target = { id: string; text: string; source: MemorySource }

  /** El número del modelo → la memoria de la foto del envío, si sigue igual. */
  function resolve(n: number, ctx: MemoryToolContext): Target | MemoryReason {
    const ref = ctx.refs[n - 1]
    if (!ref) return 'not_found'
    const cur = store.getState().items.find((m) => m.id === ref.id)
    if (!cur) return 'not_found'
    if (cur.text !== ref.text) return 'changed'
    return { id: cur.id, text: cur.text, source: cur.source }
  }

  const no = (tool: MemoryToolName, reason: MemoryReason) =>
    rejected(tool, reason)

  function gate(tool: MemoryToolName, ctx: MemoryToolContext | undefined) {
    if (!ctx) return no(tool, 'unavailable')
    if (ctx.priorWrites >= MAX_MEMORY_WRITES) return no(tool, 'too_many_writes')
    return null
  }

  /** Solo contadores: el resultado vuelve al modelo y al server, y no lleva texto de memorias. */
  const counts = () => {
    const items = store.getState().items
    return `${items.length} memories, ${items.filter((m) => m.enabled).length} active`
  }

  return {
    guardar_memoria: {
      name: 'guardar_memoria',
      bodyMax: 600,
      async run(body, { memory }) {
        const name = 'guardar_memoria'
        const g = gate(name, memory)
        if (g) return g
        const text = normalizeText(body)
        const can = store.canAdd(text)
        if (!can.ok) return no(name, can.reason)
        let final = text
        if (!store.getState().auto) {
          const d = await memory!.confirm({ action: 'save', text })
          if (!d.ok) return no(name, 'discarded')
          final = d.text
        }
        const r = store.add(final, 'model')
        return r.ok ? succeeded(name, counts()) : no(name, r.reason)
      },
    },
    editar_memoria: {
      name: 'editar_memoria',
      bodyMax: 600,
      async run(body, { memory }) {
        const name = 'editar_memoria'
        const g = gate(name, memory)
        if (g) return g
        const ctx = memory!
        const m = EDIT.exec(body)
        if (!m) return no(name, 'bad_format')
        const n = Number(m[1])
        const target = resolve(n, ctx)
        if (typeof target === 'string') return no(name, target)
        const text = normalizeText(m[2]!)
        const can = store.canEdit(target.id, text)
        if (!can.ok) return no(name, can.reason)
        let final = text
        // Sin preguntar solo sobre lo que el propio modelo escribió: lo del usuario siempre se confirma.
        if (!(store.getState().auto && target.source === 'model')) {
          const d = await ctx.confirm({
            action: 'edit',
            text,
            before: target.text,
          })
          if (!d.ok) return no(name, 'discarded')
          final = d.text
        }
        // El usuario pudo tocar la memoria mientras decidía: se vuelve a comprobar.
        const again = resolve(n, ctx)
        if (typeof again === 'string') return no(name, again)
        const r = store.edit(target.id, final, 'model')
        return r.ok ? succeeded(name, counts()) : no(name, r.reason)
      },
    },
    borrar_memoria: {
      name: 'borrar_memoria',
      bodyMax: 8,
      async run(body, { memory }) {
        const name = 'borrar_memoria'
        const g = gate(name, memory)
        if (g) return g
        const ctx = memory!
        const m = NUM.exec(body)
        if (!m) return no(name, 'bad_format')
        const n = Number(m[1])
        const target = resolve(n, ctx)
        if (typeof target === 'string') return no(name, target)
        // Borrar siempre pregunta, también con "recordar sin preguntar".
        const d = await ctx.confirm({
          action: 'delete',
          text: '',
          before: target.text,
        })
        if (!d.ok) return no(name, 'discarded')
        const again = resolve(n, ctx)
        if (typeof again === 'string') return no(name, again)
        const r = store.remove(target.id)
        return r.ok ? succeeded(name, counts()) : no(name, r.reason)
      },
    },
  }
}
