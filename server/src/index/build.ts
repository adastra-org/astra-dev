// Index build: chunk every doc, embed the chunks, produce a `DocsIndex`.
//
// Where the vectors come from, per chunk, in order:
//   1. `reuse`: vectors of a previous index (e.g. computed on the PC or on Cloudflare and uploaded
//      to the VPS), matched by the hash of the exact text that gets embedded, so an edited chunk
//      is never served a stale vector;
//   2. `embedder`: only for what `reuse` does not cover.
// The index is semantic only when every chunk ends up with a vector. If the embedder is
// unreachable the index is still written, keyword-only: the build never fails because of it.
import {
  EmbedderResponseError,
  EmbedderUnavailableError,
  normalize,
  truncate,
  type EmbedderClient,
} from '@wefaber/embed'
import { createHash } from 'node:crypto'
import { chunkDoc, type Chunk } from '../docs/chunk.ts'
import { hashNatives, nativeChunk, type NativeRecord } from '../docs/natives.ts'
import { hashDocs, type SourceDoc } from '../docs/source.ts'
import { documentPrompt } from './prompts.ts'
import { INDEX_VERSION, type DocsIndex } from './store.ts'

/** Vectors of an earlier build, keyed by `embedKey`. All at `dims`, normalised. */
export interface ReusableVectors {
  model: string
  dims: number
  byKey: ReadonlyMap<string, readonly number[]>
}

export interface BuildOptions {
  embedder: EmbedderClient | null
  dims: number
  /** Natives from the importer (`readNatives`). One chunk each, after the docs. */
  natives?: readonly NativeRecord[]
  /** Vectors to reuse (see `reusableFrom`). Already vetted: the caller decides if the model fits. */
  reuse?: ReusableVectors | null
  /** Texts per embedder request. */
  batchSize?: number
  now?: () => Date
  onWarn?: (message: string) => void
  onInfo?: (message: string) => void
}

/** Identity of what gets embedded for a chunk: same text and prompt = same vector. */
export const embedKey = (
  c: Pick<Chunk, 'title' | 'heading' | 'text'>,
): string =>
  createHash('sha256')
    .update(documentPrompt(c.title, c.heading, c.text))
    .digest('hex')
    .slice(0, 20)

export type ReuseResult =
  | { ok: true; reuse: ReusableVectors }
  | { ok: false; reason: string }

/**
 * Takes the vectors out of a previous index to reuse them. `acceptModels` is the explicit list of
 * embedders whose vectors are interchangeable with the one that embeds queries (declare a model
 * there only after `bun run embed:compat` passed for it): vectors from anything else are refused.
 */
export function reusableFrom(
  index: DocsIndex,
  opts: { dims: number; acceptModels: readonly string[] },
): ReuseResult {
  if (!index.semantic || !index.model || !index.dims)
    return { ok: false, reason: 'the previous index has no vectors' }
  if (!opts.acceptModels.includes(index.model))
    return {
      ok: false,
      reason: `model "${index.model}" is not in EMBEDDER_ACCEPT_MODELS (${opts.acceptModels.join(', ')})`,
    }
  if (index.dims !== opts.dims)
    return {
      ok: false,
      reason: `previous index has ${index.dims} dims, wanted ${opts.dims}`,
    }
  const byKey = new Map<string, readonly number[]>()
  for (const c of index.chunks) if (c.vector) byKey.set(embedKey(c), c.vector)
  return { ok: true, reuse: { model: index.model, dims: index.dims, byKey } }
}

export async function buildIndex(
  docs: readonly SourceDoc[],
  opts: BuildOptions,
): Promise<DocsIndex> {
  const natives = opts.natives ?? []
  const chunks: Chunk[] = [
    ...docs.flatMap((d) => chunkDoc(d)),
    ...natives.map(nativeChunk),
  ]
  if (!chunks.length) throw new Error('no chunks: content/docs is empty?')
  const sourceHash = natives.length
    ? createHash('sha256')
        .update(`${hashDocs(docs)}\n${hashNatives(natives)}`)
        .digest('hex')
        .slice(0, 16)
    : hashDocs(docs)
  const base = {
    version: INDEX_VERSION,
    builtAt: (opts.now?.() ?? new Date()).toISOString(),
    sourceHash,
  } as const

  const keywordOnly = (reason: string): DocsIndex => {
    opts.onWarn?.(
      `embeddings skipped (${reason}); writing a keyword-only index. Run it where an embedder is reachable, or reuse vectors computed elsewhere (REUSE_FROM).`,
    )
    return {
      ...base,
      model: null,
      dims: null,
      semantic: false,
      chunks,
    }
  }

  const reuse = opts.reuse && opts.reuse.dims === opts.dims ? opts.reuse : null
  const keys = chunks.map(embedKey)
  const vectors = new Map<string, readonly number[]>()
  if (reuse)
    for (const k of keys) {
      const v = reuse.byKey.get(k)
      if (v) vectors.set(k, v)
    }
  const reused = new Set(vectors.keys()).size

  // One embedding per distinct key still missing.
  const pending = new Map<string, string>()
  chunks.forEach((c, i) => {
    const k = keys[i]!
    if (!vectors.has(k) && !pending.has(k))
      pending.set(k, documentPrompt(c.title, c.heading, c.text))
  })
  opts.onInfo?.(
    `${chunks.length} chunks: ${reused} reused vectors, ${pending.size} to embed`,
  )

  let model = reuse?.model ?? null
  if (pending.size) {
    if (!opts.embedder) return keywordOnly('no embedder configured')
    const keyList = [...pending.keys()]
    const texts = [...pending.values()]
    const batch = opts.batchSize ?? 32
    const out: number[][] = []
    try {
      for (let i = 0; i < texts.length; i += batch) {
        out.push(
          ...(await opts.embedder.embedMany(texts.slice(i, i + batch), {
            batchSize: batch,
          })),
        )
        opts.onInfo?.(`embedded ${out.length}/${texts.length}`)
      }
    } catch (e) {
      if (
        e instanceof EmbedderUnavailableError ||
        e instanceof EmbedderResponseError
      )
        return keywordOnly(e.message)
      throw e
    }
    const first = out[0]
    if (!first || opts.dims > first.length)
      return keywordOnly(
        `embedder returned ${first?.length ?? 0} dims, wanted ${opts.dims}`,
      )
    keyList.forEach((k, i) => {
      const v = out[i]!
      vectors.set(
        k,
        opts.dims === v.length ? normalize(v) : truncate(v, opts.dims),
      )
    })
    model = opts.embedder.model
  }
  if (!model) return keywordOnly('nothing to embed with')

  return {
    ...base,
    model,
    dims: opts.dims,
    semantic: true,
    chunks: chunks.map((c, i) => ({
      ...c,
      vector: [...vectors.get(keys[i]!)!],
    })),
  }
}
