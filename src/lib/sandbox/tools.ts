// Cliente de lint y formato: un worker por llamada, con tiempo máximo. Se importa bajo demanda.
import type { Diagnostic } from './lint.ts'
import type { ToolsRequest, ToolsResponse } from './tools-protocol.ts'

const TOOLS_TIMEOUT_MS = 8000
const MAX_DIAGNOSTICS = 50

export type ToolResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string }

function callTool(req: ToolsRequest): Promise<ToolsResponse> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./tools.worker.ts', import.meta.url), {
      type: 'module',
      name: 'astra-lua-tools',
    })
    const done = (fn: () => void) => {
      clearTimeout(timer)
      worker.terminate()
      fn()
    }
    const timer = setTimeout(
      () => done(() => reject(new Error('La herramienta tardó demasiado'))),
      TOOLS_TIMEOUT_MS,
    )
    worker.onmessage = (e: MessageEvent) =>
      done(() => resolve(e.data as ToolsResponse))
    worker.onerror = (e) => {
      e.preventDefault()
      done(() => reject(new Error('La herramienta falló')))
    }
    worker.postMessage(req)
  })
}

const isDiagnostic = (d: unknown): d is Diagnostic => {
  if (typeof d !== 'object' || d === null) return false
  const x = d as Record<string, unknown>
  return (
    (x.severity === 'error' || x.severity === 'warning') &&
    typeof x.line === 'number' &&
    typeof x.column === 'number' &&
    typeof x.message === 'string'
  )
}

export async function lint(code: string): Promise<ToolResult<Diagnostic[]>> {
  try {
    const r = await callTool({ op: 'lint', code })
    if (r.op === 'lint' && Array.isArray(r.diagnostics))
      return {
        ok: true,
        value: r.diagnostics
          .filter(isDiagnostic)
          .slice(0, MAX_DIAGNOSTICS)
          .map((d) => ({ ...d, message: d.message.slice(0, 300) })),
      }
    return {
      ok: false,
      message: r.op === 'failed' ? r.message : 'Respuesta inesperada',
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Falló' }
  }
}

export type FormatOutcome =
  | { formatted: true; code: string }
  | { formatted: false; diagnostic: Diagnostic }

export async function format(code: string): Promise<ToolResult<FormatOutcome>> {
  try {
    const r = await callTool({ op: 'format', code })
    if (r.op === 'format') {
      if (r.result.ok && typeof r.result.code === 'string')
        return { ok: true, value: { formatted: true, code: r.result.code } }
      if (!r.result.ok && isDiagnostic(r.result.diagnostic))
        return {
          ok: true,
          value: { formatted: false, diagnostic: r.result.diagnostic },
        }
    }
    return {
      ok: false,
      message: r.op === 'failed' ? r.message : 'Respuesta inesperada',
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Falló' }
  }
}
