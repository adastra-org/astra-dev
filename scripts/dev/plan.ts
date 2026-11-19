// Lógica pura de `bun dev` (scripts/dev.ts): flags, servicios locales y entorno del server.
// Sin I/O para poder probarla.

export interface DevFlags {
  /** IA local: embedder, LLM y decision model con llama-server, y el server apuntado a ellos. */
  local: boolean
  /** Deja pensar al LLM local (sin `--reasoning-budget 0`) para ver su razonamiento en el panel. */
  think: boolean
  /** Proveedor de prueba (`LLM_PROVIDER=fake`): sin modelos ni red. */
  fake: boolean
  /** Levanta también el server de Ask Ether (4100). `--no-server` = solo Vite, como antes. */
  server: boolean
  help: boolean
  /** Lo que no es nuestro va a Vite (`--port`, `--host`…). */
  viteArgs: string[]
}

export class DevArgsError extends Error {}

export function parseArgs(argv: string[]): DevFlags {
  const flags: DevFlags = {
    local: false,
    think: false,
    fake: false,
    server: true,
    help: false,
    viteArgs: [],
  }
  for (const a of argv) {
    if (a === '--local') flags.local = true
    else if (a === '--think') flags.think = true
    else if (a === '--fake') flags.fake = true
    else if (a === '--no-server') flags.server = false
    else if (a === '-h' || a === '--help') flags.help = true
    else flags.viteArgs.push(a)
  }
  if (flags.local && flags.fake)
    throw new DevArgsError('--local y --fake son excluyentes')
  if (flags.think && !flags.local)
    throw new DevArgsError('--think necesita --local')
  if (flags.local && !flags.server)
    throw new DevArgsError('--local necesita el server: quitá --no-server')
  return flags
}

export interface LocalService {
  name: string
  port: number
  /** Archivo dentro de la carpeta de modelos. */
  model: string
  /** Argumentos propios; `-m`, `--host`, `--port` y `-ngl` los pone dev.ts. */
  args: string[]
}

/**
 * Con `think` el LLM razona antes de responder: el panel lo muestra a staff, pero gasta tokens y
 * tarda más. Sin `think`, `--reasoning-budget 0` (LFM2.5 razona siempre y se comería el tope).
 */
export const localServices = (think = false): readonly LocalService[] => [
  {
    name: 'embedder',
    port: 8891,
    model: 'embeddinggemma-300M-Q8_0.gguf',
    args: [
      '--embedding',
      '-c',
      '2048',
      '-b',
      '2048',
      '-ub',
      '2048',
      '--alias',
      'embeddinggemma-2',
    ],
  },
  {
    name: 'llm',
    port: 8080,
    model: 'LFM2.5-2.6B-Q4_K_M.gguf',
    args: [
      '-c',
      '8192',
      '--alias',
      'lfm',
      ...(think ? [] : ['--reasoning-budget', '0']),
    ],
  },
  {
    name: 'decision',
    port: 8081,
    model: 'd1-Omni-2B-Q8_0.gguf',
    args: ['-b', '4096', '-ub', '4096'],
  },
]

type Env = Record<string, string | undefined>

/**
 * Variables que dev.ts le pone al server. Nunca pisa lo que el usuario ya definió en el entorno o
 * en `server/.env*` (`defined`), salvo el proveedor cuando pidió `--local` o `--fake`.
 */
export function serverEnv(
  flags: Pick<DevFlags, 'local' | 'fake'>,
  env: Env,
  defined: ReadonlySet<string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  const setDefault = (k: string, v: string) => {
    if (env[k] === undefined && !defined.has(k)) out[k] = v
  }
  // Sin viewer el panel pide iniciar sesión y en dev no hay dónde (cuentas viven en adastra-site).
  // Quien corre `bun dev` es el dueño de su máquina: owner (sin límites) y con el registro de uso
  // prendido, para ver `/dashboard` con datos reales.
  setDefault('ASTRA_DEV_VIEWER', 'owner')
  setDefault('USAGE_DB_PATH', 'data/usage.sqlite')
  if (flags.fake) out.LLM_PROVIDER = 'fake'
  if (flags.local) {
    const llm = localServices().find((s) => s.name === 'llm')
    const decision = localServices().find((s) => s.name === 'decision')
    out.LLM_PROVIDER = 'local'
    out.LLM_BASE_URL = `http://127.0.0.1:${llm?.port}/v1`
    out.LLM_MODEL = 'lfm'
    out.DECISION_URL = `http://127.0.0.1:${decision?.port}`
    setDefault('LLM_TIMEOUT_MS', '120000')
  }
  return out
}

/** Nombres definidos (no comentados) en el texto de un archivo `.env`. */
export function definedKeys(text: string): string[] {
  return [...text.matchAll(/^[ \t]*([A-Z][A-Z0-9_]*)[ \t]*=[ \t]*\S/gm)].map(
    (m) => m[1]!,
  )
}

export const HELP = `bun dev [opciones] [opciones de Vite]

  (sin opciones)  Vite (5173) + server de Ask Ether (4100). LLM según server/.env
  --think         con --local: el LLM razona y el panel lo muestra (solo staff)
  --local         + IA local: embedder (8891), LLM (8080) y decision model (8081) con llama-server
  --fake          LLM de prueba, sin modelos
  --no-server     solo Vite

Lo demás va a Vite: bun dev --local --port 5174

Entorno: LLAMA_SERVER (ruta de llama-server), ASTRA_MODELS_DIR (carpeta de los .gguf).
Servicios que ya responden en su puerto se reutilizan y no se cierran al salir.`
