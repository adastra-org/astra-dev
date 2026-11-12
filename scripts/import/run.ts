// CLI del importador.
//   bun run import                    descarga las fuentes fijadas y regenera content/generated/
//   bun run import --local nombre=dir usa una carpeta local en vez de descargar (repetible)
//   bun run import:update             sube cada fuente al sha actual de su rama (revisar el diff)
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'
import { buildCorpus, type RawFile } from './corpus.ts'
import { loadOverrides } from './overrides.ts'
import {
  fetchSource,
  readSources,
  resolveHead,
  writeSources,
  type SourcesFile,
} from './sources.ts'
import type { GeneratedDoc, Native } from './types.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CACHE = join(ROOT, '.cache', 'import')
const OUT = join(ROOT, 'content', 'generated')

async function walk(dir: string, rel = ''): Promise<string[]> {
  const entries = await readdir(join(dir, rel), { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (e): Promise<string[]> => {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.name === '.git') return []
      if (e.isDirectory()) return walk(dir, r)
      return e.isFile() && e.name.endsWith('.md') ? [r] : []
    }),
  )
  return nested.flat().sort()
}

/** Lee en bloques: miles de `readFile` a la vez agotan los descriptores de archivo en Windows. */
async function readAll(
  dir: string,
  paths: string[],
  prefix = '',
): Promise<RawFile[]> {
  const out: RawFile[] = []
  for (let i = 0; i < paths.length; i += 64) {
    const chunk = paths.slice(i, i + 64)
    const raws = await Promise.all(
      chunk.map((p) => readFile(join(dir, prefix, p), 'utf8')),
    )
    chunk.forEach((p, j) => out.push({ path: p, raw: raws[j] ?? '' }))
  }
  return out
}

const jsonLines = (items: readonly unknown[]) =>
  items.length
    ? `[\n${items.map((i) => JSON.stringify(i)).join(',\n')}\n]\n`
    : '[]\n'

async function put(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

const docFile = (d: GeneratedDoc) =>
  `---\n${stringify({ title: d.title, summary: d.summary, tags: d.tags, since: d.since, lang: d.lang }, { lineWidth: 0 }).trimEnd()}\n---\n\n${d.body}`

function nativeGroup(n: Native): string {
  const g = n.source === 'cfx' ? (n.apiset ?? 'shared') : n.ns
  return g.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

async function importAll(local: Map<string, string>, lenient: boolean) {
  const sources: SourcesFile = await readSources(ROOT)
  const dirs = new Map<string, string>()
  for (const [name, spec] of Object.entries(sources.sources)) {
    dirs.set(
      name,
      local.get(name) ?? (await fetchSource(CACHE, name, spec, console.log)),
    )
  }
  const need = (n: string) => {
    const d = dirs.get(n)
    if (!d) throw new Error(`content-sources.json no declara "${n}"`)
    return d
  }

  const gtaDir = need('natives')
  const cfxDir = need('cfx-natives')
  const docsDir = need('fivem-docs')

  const gtaPaths = (await walk(gtaDir)).filter((p) =>
    /^[A-Z][A-Z0-9_]*\/[^/]+\.md$/.test(p),
  )
  const cfxPaths = (await walk(join(cfxDir, 'ext/native-decls'))).map(
    (p) => `ext/native-decls/${p}`,
  )
  const docPaths = await walk(join(docsDir, 'content/docs'))

  const readStatic = (p: string): string | null => {
    const f = join(docsDir, 'static', p)
    return existsSync(f) ? readFileSync(f, 'utf8') : null
  }
  const manifest = (file: string, fallback: string) =>
    (readStatic(file) ?? fallback).trim()

  const corpus = buildCorpus({
    gta: await readAll(gtaDir, gtaPaths),
    cfx: await readAll(cfxDir, cfxPaths),
    docs: await readAll(docsDir, docPaths, 'content/docs'),
    overrides: await loadOverrides(
      join(ROOT, 'content', 'overrides', 'natives'),
    ),
    since: sources.since,
    readStatic,
    manifestVersions: {
      rmv: manifest('resource_manifest_version.txt', 'adamant'),
      rmv2: manifest('resource_manifest_version_v2.txt', 'cerulean'),
    },
  })

  if (corpus.errors.length) {
    for (const e of corpus.errors.slice(0, 30))
      console.error(`  error: ${e.message}`)
    console.error(`${corpus.errors.length} archivo(s) no se pudieron convertir`)
    if (!lenient) process.exit(1)
  }

  await rm(OUT, { recursive: true, force: true })

  const byGroup = new Map<string, Native[]>()
  for (const n of corpus.natives) {
    const key = `${n.source}/${nativeGroup(n)}`
    byGroup.set(key, [...(byGroup.get(key) ?? []), n])
  }
  for (const [key, list] of [...byGroup].sort(([a], [b]) => a.localeCompare(b)))
    await put(join(OUT, 'natives', `${key}.json`), jsonLines(list))

  await put(
    join(OUT, 'natives', 'index.json'),
    jsonLines(
      corpus.natives.map((n) => ({
        id: n.id,
        slug: n.slug,
        name: n.name,
        luaName: n.luaName,
        source: n.source,
        ns: n.ns,
        apiset: n.apiset,
        group: `${n.source}/${nativeGroup(n)}`,
        hashes: n.hashes,
        summary:
          n.description
            .split('\n\n')[0]
            ?.replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200) ?? '',
      })),
    ),
  )

  for (const d of corpus.docs)
    await put(join(OUT, 'docs', `${d.slug}.md`), docFile(d))
  await put(
    join(OUT, 'docs', 'index.json'),
    jsonLines(corpus.docs.map(({ body: _body, ...meta }) => meta)),
  )

  await put(
    join(OUT, 'manifest.json'),
    `${JSON.stringify(
      {
        sources: Object.fromEntries(
          Object.entries(sources.sources).map(([k, s]) => [
            k,
            { repo: s.repo, sha: s.sha },
          ]),
        ),
        counts: {
          natives: corpus.natives.length,
          docs: corpus.docs.length,
          nativeGroups: byGroup.size,
        },
        license:
          'Upstream repositories declare no license file. Public content of citizenfx; attribution to the upstream project is kept in each record (`upstream`).',
      },
      null,
      2,
    )}\n`,
  )

  console.log(
    `natives: ${corpus.natives.length} (gta ${gtaPaths.length}, cfx ${cfxPaths.length}) · docs: ${corpus.docs.length} · avisos: ${corpus.warnings.length}`,
  )
  for (const w of corpus.warnings.slice(0, 30)) console.warn(`  aviso: ${w}`)
  if (corpus.warnings.length > 30)
    console.warn(`  … y ${corpus.warnings.length - 30} más`)
}

async function update() {
  const sources = await readSources(ROOT)
  for (const [name, spec] of Object.entries(sources.sources)) {
    const sha = await resolveHead(spec)
    console.log(
      `${name}: ${spec.sha.slice(0, 8)} → ${sha.slice(0, 8)}${sha === spec.sha ? ' (sin cambios)' : ''}`,
    )
    spec.sha = sha
  }
  await writeSources(ROOT, sources)
}

const args = process.argv.slice(2)
if (args[0] === 'update') await update()
else {
  const local = new Map<string, string>()
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--local') {
      const [name, dir] = (args[++i] ?? '').split('=')
      if (!name || !dir) throw new Error('--local espera nombre=carpeta')
      local.set(name, resolve(dir))
    }
  }
  await importAll(local, args.includes('--lenient'))
}
