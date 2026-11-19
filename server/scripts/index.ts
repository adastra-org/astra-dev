// `bun run index`: build the semantic index of content/docs.
//
//   DOCS_DIR      docs folder           (default ../content/docs)
//   INDEX_PATH    output file           (default data/index.json)
//   EMBEDDER_URL  house embedder        (default http://127.0.0.1:8891/v1/embeddings: local to the VPS)
//   NO_EMBED=1    skip embeddings, write a keyword-only index
//
// If the embedder is unreachable the index is still written (keyword-only) and the exit code is 0:
// the build must not depend on a service that only exists on the VPS. The server logs when it runs
// on a keyword-only index, and `/ready` shows `index.semantic: false`.
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createEmbedder } from '../src/boot.ts'
import { loadConfig } from '../src/config.ts'
import { readDocs } from '../src/docs/source.ts'
import { buildIndex } from '../src/index/build.ts'

const config = loadConfig({ ...process.env, NODE_ENV: undefined })
const docsDir = resolve(process.env.DOCS_DIR ?? '../content/docs')
const out = resolve(config.indexPath)

const docs = await readDocs(docsDir)
const embedder = process.env.NO_EMBED === '1' ? null : createEmbedder(config)
if (embedder && !(await embedder.health()))
  console.warn(`[index] embedder not healthy at ${config.embedder.url}`)

const index = await buildIndex(docs, {
  embedder,
  dims: config.embedder.dims,
  onWarn: (m) => console.warn(`[index] ${m}`),
})

await mkdir(dirname(out), { recursive: true })
const tmp = `${out}.tmp`
await writeFile(tmp, JSON.stringify(index))
await rename(tmp, out)

console.log(
  `[index] ${docs.length} docs, ${index.chunks.length} chunks, ${
    index.semantic
      ? `semantic (${index.model}, ${index.dims} dims)`
      : 'keyword-only'
  } -> ${out}`,
)
