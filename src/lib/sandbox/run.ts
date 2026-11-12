// Cliente del sandbox: lanza un worker por ejecución, lo vigila y lo mata si no termina. Todo se
// carga bajo demanda (este módulo lo importa dinámicamente el botón "Ejecutar").
import { LIMITS } from './limits.ts'
import { parseWorkerMessage, type ToWorker } from './protocol.ts'
import type { RunOutcome } from './runner.ts'
import { capWasmMemory } from './wasm-patch.ts'
import wasmUrl from 'wasmoon/dist/glue.wasm?url'

export type RunResult =
  | { status: 'finished'; outcome: RunOutcome; ms: number; lines: string[] }
  | { status: 'timeout'; ms: number; lines: string[] }
  | { status: 'cancelled'; ms: number; lines: string[] }
  | { status: 'crash'; message: string; ms: number; lines: string[] }

export interface RunHandle {
  result: Promise<RunResult>
  /** Mata el worker ya. */
  cancel: () => void
}

let wasm: Promise<Uint8Array<ArrayBuffer>> | undefined

/** El wasm de la VM, con el tope de memoria aplicado. Se descarga una sola vez. */
function loadWasm(): Promise<Uint8Array<ArrayBuffer>> {
  wasm ??= fetch(wasmUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`no se pudo cargar el runtime (${r.status})`)
      return r.arrayBuffer()
    })
    .then((buf) => capWasmMemory(new Uint8Array(buf), LIMITS.memoryPages))
    .catch((e) => {
      wasm = undefined
      throw e
    })
  return wasm
}

export function runLua(
  code: string,
  onLine: (line: string, all: readonly string[]) => void = () => {},
): RunHandle {
  let cancel = () => {}
  const result = new Promise<RunResult>((resolve) => {
    const lines: string[] = []
    let bytes = 0
    const t0 = performance.now()
    const elapsed = () => performance.now() - t0
    let worker: Worker | undefined
    let startup: ReturnType<typeof setTimeout> | undefined
    let kill: ReturnType<typeof setTimeout> | undefined
    let settled = false

    const finish = (r: RunResult) => {
      if (settled) return
      settled = true
      clearTimeout(startup)
      clearTimeout(kill)
      worker?.terminate()
      resolve(r)
    }
    cancel = () => finish({ status: 'cancelled', ms: elapsed(), lines })

    if (new TextEncoder().encode(code).length > LIMITS.maxCodeBytes)
      return finish({
        status: 'finished',
        outcome: { status: 'limit', reason: 'memory' },
        ms: 0,
        lines,
      })

    loadWasm().then(
      (bytesWasm) => {
        if (settled) return
        worker = new Worker(new URL('./lua.worker.ts', import.meta.url), {
          type: 'module',
          name: 'astra-lua-sandbox',
        })
        startup = setTimeout(
          () =>
            finish({
              status: 'crash',
              message: 'El runtime no arrancó a tiempo',
              ms: elapsed(),
              lines,
            }),
          LIMITS.startupMs,
        )
        worker.onerror = (e) => {
          e.preventDefault()
          finish({
            status: 'crash',
            message: 'El worker falló',
            ms: elapsed(),
            lines,
          })
        }
        worker.onmessageerror = () =>
          finish({
            status: 'crash',
            message: 'Mensaje ilegible del worker',
            ms: elapsed(),
            lines,
          })
        let runStart = 0
        worker.onmessage = (e: MessageEvent) => {
          const msg = parseWorkerMessage(e.data)
          if (!msg || settled) return
          if (msg.type === 'started') {
            clearTimeout(startup)
            runStart = performance.now()
            // Mata el worker aunque esté dentro de una llamada C que el hook no ve.
            kill = setTimeout(
              () =>
                finish({
                  status: 'timeout',
                  ms: performance.now() - runStart,
                  lines,
                }),
              LIMITS.timeoutMs + LIMITS.killGraceMs,
            )
          } else if (msg.type === 'out') {
            bytes += msg.line.length + 1
            // Una VM comprometida podría inundar: pasado el tope se corta el worker.
            if (bytes > LIMITS.maxOutputBytes * 2)
              return finish({
                status: 'finished',
                outcome: { status: 'limit', reason: 'output' },
                ms: performance.now() - runStart,
                lines,
              })
            if (bytes <= LIMITS.maxOutputBytes) {
              lines.push(msg.line)
              onLine(msg.line, lines)
            }
          } else {
            finish({
              status: 'finished',
              outcome: msg.outcome,
              ms: msg.ms,
              lines,
            })
          }
        }
        const run: ToWorker = { type: 'run', code, wasm: bytesWasm }
        worker.postMessage(run)
      },
      (e: unknown) =>
        finish({
          status: 'crash',
          message:
            e instanceof Error ? e.message : 'No se pudo cargar el runtime',
          ms: elapsed(),
          lines,
        }),
    )
  })
  return { result, cancel: () => cancel() }
}
