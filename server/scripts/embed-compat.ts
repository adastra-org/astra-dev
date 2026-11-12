// `bun run embed:compat`: are two embedders interchangeable? Embeds the same document and query
// prompts with both and checks the cosine of every pair (>= 0.99). Run it before declaring a
// model in EMBEDDER_ACCEPT_MODELS, i.e. before shipping vectors computed off the VPS.
//
//   A (the reference: what the server embeds queries with)  EMBEDDER_URL / EMBEDDER_MODEL / EMBEDDER_TOKEN
//   B (the candidate that computes the documents)           COMPAT_URL / COMPAT_MODEL / COMPAT_TOKEN
//   COMPAT_SAMPLES=50   document texts sampled from the corpus (plus the fixed queries)
//   COMPAT_THRESHOLD=0.99
//
// A is normally the VPS embedder, so run it where A is reachable (the VPS, or a tunnel to
// 127.0.0.1:8891). Exit 1 if any pair is below the threshold.
import { resolve } from 'node:path'
import { createEmbedder } from '../src/boot.ts'
import { loadConfig } from '../src/config.ts'
import { chunkDoc } from '../src/docs/chunk.ts'
import { loadCorpus } from '../src/docs/corpus.ts'
import { nativeChunk } from '../src/docs/natives.ts'
import { compareEmbedders, sampleEvenly } from '../src/index/compat.ts'
import { documentPrompt, queryPrompt } from '../src/index/prompts.ts'

const env = process.env
const need = (k: string) => {
  const v = env[k]?.trim()
  if (!v) {
    console.error(`[compat] ${k} is required (the candidate embedder, B)`)
    process.exit(2)
  }
  return v
}

const base = { ...env, NODE_ENV: undefined }
const configA = loadConfig(base)
const configB = loadConfig({
  ...base,
  EMBEDDER_URL: need('COMPAT_URL'),
  EMBEDDER_MODEL: need('COMPAT_MODEL'),
  EMBEDDER_TOKEN: env.COMPAT_TOKEN ?? '',
})

const { docs, natives } = await loadCorpus({
  docsDir: resolve(env.DOCS_DIR ?? '../content/docs'),
  generatedDir: resolve(env.GENERATED_DIR ?? '../content/generated'),
})
const chunks = [
  ...docs.flatMap((d) => chunkDoc(d)),
  ...natives.map(nativeChunk),
]
const docTexts = sampleEvenly(chunks, Number(env.COMPAT_SAMPLES) || 50).map(
  (c) => documentPrompt(c.title, c.heading, c.text),
)
const queries = [
  'how do I spawn a vehicle on the server',
  'SET_VEHICLE_DOOR_OPEN',
  'GetEntityCoords',
  '0xBB75D38B',
  'cómo abrir la puerta de un vehículo',
  'registrar un evento de red entre cliente y servidor',
  'qué hace SetEntityCoords y cuáles son sus parámetros',
  'wait for the resource to start',
  'dibujar texto en pantalla',
  'permisos ACE para un grupo de jugadores',
].map(queryPrompt)

const timeoutMs = 60_000
const result = await compareEmbedders(
  createEmbedder(configA, { timeoutMs, retries: 2 }),
  createEmbedder(configB, { timeoutMs, retries: 2 }),
  [...docTexts, ...queries],
  {
    dims: configA.embedder.dims,
    threshold: Number(env.COMPAT_THRESHOLD) || 0.99,
  },
)

console.log(
  `[compat] A=${configA.embedder.model} B=${configB.embedder.model} dims=${configA.embedder.dims}`,
)
console.log(
  `[compat] ${result.pairs} pairs: min ${result.min.toFixed(4)}, mean ${result.mean.toFixed(4)}, threshold ${result.threshold}`,
)
for (const w of result.worst)
  console.log(
    `[compat]   ${w.cosine.toFixed(4)}  ${w.text.slice(0, 90).replace(/\s+/g, ' ')}`,
  )
if (result.ok)
  console.log(
    `[compat] OK: add "${configB.embedder.model}" to EMBEDDER_ACCEPT_MODELS on the machine that builds the index`,
  )
else {
  console.error(
    '[compat] FAIL: not interchangeable. Embed the query with B too, or build the index with the VPS embedder (same GGUF).',
  )
  process.exit(1)
}
