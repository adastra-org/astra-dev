// Descarga de las fuentes en `.cache/import/<nombre>` fijadas por sha (`content-sources.json`).
// Siempre un checkout superficial y parcial: fivem-docs pesa 365 MB y solo se necesita el texto.
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export interface SourceSpec {
  repo: string
  ref: string
  sha: string
  paths: string[]
}

export interface SourcesFile {
  since: string
  sources: Record<string, SourceSpec>
}

const SHA = /^[0-9a-f]{40}$/

export function parseSources(
  json: unknown,
  file = 'content-sources.json',
): SourcesFile {
  const o = json as Partial<SourcesFile> | null
  if (!o || typeof o.since !== 'string' || !/^\d+\.\d+\.\d+$/.test(o.since))
    throw new Error(`${file}: "since" debe ser X.Y.Z`)
  const sources = o.sources
  if (!sources || typeof sources !== 'object')
    throw new Error(`${file}: falta "sources"`)
  for (const [name, s] of Object.entries(sources)) {
    if (!s.repo?.startsWith('https://github.com/'))
      throw new Error(`${file}: ${name}.repo debe ser una URL de GitHub`)
    if (!SHA.test(s.sha ?? ''))
      throw new Error(
        `${file}: ${name}.sha debe ser un sha completo de 40 caracteres`,
      )
    if (!Array.isArray(s.paths) || !s.paths.length)
      throw new Error(`${file}: ${name}.paths no puede estar vacío`)
  }
  return o as SourcesFile
}

export async function readSources(root: string): Promise<SourcesFile> {
  const file = join(root, 'content-sources.json')
  return parseSources(JSON.parse(await readFile(file, 'utf8')), file)
}

const git = (cwd: string, ...args: string[]) =>
  run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })

/** Deja `<cache>/<name>` en el sha pedido, solo con los paths declarados. Devuelve la carpeta. */
export async function fetchSource(
  cache: string,
  name: string,
  spec: SourceSpec,
  log: (m: string) => void = () => {},
): Promise<string> {
  const dir = join(cache, name)
  await mkdir(dir, { recursive: true })
  if (!existsSync(join(dir, '.git'))) {
    await git(dir, 'init', '-q')
    await git(dir, 'remote', 'add', 'origin', spec.repo)
  }
  const head = await git(dir, 'rev-parse', '-q', '--verify', 'HEAD').then(
    (r) => r.stdout.trim(),
    () => '',
  )
  if (head !== spec.sha) {
    log(`${name}: fetch ${spec.sha.slice(0, 8)}`)
    await git(dir, 'sparse-checkout', 'set', '--no-cone', ...spec.paths)
    await git(
      dir,
      'fetch',
      '-q',
      '--depth',
      '1',
      '--filter=blob:none',
      'origin',
      spec.sha,
    )
    await git(dir, 'checkout', '-q', '-f', spec.sha)
  }
  return dir
}

/** `git ls-remote` de la rama: el sha actual de cada fuente, para `import:update`. */
export async function resolveHead(spec: SourceSpec): Promise<string> {
  const out = (
    await run('git', ['ls-remote', spec.repo, `refs/heads/${spec.ref}`])
  ).stdout
  const sha = out.split(/\s/)[0] ?? ''
  if (!SHA.test(sha))
    throw new Error(`${spec.repo}: no se pudo resolver ${spec.ref}`)
  return sha
}

export async function writeSources(
  root: string,
  data: SourcesFile,
): Promise<void> {
  await writeFile(
    join(root, 'content-sources.json'),
    `${JSON.stringify(data, null, 2)}\n`,
  )
}
