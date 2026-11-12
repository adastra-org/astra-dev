// `bun run index`: build the semantic index of content/docs plus the importer's corpus
// (content/generated: fivem-docs pages and natives; run `bun run import` in the repo root first).
//
//   DOCS_DIR       docs folder              (default ../content/docs)
//   GENERATED_DIR  importer output          (default ../content/generated; missing = docs only)
//   INDEX_PATH     output file              (default data/index.json)
//   EMBEDDER_URL   house embedder           (default http://127.0.0.1:8891/v1/embeddings: local to the VPS)
//   NO_EMBED=1     skip embeddings, write a keyword-only index
//
// If the embedder is unreachable the index is still written (keyword-only) and the exit code is 0:
// the build must not depend on a service that only exists on the VPS. The server logs when it runs
// on a keyword-only index, and `/ready` shows `index.semantic: false`.
import { existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createEmbedder } from '../src/boot.ts'
import { loadConfig } from '../src/config.ts'
import { readNatives } from '../src/docs/natives.ts'
import { readDocs } from '../src/docs/source.ts'
import { buildIndex } from '../src/index/build.ts'

const config = loadConfig({ ...process.env, NODE_ENV: undefined })
const docsDir = resolve(process.env.DOCS_DIR ?? '../content/docs')
const generatedDir = resolve(
  process.env.GENERATED_DIR ?? '../content/generated',
)
const out = resolve(config.indexPath)

const docs = await readDocs(docsDir)
const generatedDocsDir = join(generatedDir, 'docs')
if (existsSync(generatedDocsDir)) {
  const taken = new Set(docs.map((d) => d.slug))
  for (const d of await readDocs(generatedDocsDir)) {
    if (taken.has(d.slug))
      throw new Error(
        `slug "${d.slug}" exists in content/docs and content/generated`,
      )
    docs.push(d)
  }
}
const natives = await readNatives(generatedDir)
if (!natives.length)
  console.warn(
    `[index] no natives found in ${generatedDir}; run "bun run import" first (index has docs only)`,
  )

const embedder = process.env.NO_EMBED === '1' ? null : createEmbedder(config)
if (embedder && !(await embedder.health()))
  console.warn(`[index] embedder not healthy at ${config.embedder.url}`)

const index = await buildIndex(docs, {
  embedder,
  dims: config.embedder.dims,
  natives,
  onWarn: (m) => console.warn(`[index] ${m}`),
})

await mkdir(dirname(out), { recursive: true })
const tmp = `${out}.tmp`
await writeFile(tmp, JSON.stringify(index))
await rename(tmp, out)

console.log(
  `[index] ${docs.length} docs, ${natives.length} natives, ${index.chunks.length} chunks, ${
    index.semantic
      ? `semantic (${index.model}, ${index.dims} dims)`
      : 'keyword-only'
  } -> ${out}`,
)
