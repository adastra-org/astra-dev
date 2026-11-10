// Index build: chunk every doc, embed the chunks, produce a `DocsIndex`.
// The embedder is local to the VPS (127.0.0.1:8891). If it is unreachable, the index is still
// written, keyword-only: the build never fails because of it.
import {
  EmbedderResponseError,
  EmbedderUnavailableError,
  normalize,
  truncate,
  type EmbedderClient,
} from '@wefaber/embed'
import { chunkDoc, type Chunk } from '../docs/chunk.ts'
import { hashDocs, type SourceDoc } from '../docs/source.ts'
import { documentPrompt } from './prompts.ts'
import { INDEX_VERSION, roundVector, type DocsIndex } from './store.ts'

export interface BuildOptions {
  embedder: EmbedderClient | null
  dims: number
  now?: () => Date
  onWarn?: (message: string) => void
}

export async function buildIndex(
  docs: readonly SourceDoc[],
  opts: BuildOptions,
): Promise<DocsIndex> {
  const chunks: Chunk[] = docs.flatMap((d) => chunkDoc(d))
  if (!chunks.length) throw new Error('no chunks: content/docs is empty?')
  const base = {
    version: INDEX_VERSION,
    builtAt: (opts.now?.() ?? new Date()).toISOString(),
    sourceHash: hashDocs(docs),
  } as const

  const keywordOnly = (reason: string): DocsIndex => {
    opts.onWarn?.(
      `embeddings skipped (${reason}); writing a keyword-only index. Re-run on the VPS where the embedder runs.`,
    )
    return {
      ...base,
      model: null,
      dims: null,
      semantic: false,
      chunks,
    }
  }

  if (!opts.embedder) return keywordOnly('no embedder configured')

  let vectors: number[][]
  try {
    vectors = await opts.embedder.embedMany(
      chunks.map((c) => documentPrompt(c.title, c.heading, c.text)),
    )
  } catch (e) {
    if (
      e instanceof EmbedderUnavailableError ||
      e instanceof EmbedderResponseError
    )
      return keywordOnly(e.message)
    throw e
  }

  const first = vectors[0]
  if (!first || opts.dims > first.length)
    return keywordOnly(
      `embedder returned ${first?.length ?? 0} dims, wanted ${opts.dims}`,
    )

  return {
    ...base,
    model: opts.embedder.model,
    dims: opts.dims,
    semantic: true,
    chunks: chunks.map((c, i) => ({
      ...c,
      vector: roundVector(
        opts.dims === first.length
          ? normalize(vectors[i]!)
          : truncate(vectors[i]!, opts.dims),
      ),
    })),
  }
}
