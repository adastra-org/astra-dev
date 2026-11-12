// Worker de lint y formato. Corre StyLua (WASM) y luaparse fuera del hilo de la página: ninguno
// ejecuta el código, solo lo parsea, pero un parser también puede colgarse con una entrada rara y
// por eso el cliente (`tools.ts`) lo mata si tarda. Se carga solo al pulsar Revisar o Formatear.
import init, * as stylua from '@johnnymorganz/stylua/web'
import styluaWasm from '@johnnymorganz/stylua/stylua_lib_bg.wasm?url'
import { formatLua, type Stylua } from './format.ts'
import { lintLua } from './lint.ts'
import type { ToolsRequest, ToolsResponse } from './tools-protocol.ts'

const ctx = self as unknown as {
  postMessage(message: ToolsResponse): void
  onmessage: ((e: MessageEvent<ToolsRequest>) => void) | null
}

let ready: Promise<unknown> | undefined

ctx.onmessage = async (e) => {
  const req = e.data
  if (req?.op !== 'format' && req?.op !== 'lint') return
  if (typeof req.code !== 'string') return
  try {
    if (req.op === 'lint') {
      ctx.postMessage({ op: 'lint', diagnostics: lintLua(req.code) })
      return
    }
    ready ??= init({ module_or_path: styluaWasm })
    await ready
    const result = formatLua(req.code, stylua as unknown as Stylua)
    ctx.postMessage({ op: 'format', result })
  } catch (error) {
    ctx.postMessage({
      op: 'failed',
      message: error instanceof Error ? error.message : 'Falló la herramienta',
    })
  }
}
