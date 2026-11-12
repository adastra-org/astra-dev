// The versioned index: `index.json` (chunks, text only) plus, when semantic, a sibling binary file
// with the embeddings (Float32 little-endian, chunk order, `dims` per chunk). Built by
// `bun run index`, loaded by the server at boot. Embeddings are Matryoshka-truncated to `dims` and
// L2-normalised. The vectors live outside the JSON so they can be computed off the VPS (the PC or
// Cloudflare), shipped as a pair of files, and loaded without parsing ~2.5M numbers as text.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { Chunk, NativeMeta } from '../docs/chunk.ts'

export const INDEX_VERSION = 3

/** Where the vectors of `index.json` live (the same folder): `index.json` -> `index.vec`. */
export const vectorsFileFor = (indexPath: string): string =>
  basename(indexPath).replace(/\.json$/i, '') + '.vec'

export interface VectorsRef {
  /** File name next to the index (never a path). */
  file: string
  /** `chunks.length * dims * 4`. */
  bytes: number
  /** sha256 prefix of the file: a json and a vec from different builds never load together. */
  hash: string
}

export interface IndexedChunk extends Chunk {
  /** Absent when the index was built without the embedder (keyword-only index). In memory only: on
   *  disk the vectors are in the binary file (`serializeIndex` / `parseIndex`). */
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

/** The on-disk JSON: a `DocsIndex` without vectors and with the pointer to the binary file. */
type IndexFile = Omit<DocsIndex, 'chunks'> & {
  vectors: VectorsRef | null
  chunks: Omit<IndexedChunk, 'vector'>[]
}

export class IndexFormatError extends Error {
  constructor(message: string) {
    super(`Invalid index: ${message}`)
    this.name = 'IndexFormatError'
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isStrArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isStr)

function parseNativeMeta(v: unknown, chunkId: string): NativeMeta {
  const m = v as Record<string, unknown> | null
  if (
    !m ||
    !isStr(m.id) ||
    !isStr(m.name) ||
    !isStr(m.luaName) ||
    !isStr(m.ns) ||
    !isStr(m.signature) ||
    (m.source !== 'gta' && m.source !== 'cfx') ||
    !(
      m.apiset === null ||
      m.apiset === 'client' ||
      m.apiset === 'server' ||
      m.apiset === 'shared'
    ) ||
    !isStrArray(m.hashes) ||
    !isStrArray(m.aliases)
  )
    throw new IndexFormatError(`chunk ${chunkId} has malformed native metadata`)
  return {
    id: m.id,
    source: m.source,
    name: m.name,
    luaName: m.luaName,
    ns: m.ns,
    apiset: m.apiset,
    hashes: m.hashes,
    aliases: m.aliases,
    signature: m.signature,
  }
}

const VEC_FILE = /^[A-Za-z0-9._-]+\.vec$/

/**
 * Validates untrusted input (files on disk) into a `DocsIndex`. `vectors` is the content of the
 * binary file; required when the index is semantic.
 */
export function parseIndex(
  json: unknown,
  vectors?: Uint8Array | null,
): DocsIndex {
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

  let floats: Float32Array | null = null
  if (semantic) {
    const ref = o.vectors as Partial<VectorsRef> | null | undefined
    if (
      !ref ||
      !isStr(ref.file) ||
      !VEC_FILE.test(ref.file) ||
      typeof ref.bytes !== 'number' ||
      !isStr(ref.hash)
    )
      throw new IndexFormatError('semantic without a valid "vectors" reference')
    if (!vectors) throw new IndexFormatError(`vectors file ${ref.file} missing`)
    if (
      vectors.byteLength !== ref.bytes ||
      ref.bytes !== o.chunks.length * dims! * 4
    )
      throw new IndexFormatError(
        `bad vector file: ${vectors.byteLength} bytes, expected ${o.chunks.length * dims! * 4}`,
      )
    if (hashBytes(vectors) !== ref.hash)
      throw new IndexFormatError(
        'bad vector file: hash differs from the index (mixed builds?)',
      )
    // `slice` copies into a fresh, aligned buffer (a Buffer from readFile may be a pooled view).
    floats = new Float32Array(vectors.slice().buffer)
    for (let i = 0; i < floats.length; i++)
      if (!Number.isFinite(floats[i]!))
        throw new IndexFormatError('bad vector file: non-finite value')
  }

  const ids = new Set<string>()
  const chunks = o.chunks.map((raw, i): IndexedChunk => {
    const c = raw as Record<string, unknown> | null
    if (
      !c ||
      !isStr(c.id) ||
      (c.kind !== 'doc' && c.kind !== 'native') ||
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
      kind: c.kind,
      slug: c.slug,
      title: c.title,
      heading: c.heading,
      anchor: c.anchor,
      text: c.text,
      excerpt: c.excerpt,
    }
    if (c.kind === 'native') out.native = parseNativeMeta(c.native, c.id)
    if (floats)
      out.vector = Array.from(floats.subarray(i * dims!, (i + 1) * dims!))
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

const hashBytes = (b: Uint8Array): string =>
  createHash('sha256').update(b).digest('hex').slice(0, 16)

/** The two files of an index: text (JSON) and, when semantic, the vectors. */
export function serializeIndex(
  index: DocsIndex,
  vectorsFile = 'index.vec',
): { json: string; vectors: Uint8Array | null } {
  let vectors: Uint8Array | null = null
  let ref: VectorsRef | null = null
  if (index.semantic) {
    if (!index.dims) throw new Error('semantic index without dims')
    const floats = new Float32Array(index.chunks.length * index.dims)
    index.chunks.forEach((c, i) => {
      if (!c.vector || c.vector.length !== index.dims)
        throw new Error(`chunk ${c.id} has no vector of ${index.dims} dims`)
      floats.set(c.vector, i * index.dims!)
    })
    vectors = new Uint8Array(floats.buffer)
    ref = {
      file: vectorsFile,
      bytes: vectors.byteLength,
      hash: hashBytes(vectors),
    }
  }
  const file: IndexFile = {
    ...index,
    vectors: ref,
    chunks: index.chunks.map(({ vector: _vector, ...c }) => c),
  }
  return { json: JSON.stringify(file), vectors }
}

/** Writes `index.json` and `index.vec` (temp file + rename each; the vectors first). */
export async function writeIndex(
  path: string,
  index: DocsIndex,
): Promise<{ jsonBytes: number; vectorBytes: number }> {
  const vecName = vectorsFileFor(path)
  const { json, vectors } = serializeIndex(index, vecName)
  await mkdir(dirname(path), { recursive: true })
  if (vectors) {
    const vecPath = join(dirname(path), vecName)
    await writeFile(`${vecPath}.tmp`, vectors)
    await rename(`${vecPath}.tmp`, vecPath)
  }
  await writeFile(`${path}.tmp`, json)
  await rename(`${path}.tmp`, path)
  return {
    jsonBytes: Buffer.byteLength(json),
    vectorBytes: vectors?.byteLength ?? 0,
  }
}

export async function loadIndex(path: string): Promise<DocsIndex> {
  const json: unknown = JSON.parse(await readFile(path, 'utf8'))
  const file = (json as { vectors?: { file?: unknown } } | null)?.vectors?.file
  const vectors =
    typeof file === 'string' && VEC_FILE.test(file)
      ? await readFile(join(dirname(path), file))
      : null
  return parseIndex(json, vectors)
}
