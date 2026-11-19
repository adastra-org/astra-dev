// Worker del sandbox: una VM por ejecución. El cliente (`run.ts`) lo crea, le manda el wasm ya
// parcheado y el código, y lo mata (`terminate`) si pasa el tiempo. No tiene acceso a la página.
//
// Defensa en profundidad: el snippet corre en Lua y Lua no ve nada de JS; aun así, antes de
// ejecutarlo se anulan las APIs de red y de almacenamiento de este worker, por si un fallo de la
// VM diera ejecución en JS. El wasm llega por mensaje, así que el worker no necesita `fetch`.
import { LIMITS } from './limits.ts'
import { runSnippet } from './runner.ts'
import type { ToClient, ToWorker } from './protocol.ts'

const ctx = self as unknown as {
  postMessage(message: ToClient): void
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
}
const post = ctx.postMessage.bind(ctx)

/** Quita del scope global todo lo que sirva para salir a la red o guardar datos. */
function lockdown() {
  const g = globalThis as Record<string, unknown>
  for (const name of [
    'fetch',
    'XMLHttpRequest',
    'WebSocket',
    'WebTransport',
    'EventSource',
    'importScripts',
    'indexedDB',
    'caches',
    'BroadcastChannel',
    'Worker',
    'SharedWorker',
    'RTCPeerConnection',
  ]) {
    try {
      Object.defineProperty(g, name, {
        value: undefined,
        writable: false,
        configurable: false,
      })
    } catch {
      // Propiedad no configurable en este navegador: se intenta al menos asignarla.
      try {
        g[name] = undefined
      } catch {
        // Nada más que hacer.
      }
    }
  }
}

let started = false

ctx.onmessage = (e) => {
  const msg = e.data
  if (started || msg?.type !== 'run') return
  started = true
  ctx.onmessage = null
  void execute(msg)
}

async function execute(msg: Extract<ToWorker, { type: 'run' }>) {
  // El glue de wasmoon pide su wasm con fetch(): se le responde con los bytes recibidos.
  const bytes = msg.wasm
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(bytes, { headers: { 'content-type': 'application/wasm' } }),
    )) as unknown as typeof fetch

  try {
    const report = await runSnippet({
      code: msg.code,
      wasm: 'astra-lua.wasm',
      emit: (line) => post({ type: 'out', line }),
      beforeRun: () => {
        lockdown()
        post({ type: 'started' })
      },
    })
    post({ type: 'done', outcome: report.outcome, ms: report.ms })
  } catch (error) {
    post({
      type: 'done',
      outcome: {
        status: 'error',
        message:
          error instanceof Error
            ? error.message.slice(0, LIMITS.maxErrorChars)
            : 'Error del runtime',
        line: null,
      },
      ms: 0,
    })
  }
}
