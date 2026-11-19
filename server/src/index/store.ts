// The versioned index file: chunks plus (optionally) their embeddings. Built by `bun run index`,
// loaded by the server at boot. Embeddings are Matryoshka-truncated to `dims` and L2-normalised.
import { readFile } from 'node:fs/promises'
import type { Chunk } from '../docs/chunk.ts'

export const INDEX_VERSION = 1

export interface IndexedChunk extends Chunk {
  /** Absent when the index was built without the embedder (keyword-only index). */
  vector?: number[]
}

export interface DocsIndex {
  version: typeof INDEX_VERSION
  builtAt: string
  /** Hash of the doc sources (see `hashDocs`). */
  sourceHash: string
  /** Embedder model, `null` for a keyword-only index. */
  model: string | null
  dims: number | null
  /** True when every chunk carries a vector. */
  semantic: boolean
  chunks: IndexedChunk[]
}

export class IndexFormatError extends Error {
  constructor(message: string) {
    super(`Invalid index: ${message}`)
    this.name = 'IndexFormatError'
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'

/** Validates untrusted JSON (a file on disk) into a `DocsIndex`. */
export function parseIndex(json: unknown): DocsIndex {
  if (json === null || typeof json !== 'object')
    throw new IndexFormatError('not an object')
  const o = json as Record<string, unknown>
  if (o.version !== INDEX_VERSION)
    throw new IndexFormatError(
      `version ${String(o.version)} (expected ${INDEX_VERSION}); rebuild with "bun run index"`,
    )
  if (!Array.isArray(o.chunks) || o.chunks.length === 0)
    throw new IndexFormatError('no chunks')
  const dims = typeof o.dims === 'number' ? o.dims : null
  const semantic = o.semantic === true
  if (semantic && !dims) throw new IndexFormatError('semantic without dims')

  const ids = new Set<string>()
  const chunks = o.chunks.map((raw, i): IndexedChunk => {
    const c = raw as Record<string, unknown> | null
    if (
      !c ||
      !isStr(c.id) ||
      !isStr(c.slug) ||
      !isStr(c.title) ||
      !isStr(c.text) ||
      !isStr(c.excerpt) ||
      !(c.heading === null || isStr(c.heading)) ||
      !(c.anchor === null || isStr(c.anchor))
    )
      throw new IndexFormatError(`chunk ${i} is malformed`)
    if (ids.has(c.id)) throw new IndexFormatError(`duplicate chunk id ${c.id}`)
    ids.add(c.id)
    const out: IndexedChunk = {
      id: c.id,
      slug: c.slug,
      title: c.title,
      heading: c.heading,
      anchor: c.anchor,
      text: c.text,
      excerpt: c.excerpt,
    }
    if (semantic) {
      const v = c.vector
      if (
        !Array.isArray(v) ||
        v.length !== dims ||
        !v.every((n) => typeof n === 'number' && Number.isFinite(n))
      )
        throw new IndexFormatError(`chunk ${c.id} has a bad vector`)
      out.vector = v as number[]
    }
    return out
  })

  return {
    version: INDEX_VERSION,
    builtAt: isStr(o.builtAt) ? o.builtAt : '',
    sourceHash: isStr(o.sourceHash) ? o.sourceHash : '',
    model: isStr(o.model) ? o.model : null,
    dims,
    semantic,
    chunks,
  }
}

export async function loadIndex(path: string): Promise<DocsIndex> {
  return parseIndex(JSON.parse(await readFile(path, 'utf8')))
}

/** Round vectors to 5 decimals: ~3x smaller JSON, no measurable ranking change. */
export const roundVector = (v: readonly number[]) =>
  v.map((n) => Math.round(n * 1e5) / 1e5)
