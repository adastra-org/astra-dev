// `bun run index`: build the semantic index of content/docs plus the importer's corpus
// (content/generated: fivem-docs pages and natives; run `bun run import` in the repo root first).
// Writes `index.json` and, when semantic, `index.vec` (Float32) next to it.
//
//   DOCS_DIR       docs folder              (default ../content/docs)
//   GENERATED_DIR  importer output          (default ../content/generated; missing = docs only)
//   INDEX_PATH     output file              (default data/index.json)
//   EMBEDDER_URL   embeddings endpoint      (default http://127.0.0.1:8891/v1/embeddings: the VPS)
//   EMBEDDER_MODEL, EMBEDDER_TOKEN, EMBEDDER_DIMS   see docs/server/README.md
//   NO_EMBED=1     skip embeddings, write a keyword-only index
//
// Vectors computed elsewhere (the PC or Cloudflare):
//   REUSE_FROM=<path to a prebuilt index.json>   reuse its vectors for every chunk whose embedded
//                  text is unchanged (the .vec file must sit next to it). Only if its model is in
//                  EMBEDDER_ACCEPT_MODELS (or is EMBEDDER_MODEL): declare a model there only after
//                  `bun run embed:compat` passed. The rest is embedded with whatever embedder is
//                  reachable; with none, the index is keyword-only.
//   EMBED_BATCH=32  texts per request.  EMBED_TIMEOUT_MS=60000, EMBED_RETRIES=3 (429/5xx/network)
//
// If nothing can embed, the index is still written (keyword-only) and the exit code is 0: the build
// must not depend on a service that only exists on the VPS. `/ready` shows `index.semantic`.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createEmbedder } from '../src/boot.ts'
import { loadConfig } from '../src/config.ts'
import { loadCorpus } from '../src/docs/corpus.ts'
import {
  buildIndex,
  reusableFrom,
  type ReusableVectors,
} from '../src/index/build.ts'
import { loadIndex, writeIndex } from '../src/index/store.ts'

const env = process.env
const config = loadConfig({ ...env, NODE_ENV: undefined })
const out = resolve(config.indexPath)

const { docs, natives } = await loadCorpus({
  docsDir: resolve(env.DOCS_DIR ?? '../content/docs'),
  generatedDir: resolve(env.GENERATED_DIR ?? '../content/generated'),
})
if (!natives.length)
  console.warn(
    `[index] no natives found; run "bun run import" first (index has docs only)`,
  )

let reuse: ReusableVectors | null = null
if (env.REUSE_FROM) {
  const from = resolve(env.REUSE_FROM)
  if (!existsSync(from)) {
    console.warn(`[index] REUSE_FROM ${from} does not exist: nothing to reuse`)
  } else {
    try {
      const r = reusableFrom(await loadIndex(from), {
        dims: config.embedder.dims,
        acceptModels: config.embedder.acceptModels,
      })
      if (r.ok) reuse = r.reuse
      else console.warn(`[index] not reusing ${from}: ${r.reason}`)
    } catch (e) {
      console.warn(`[index] not reusing ${from}: ${(e as Error).message}`)
    }
  }
}

const embedder =
  env.NO_EMBED === '1'
    ? null
    : createEmbedder(config, {
        timeoutMs: Number(env.EMBED_TIMEOUT_MS) || 60_000,
        retries: env.EMBED_RETRIES ? Number(env.EMBED_RETRIES) : 3,
      })
// Hosted embedders have no /health; only the local one is probed.
if (embedder && !config.embedder.token && !(await embedder.health()))
  console.warn(`[index] embedder not healthy at ${config.embedder.url}`)

const index = await buildIndex(docs, {
  embedder,
  dims: config.embedder.dims,
  natives,
  reuse,
  batchSize: Number(env.EMBED_BATCH) || 32,
  onWarn: (m) => console.warn(`[index] ${m}`),
  onInfo: (m) => console.log(`[index] ${m}`),
})

const { jsonBytes, vectorBytes } = await writeIndex(out, index)
console.log(
  `[index] ${docs.length} docs, ${natives.length} natives, ${index.chunks.length} chunks, ${
    index.semantic
      ? `semantic (${index.model}, ${index.dims} dims)`
      : 'keyword-only'
  } -> ${out} (${(jsonBytes / 1e6).toFixed(1)} MB json + ${(vectorBytes / 1e6).toFixed(1)} MB vectors)`,
)
