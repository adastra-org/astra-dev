// Historial de cambios por documento: `git log --follow` del archivo, en build.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { History, HistoryEntry } from '../../src/lib/docs/types.ts'

const run = promisify(execFile)

const SEP = '\x1f'
/** Formato de `git log`: sha corto, fecha del commit (YYYY-MM-DD) y asunto, separados por US. */
export const LOG_FORMAT = `--format=%h${SEP}%cs${SEP}%s`

/** Parsea la salida de `git log` con `LOG_FORMAT`. Ignora líneas vacías o mal formadas. */
export function parseGitLog(raw: string): HistoryEntry[] {
  const out: HistoryEntry[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const [sha, date, ...rest] = line.split(SEP)
    const subject = rest.join(SEP).trim()
    if (!sha || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !subject) continue
    out.push({ sha, date, subject })
  }
  return out
}

/** Ejecuta git en `cwd`; `null` si falla (sin git, fuera de un repo, etc.). */
export type Git = (args: string[]) => Promise<string | null>

export function gitIn(cwd: string): Git {
  return async (args) => {
    try {
      const { stdout } = await run('git', args, {
        cwd,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      })
      return stdout
    } catch {
      return null
    }
  }
}

/**
 * Historial de un archivo. Degrada a `{ available: false }` si no hay git, el repo es
 * superficial (el log estaría truncado y mentiría) o el comando falla. Un archivo sin
 * commits todavía devuelve `available: true` con la lista vacía.
 */
export async function readHistory(git: Git, path: string): Promise<History> {
  const shallow = await git(['rev-parse', '--is-shallow-repository'])
  if (shallow === null || shallow.trim() === 'true')
    return { available: false, entries: [] }
  const log = await git(['log', '--follow', LOG_FORMAT, '--', path])
  if (log === null) return { available: false, entries: [] }
  return { available: true, entries: parseGitLog(log) }
}
