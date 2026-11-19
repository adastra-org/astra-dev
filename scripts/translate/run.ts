// CLI del pipeline de traducción ES (deepseek-flash vía `ds.ts`). Detalle en docs/translate/README.md.
//
//   bun run translate natives --ns VEHICLE --limit 40     traduce hasta 40 natives de un namespace
//   bun run translate natives --names GetEntityCoords,PlayerPedId
//   bun run translate docs --limit 10 [--tag getting-started] [--slug a,b]
//   bun run translate status                              conteos por flag y traducciones viejas
//
// Flags: --refresh (rehace las `auto` cuyo original cambió; una `reviewed` nunca se toca),
//        --dry-run (dice qué haría, no llama al modelo), --batch N (natives por llamada, 6),
//        --jobs N (llamadas en paralelo, 3), --max-chars N (docs más largos se saltan, 12000).
//
// Es idempotente (no repite lo ya traducido y vigente) y se puede cortar y retomar: cada lote se
// guarda al terminar. Nunca pisa una traducción `reviewed`.
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { splitFrontmatter, validateFrontmatter } from '../docs/frontmatter.ts'
import { readNativesCorpus } from '../natives/corpus.ts'
import { nativeText } from '../natives/render.ts'
import {
  type DocText,
  docFile,
  docSource,
  nativeFile,
  nativeSource,
  readDocTranslations,
  readNativeTranslations,
  writeDocTranslation,
  writeNativeTranslation,
} from './store.ts'
import {
  chunk,
  decide,
  docPrompt,
  isTranslatableNative,
  MODEL,
  nativePrompt,
  type NativeJob,
  parseDocReply,
  parseNativeReply,
  SYSTEM,
  type Translator,
} from './translate.ts'

const ROOT = resolve(import.meta.dirname, '../..')

export interface Options {
  root: string
  refresh: boolean
  dryRun: boolean
  batch: number
  jobs: number
  limit: number
  maxChars: number
  ns?: string
  source?: string
  names: string[]
  slugs: string[]
  tag?: string
  log: (msg: string) => void
}

export const defaults = (root = ROOT): Options => ({
  root,
  refresh: false,
  dryRun: false,
  batch: 6,
  jobs: 3,
  limit: 20,
  maxChars: 12000,
  names: [],
  slugs: [],
  log: console.log,
})

export interface Report {
  translated: number
  failed: number
  /** Ya traducidos y vigentes. */
  done: number
  skippedReviewed: number
  stale: number
  /** Candidatos que quedaron fuera por `--limit`. */
  beyondLimit: number
}

const emptyReport = (): Report => ({
  translated: 0,
  failed: 0,
  done: 0,
  skippedReviewed: 0,
  stale: 0,
  beyondLimit: 0,
})

/** Corre `fn` sobre `items` con hasta `jobs` en paralelo. */
async function pool<T>(
  items: readonly T[],
  jobs: number,
  fn: (item: T) => Promise<void>,
) {
  let next = 0
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(jobs, items.length)) },
      async () => {
        while (next < items.length) {
          const i = next++
          await fn(items[i] as T)
        }
      },
    ),
  )
}

// ---------- natives ----------

export async function translateNatives(
  opts: Options,
  translate: Translator,
): Promise<Report> {
  const report = emptyReport()
  const corpus = await readNativesCorpus(opts.root)
  if (!corpus)
    throw new Error('falta content/generated: corre `bun run import`')
  const existing = await readNativeTranslations(opts.root)

  const wantNames = new Set(opts.names.map((n) => n.toLowerCase()))
  const wantNs = opts.ns?.toLowerCase()
  const pick = corpus.natives
    .filter(isTranslatableNative)
    .filter((n) => !opts.source || n.source === opts.source)
    .filter(
      (n) =>
        !wantNs ||
        n.ns.toLowerCase() === wantNs ||
        corpus.groupOf.get(n.slug) === wantNs,
    )
    .filter(
      (n) =>
        !wantNames.size ||
        [n.name, n.luaName, n.slug].some((x) => wantNames.has(x.toLowerCase())),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug))

  const todo: NativeJob[] = []
  for (const n of pick) {
    const text = nativeText(n)
    const d = decide(existing.get(n.slug), nativeSource(text), opts.refresh)
    if (d === 'done') report.done++
    else if (d === 'stale-reviewed') report.skippedReviewed++
    else if (d === 'stale-auto') report.stale++
    else if (todo.length < opts.limit) todo.push({ slug: n.slug, text })
    else report.beyondLimit++
  }
  opts.log(
    `natives: ${pick.length} candidatos · ${todo.length} a traducir · ${report.done} ya hechos · ${report.stale} viejos (auto) · ${report.skippedReviewed} viejos (revisados, no se tocan)`,
  )
  if (opts.dryRun) {
    for (const j of todo) opts.log(`  traduciría ${j.slug}`)
    return report
  }

  await pool(chunk(todo, opts.batch), opts.jobs, async (jobs) => {
    let reply: string
    try {
      reply = await translate(SYSTEM, nativePrompt(jobs), {
        maxTokens: 8192,
      })
    } catch (e) {
      report.failed += jobs.length
      opts.log(
        `  error del modelo en ${jobs.map((j) => j.slug).join(', ')}: ${(e as Error).message}`,
      )
      return
    }
    const { ok, failed } = parseNativeReply(reply, jobs)
    for (const j of jobs) {
      const es = ok.get(j.slug)
      if (!es) {
        report.failed++
        opts.log(
          `  descartado ${j.slug}: ${(failed.get(j.slug) ?? []).join('; ')}`,
        )
        continue
      }
      // Última guarda: una persona pudo marcarla `reviewed` mientras corría el lote.
      const now = (await readNativeTranslations(opts.root)).get(j.slug)
      if (now?.translated === 'reviewed') {
        report.skippedReviewed++
        continue
      }
      await writeNativeTranslation(opts.root, j.slug, {
        ...es,
        translated: 'auto',
        source: nativeSource(j.text),
        model: MODEL,
      })
      report.translated++
      opts.log(`  ok ${j.slug}`)
    }
  })
  return report
}

// ---------- docs ----------

interface ImportedDoc extends DocText {
  slug: string
  tags: string[]
}

async function readImported(root: string): Promise<ImportedDoc[]> {
  const dir = join(root, 'content/generated/docs')
  if (!existsSync(dir))
    throw new Error('falta content/generated: corre `bun run import`')
  const out: ImportedDoc[] = []
  for (const f of (await readdir(dir)).sort()) {
    if (!f.endsWith('.md')) continue
    const path = join(dir, f)
    const { data, body } = splitFrontmatter(path, await readFile(path, 'utf8'))
    const fm = validateFrontmatter(path, data)
    out.push({
      slug: f.slice(0, -3),
      title: fm.title,
      summary: fm.summary,
      tags: fm.tags,
      body,
    })
  }
  return out
}

export async function translateDocs(
  opts: Options,
  translate: Translator,
): Promise<Report> {
  const report = emptyReport()
  const docs = await readImported(opts.root)
  const existing = await readDocTranslations(opts.root)
  const wantSlugs = new Set(opts.slugs)

  const pick = docs
    .filter((d) => !wantSlugs.size || wantSlugs.has(d.slug))
    .filter((d) => !opts.tag || d.tags.includes(opts.tag))
    .filter((d) => d.body.length <= opts.maxChars)

  const todo: ImportedDoc[] = []
  for (const d of pick) {
    const dec = decide(existing.get(d.slug), docSource(d), opts.refresh)
    if (dec === 'done') report.done++
    else if (dec === 'stale-reviewed') report.skippedReviewed++
    else if (dec === 'stale-auto') report.stale++
    else if (todo.length < opts.limit) todo.push(d)
    else report.beyondLimit++
  }
  opts.log(
    `docs: ${pick.length} candidatos (de ${docs.length}; los de más de ${opts.maxChars} caracteres se saltan) · ${todo.length} a traducir · ${report.done} ya hechos · ${report.stale} viejos (auto) · ${report.skippedReviewed} viejos (revisados, no se tocan)`,
  )
  if (opts.dryRun) {
    for (const d of todo) opts.log(`  traduciría ${d.slug}`)
    return report
  }

  await pool(todo, opts.jobs, async (d) => {
    try {
      const reply = await translate(SYSTEM, docPrompt(d), { maxTokens: 12000 })
      const r = parseDocReply(reply, d)
      if ('failed' in r) {
        report.failed++
        opts.log(`  descartado ${d.slug}: ${r.failed.join('; ')}`)
        return
      }
      const now = (await readDocTranslations(opts.root)).get(d.slug)
      if (now?.translated === 'reviewed') {
        report.skippedReviewed++
        return
      }
      await writeDocTranslation(opts.root, d.slug, {
        ...r.ok,
        translated: 'auto',
        source: docSource(d),
        model: MODEL,
      })
      report.translated++
      opts.log(`  ok ${d.slug}`)
    } catch (e) {
      report.failed++
      opts.log(`  error del modelo en ${d.slug}: ${(e as Error).message}`)
    }
  })
  return report
}

// ---------- status ----------

export async function status(opts: Options): Promise<string[]> {
  const lines: string[] = []
  const corpus = await readNativesCorpus(opts.root)
  if (corpus) {
    const t = corpus.translations
    const by = (flag: string) =>
      [...t.values()].filter((x) => x.translated === flag).length
    const stale = corpus.natives.filter((n) => {
      const x = t.get(n.slug)
      return x && x.source !== nativeSource(nativeText(n))
    }).length
    lines.push(
      `natives: ${t.size} traducidos (auto ${by('auto')}, reviewed ${by('reviewed')}), ${stale} con el original cambiado; traducibles: ${corpus.natives.filter(isTranslatableNative).length} de ${corpus.natives.length}`,
    )
  }
  if (existsSync(join(opts.root, 'content/generated/docs'))) {
    const docs = await readImported(opts.root)
    const t = await readDocTranslations(opts.root)
    const by = (flag: string) =>
      [...t.values()].filter((x) => x.translated === flag).length
    const stale = docs.filter((d) => {
      const x = t.get(d.slug)
      return x && x.source !== docSource(d)
    }).length
    lines.push(
      `docs: ${t.size} traducidos (auto ${by('auto')}, reviewed ${by('reviewed')}), ${stale} con el original cambiado; de ${docs.length}`,
    )
  }
  return lines
}

// ---------- ds.ts ----------

/** Traductor real: una llamada a `ds.ts` (prompt por stdin, para no chocar con el límite de argv). */
export function dsTranslator(
  ds = process.env.DS_TS ?? join(homedir(), '.claude/skills/deepseek/ds.ts'),
  attempts = 2,
): Translator {
  if (!existsSync(ds))
    throw new Error(`no encuentro ds.ts en ${ds} (variable DS_TS)`)
  return async (system, prompt, { maxTokens }) => {
    let last: Error | undefined
    for (let i = 0; i < attempts; i++) {
      const p = Bun.spawn(
        ['bun', ds, '-s', system, '-t', String(maxTokens), '-e', 'low'],
        {
          stdin: new Blob([prompt]),
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 240_000,
        },
      )
      const [out, err, code] = await Promise.all([
        new Response(p.stdout).text(),
        new Response(p.stderr).text(),
        p.exited,
      ])
      if (code === 0 && out.trim()) return out
      last = new Error(`ds.ts salió con ${code}: ${err.trim().slice(0, 300)}`)
      await Bun.sleep(1500 * (i + 1))
    }
    throw last ?? new Error('ds.ts no respondió')
  }
}

// ---------- argv ----------

export function parseArgs(argv: string[]): { cmd: string; opts: Options } {
  const [cmd = 'help', ...rest] = argv
  const opts = defaults()
  const num = (v: string | undefined, name: string) => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1)
      throw new Error(`${name} debe ser un entero ≥ 1`)
    return n
  }
  const list = (v: string | undefined) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a === '--refresh') opts.refresh = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--limit') opts.limit = num(rest[++i], '--limit')
    else if (a === '--batch') opts.batch = num(rest[++i], '--batch')
    else if (a === '--jobs') opts.jobs = num(rest[++i], '--jobs')
    else if (a === '--max-chars') opts.maxChars = num(rest[++i], '--max-chars')
    else if (a === '--ns') opts.ns = rest[++i]
    else if (a === '--source') opts.source = rest[++i]
    else if (a === '--names') opts.names = list(rest[++i])
    else if (a === '--slug') opts.slugs = list(rest[++i])
    else if (a === '--tag') opts.tag = rest[++i]
    else throw new Error(`argumento desconocido: ${a}`)
  }
  return { cmd, opts }
}

const HELP = `uso: bun run translate <natives|docs|status> [--ns X] [--names a,b] [--slug a,b] [--tag t]
                [--source gta|cfx] [--limit N] [--batch N] [--jobs N] [--max-chars N] [--refresh] [--dry-run]`

function summary(r: Report): string {
  return `traducidos ${r.translated} · fallidos ${r.failed} · ya hechos ${r.done} · viejos ${r.stale} · revisados intactos ${r.skippedReviewed} · fuera del límite ${r.beyondLimit}`
}

if (import.meta.main) {
  const { cmd, opts } = parseArgs(process.argv.slice(2))
  if (cmd === 'status') for (const l of await status(opts)) console.log(l)
  else if (cmd === 'natives' || cmd === 'docs') {
    const tr = opts.dryRun ? async () => '' : dsTranslator()
    const r =
      cmd === 'natives'
        ? await translateNatives(opts, tr)
        : await translateDocs(opts, tr)
    console.log(summary(r))
    if (r.failed) process.exitCode = 1
  } else console.log(HELP)
}

// Para que `docFile`/`nativeFile` no queden sin uso si se agregan comandos de limpieza.
export { docFile, nativeFile }
