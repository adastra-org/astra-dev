// Núcleo de la ejecución: crea una VM Lua 5.4 (wasmoon), la limita y corre un snippet. No sabe de
// Workers ni del DOM: `lua.worker.ts` lo usa en el navegador y los tests lo usan directo.
//
// Defensas acá (las del Worker y el cliente están en `run.ts` y en docs/sandbox/README.md):
//   - Solo se abren base, coroutine, table, string, utf8, math y debug; esta se vuelve nil. `io`,
//     `os` y `package` no existen en la VM.
//   - Entorno con lista blanca; el snippet no recibe `_G` real, `load`, `require`, `dofile`...
//   - Hook de conteo en JS: instrucciones y tiempo. Se instala en el hilo principal y lo heredan
//     las corrutinas.
//   - El tope de memoria es del wasm (`capWasmMemory`), no del snippet.
import { LuaFactory } from 'wasmoon'
import { BOOTSTRAP } from './bootstrap.ts'
import { LIMIT_TAG, LIMITS, type LimitReason } from './limits.ts'

export type RunOutcome =
  | { status: 'ok' }
  | { status: 'error'; message: string; line: number | null }
  | { status: 'limit'; reason: LimitReason }

export interface RunReport {
  outcome: RunOutcome
  /** Milisegundos de ejecución del snippet (sin cargar el runtime). */
  ms: number
}

export interface RunOptions {
  code: string
  /** Ubicación del wasm de wasmoon, ya parcheado con `capWasmMemory`. */
  wasm: string
  /** Una línea de stdout. */
  emit: (line: string) => void
  /** Se llama con la VM lista y antes de ejecutar el snippet (el worker corta la red acá). */
  beforeRun?: () => void
}

const LUA_MASK_COUNT = 8
const REASONS: readonly LimitReason[] = [
  'time',
  'instructions',
  'memory',
  'output',
]

/** `snippet:12: mensaje` → línea 12. */
export function lineOf(message: string): number | null {
  const m = /(?:^|\n)\s*snippet:(\d+):/.exec(message)
  return m ? Number(m[1]) : null
}

/** Quita del traceback las líneas del bootstrap y del runtime, dejando las del snippet. */
export function cleanMessage(message: string): string {
  return message
    .split('\n')
    .filter(
      (l) =>
        !/^\s*\[C\]: in (?:function '(?:error|xpcall|pcall)'|\?)/.test(l) &&
        !/^\s*(?:\[string "[^"]*"\]|\?):/.test(l),
    )
    .join('\n')
    .trim()
}

function limitOf(message: string): LimitReason | null {
  const m = new RegExp(`${LIMIT_TAG}([a-z]+)`).exec(message)
  const reason = m?.[1] as LimitReason | undefined
  if (reason && REASONS.includes(reason)) return reason
  if (/not enough memory|out of memory|Cannot enlarge memory/i.test(message))
    return 'memory'
  return null
}

export async function runSnippet(opts: RunOptions): Promise<RunReport> {
  if (new TextEncoder().encode(opts.code).length > LIMITS.maxCodeBytes)
    return { outcome: { status: 'limit', reason: 'memory' }, ms: 0 }

  const factory = new LuaFactory(opts.wasm)
  const lua = await factory.getLuaModule()
  const engine = await factory.createEngine({
    openStandardLibs: false,
    injectObjects: false,
    enableProxy: false,
  })
  const L = engine.global.address
  const open = (name: string, openf: (state: number) => unknown) => {
    openf(L)
    lua.lua_setglobal(L, name)
  }
  // luaopen_base deja sus funciones en _G y devuelve _G: se descarta.
  lua.luaopen_base(L)
  lua.lua_settop(L, 0)
  open('coroutine', (s) => lua.luaopen_coroutine(s))
  open('table', (s) => lua.luaopen_table(s))
  open('string', (s) => lua.luaopen_string(s))
  open('utf8', (s) =>
    lua.module.ccall('luaopen_utf8', 'number', ['number'], [s]),
  )
  open('math', (s) => lua.luaopen_math(s))
  open('debug', (s) => lua.luaopen_debug(s))

  engine.global.set('__emit', (line: unknown) => {
    if (typeof line === 'string') opts.emit(line)
  })
  engine.global.set('__code', opts.code)
  engine.global.set('__maxOut', LIMITS.maxOutputBytes)
  engine.global.set('__maxStr', LIMITS.maxStringBytes)
  engine.global.set('__maxErr', LIMITS.maxErrorChars)

  opts.beforeRun?.()

  let instructions = 0
  let tripped: LimitReason | null = null
  const started = performance.now()
  const deadline = started + LIMITS.timeoutMs
  let hook = 0
  // Una vez superado un límite el hook pasa a contar de a 1 instrucción y lanza el error ANTES de
  // cada una: ni un `pcall` anidado puede seguir ejecutando código del snippet.
  const trip = (state: number, reason: LimitReason) => {
    if (tripped === null) {
      tripped = reason
      lua.lua_sethook(L, hook, LUA_MASK_COUNT, 1)
    }
    lua.lua_sethook(state, hook, LUA_MASK_COUNT, 1)
    lua.lua_pushstring(state, `${LIMIT_TAG}${tripped}`)
    lua.lua_error(state)
  }
  hook = lua.module.addFunction((state: number) => {
    if (tripped !== null) return trip(state, tripped)
    instructions += LIMITS.hookEvery
    if (instructions > LIMITS.maxInstructions) trip(state, 'instructions')
    else if (performance.now() > deadline) trip(state, 'time')
  }, 'vii')
  lua.lua_sethook(L, hook, LUA_MASK_COUNT, LIMITS.hookEvery)

  let result: unknown
  let thrown: unknown
  try {
    result = engine.doStringSync(BOOTSTRAP)
  } catch (e) {
    thrown = e
  }
  const ms = performance.now() - started
  try {
    lua.lua_sethook(L, null, 0, 0)
  } catch {
    // La VM puede haber quedado inutilizable (abort por memoria): no importa, se descarta.
  }

  if (thrown !== undefined) {
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    const reason = limitOf(message)
    return {
      outcome: reason
        ? { status: 'limit', reason }
        : {
            status: 'error',
            message: cleanMessage(message),
            line: lineOf(message),
          },
      ms,
    }
  }

  const text = typeof result === 'string' ? result : ''
  if (text === 'ok') return { outcome: { status: 'ok' }, ms }
  const nl = text.indexOf('\n')
  const kind = nl === -1 ? text : text.slice(0, nl)
  const message = nl === -1 ? '' : text.slice(nl + 1)
  const reason = kind === 'err' ? limitOf(message.split('\n')[0] ?? '') : null
  if (reason) return { outcome: { status: 'limit', reason }, ms }
  if (kind === 'err' || kind === 'syntax')
    return {
      outcome: {
        status: 'error',
        message: cleanMessage(message),
        line: lineOf(message),
      },
      ms,
    }
  return {
    outcome: {
      status: 'error',
      message: 'Resultado inesperado del runtime',
      line: null,
    },
    ms,
  }
}
