// `bun dev`: Vite + el server de Ask Ether, y con `--local` la IA local (llama-server).
// Ver `bun dev --help`. La lógica de flags y entorno está en scripts/dev/plan.ts.
import { existsSync, mkdirSync, readFileSync, openSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  definedKeys,
  DevArgsError,
  HELP,
  localServices,
  parseArgs,
  serverEnv,
  type LocalService,
} from './dev/plan.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = join(ROOT, 'server')
const LOGS = join(ROOT, '.cache', 'dev')
const SERVER_PORT = 4100

let flags
try {
  flags = parseArgs(Bun.argv.slice(2))
} catch (e) {
  if (!(e instanceof DevArgsError)) throw e
  console.error(`dev: ${e.message}`)
  process.exit(2)
}
if (flags.help) {
  console.log(HELP)
  process.exit(0)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const say = (tag: string, msg: string) => console.log(`[${tag}] ${msg}`)

const healthy = async (port: number) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(800),
    })
    return r.ok
  } catch {
    return false
  }
}

async function waitHealthy(port: number, ms: number, alive: () => boolean) {
  const end = Date.now() + ms
  while (Date.now() < end && alive()) {
    if (await healthy(port)) return true
    await sleep(500)
  }
  return false
}

// --- procesos hijos ---------------------------------------------------------
const children: { name: string; proc: Bun.Subprocess }[] = []
let stopping = false

function killTree(proc: Bun.Subprocess) {
  if (proc.exitCode !== null) return
  if (process.platform === 'win32')
    Bun.spawnSync(['taskkill', '/PID', String(proc.pid), '/T', '/F'])
  else proc.kill()
}

function shutdown(code: number): never {
  if (!stopping) {
    stopping = true
    for (const c of children) killTree(c.proc)
  }
  process.exit(code)
}
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

/** Reenvía la salida de un hijo con su etiqueta delante. */
async function pipe(tag: string, stream: ReadableStream<Uint8Array>) {
  const dec = new TextDecoder()
  let buf = ''
  for await (const chunk of stream) {
    buf += dec.decode(chunk, { stream: true })
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    for (const l of lines) if (l.trim()) console.log(`[${tag}] ${l}`)
  }
  if (buf.trim()) console.log(`[${tag}] ${buf}`)
}

function launch(
  name: string,
  cmd: string[],
  cwd: string,
  env: Record<string, string>,
  { critical }: { critical: boolean },
) {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  })
  children.push({ name, proc })
  void pipe(name, proc.stdout)
  void pipe(name, proc.stderr)
  void proc.exited.then((code) => {
    if (stopping) return
    say(name, `terminó (código ${code})`)
    if (critical) shutdown(code || 1)
  })
  return proc
}

// --- IA local ---------------------------------------------------------------
function findLlamaServer(): string | null {
  const fromEnv = process.env.LLAMA_SERVER
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null
  const onPath = Bun.which('llama-server')
  if (onPath) return onPath
  const local = process.env.LOCALAPPDATA
  if (!local) return null
  const pkgs = join(local, 'Microsoft', 'WinGet', 'Packages')
  if (!existsSync(pkgs)) return null
  for (const f of new Bun.Glob('ggml.llamacpp_*/llama-server.exe').scanSync(
    pkgs,
  ))
    return join(pkgs, f)
  return null
}

async function startLocalService(
  svc: LocalService,
  bin: string,
  modelsDir: string,
) {
  if (await healthy(svc.port)) {
    say(svc.name, `ya responde en :${svc.port}, lo reutilizo`)
    return
  }
  const model = join(modelsDir, svc.model)
  if (!existsSync(model))
    throw new Error(
      `${svc.name}: falta ${model} (carpeta de modelos: ASTRA_MODELS_DIR)`,
    )
  mkdirSync(LOGS, { recursive: true })
  const log = join(LOGS, `${svc.name}.log`)
  const fd = openSync(log, 'w')
  const proc = Bun.spawn(
    [
      bin,
      '-m',
      model,
      '--host',
      '127.0.0.1',
      '--port',
      String(svc.port),
      '-ngl',
      '99',
      ...svc.args,
    ],
    { stdin: 'ignore', stdout: fd, stderr: fd },
  )
  children.push({ name: svc.name, proc })
  say(svc.name, `${svc.model} en :${svc.port} (log: ${log})`)
  const ok = await waitHealthy(svc.port, 120_000, () => proc.exitCode === null)
  if (!ok)
    throw new Error(`${svc.name}: no respondió en :${svc.port}, mirá ${log}`)
}

async function startLocalAi(think: boolean) {
  const bin = findLlamaServer()
  if (!bin)
    throw new Error(
      'no encuentro llama-server: instalalo (winget install ggml.llamacpp) o definí LLAMA_SERVER',
    )
  const modelsDir =
    process.env.ASTRA_MODELS_DIR ?? 'E:/Proyectos/_scratch/models'
  await Promise.all(
    localServices(think).map((s) => startLocalService(s, bin, modelsDir)),
  )
}

// --- arranque ---------------------------------------------------------------
try {
  if (flags.local) await startLocalAi(flags.think)

  if (flags.server) {
    if (await healthy(SERVER_PORT)) {
      say(
        'server',
        `ya hay uno en :${SERVER_PORT}, lo reutilizo (si cambiaste el .env o el índice, reinicialo)`,
      )
    } else {
      // Lo que el usuario ya definió en server/.env* manda sobre nuestros defaults.
      const defined = new Set<string>()
      for (const f of ['.env', '.env.local']) {
        const p = join(SERVER, f)
        if (existsSync(p))
          for (const k of definedKeys(readFileSync(p, 'utf8'))) defined.add(k)
      }
      const env = serverEnv(flags, process.env, defined)
      if (!existsSync(join(SERVER, 'data', 'index.json')))
        say(
          'server',
          'sin índice: corré `bun run index` en server/ (con --local el embedder ya está)',
        )
      launch('server', ['bun', '--watch', 'src/main.ts'], SERVER, env, {
        critical: false,
      })
      if (!(await waitHealthy(SERVER_PORT, 20_000, () => !stopping)))
        say(
          'server',
          `no respondió en :${SERVER_PORT}, mirá los mensajes de arriba`,
        )
    }
  }

  const vite = launch(
    'vite',
    ['bun', 'run', 'vite', ...flags.viteArgs],
    ROOT,
    {},
    { critical: true },
  )
  await vite.exited
} catch (e) {
  console.error(`dev: ${e instanceof Error ? e.message : String(e)}`)
  shutdown(1)
}
