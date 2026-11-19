// Retrieval: cosine over the embeddings when the embedder answers, BM25 keyword search otherwise.
// The embedder is local to the VPS; if it is down, slow or the index has no vectors, search keeps
// working in keyword mode and reports `degraded` instead of failing.
import { cosine, truncate, type EmbedderClient } from '@wefaber/embed'
import type { ChunkKind, NativeMeta } from '../docs/chunk.ts'
import { NativeLookup } from './lookup.ts'
import type { DocsIndex, IndexedChunk } from './store.ts'
import { queryPrompt } from './prompts.ts'

export interface Hit {
  id: string
  kind: ChunkKind
  /** Identity of the native, on `native` hits. */
  native?: NativeMeta
  slug: string
  title: string
  heading: string | null
  anchor: string | null
  excerpt: string
  /** Markdown of the chunk (used as LLM context, never shown raw to the browser). */
  text: string
  score: number
}

export type SearchMode = 'semantic' | 'keyword'

export interface SearchResult {
  mode: SearchMode
  /** True when semantic search was expected but not used (embedder down, no vectors). */
  degraded: boolean
  hits: Hit[]
}

const toHit = (c: IndexedChunk, score: number): Hit => ({
  id: c.id,
  kind: c.kind,
  ...(c.native ? { native: c.native } : {}),
  slug: c.slug,
  title: c.title,
  heading: c.heading,
  anchor: c.anchor,
  excerpt: c.excerpt,
  text: c.text,
  score,
})

// ---------- keyword (BM25) ----------

const STOP = new Set(
  (
    'a al algo como con cual cuando de del el ella en es esta este esto la las lo los me mi muy no o para por que ' +
    'se si sin sobre su sus te tu un una uno y ya hay son ser fue the of to and is in on for it an or be as at ' +
    'how what do does can i you my with this that are funciona funcionan hace hacer puedo puede'
  ).split(' '),
)

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Lowercase, accent-free word tokens; stop words dropped; trailing plural `s` stripped. camelCase
 * is split first (`GetEntityCoords` → get, entity, coords) so Lua names match `GET_ENTITY_COORDS`.
 */
export function tokenize(text: string): string[] {
  return fold(text.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
}

export class KeywordIndex {
  readonly #chunks: readonly IndexedChunk[]
  readonly #tf: Map<string, number>[] = []
  readonly #len: number[] = []
  readonly #df = new Map<string, number>()
  readonly #avg: number

  constructor(chunks: readonly IndexedChunk[]) {
    this.#chunks = chunks
    let total = 0
    for (const c of chunks) {
      const tf = new Map<string, number>()
      const add = (tokens: string[], w: number) => {
        for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + w)
      }
      // Title and heading weigh more than body text.
      add(tokenize(c.title), 2)
      add(tokenize(c.heading ?? ''), 3)
      add(tokenize(c.text), 1)
      let len = 0
      for (const [t, n] of tf) {
        len += n
        this.#df.set(t, (this.#df.get(t) ?? 0) + 1)
      }
      this.#tf.push(tf)
      this.#len.push(len)
      total += len
    }
    this.#avg = total / Math.max(1, chunks.length) || 1
  }

  search(query: string, k: number, kind?: ChunkKind): Hit[] {
    const terms = [...new Set(tokenize(query))]
    if (!terms.length) return []
    const N = this.#chunks.length
    const k1 = 1.2
    const b = 0.75
    const scored: Hit[] = []
    this.#chunks.forEach((c, i) => {
      if (kind && c.kind !== kind) return
      const tf = this.#tf[i]!
      let score = 0
      for (const t of terms) {
        const f = tf.get(t)
        if (!f) continue
        const df = this.#df.get(t) ?? 0
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
        score +=
          (idf * (f * (k1 + 1))) /
          (f + k1 * (1 - b + (b * this.#len[i]!) / this.#avg))
      }
      if (score > 0) scored.push(toHit(c, score))
    })
    return scored.sort((a, b2) => b2.score - a.score).slice(0, k)
  }
}

// ---------- semantic ----------

export function semanticSearch(
  index: DocsIndex,
  query: readonly number[],
  k: number,
  minScore = 0,
  kind?: ChunkKind,
): Hit[] {
  const out: Hit[] = []
  for (const c of index.chunks) {
    if (!c.vector || (kind && c.kind !== kind)) continue
    const s = cosine(query, c.vector)
    if (s >= minScore) out.push(toHit(c, s))
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k)
}

// ---------- retriever ----------

export interface RetrieverOptions {
  minSemanticScore: number
  /** After an embedder failure, skip it for this long so requests do not each wait for a timeout. */
  cooldownMs?: number
  now?: () => number
}

export interface SearchRequest {
  /** Restrict to one kind; omitted = docs and natives together. */
  kind?: ChunkKind
  k: number
}

export class Retriever {
  readonly #index: DocsIndex
  readonly #embedder: EmbedderClient | null
  readonly #keyword: KeywordIndex
  readonly #lookup: NativeLookup
  readonly #opts: RetrieverOptions
  #downUntil = 0

  constructor(
    index: DocsIndex,
    embedder: EmbedderClient | null,
    opts: RetrieverOptions,
  ) {
    this.#index = index
    this.#embedder = embedder
    this.#keyword = new KeywordIndex(index.chunks)
    this.#lookup = new NativeLookup(index.chunks)
    this.#opts = opts
  }

  get info() {
    const natives = this.#index.chunks.filter((c) => c.kind === 'native').length
    return {
      chunks: this.#index.chunks.length,
      docs: this.#index.chunks.length - natives,
      natives,
      semantic: this.#index.semantic,
      model: this.#index.model,
      builtAt: this.#index.builtAt,
      sourceHash: this.#index.sourceHash,
    }
  }

  /** Natives the query names exactly (name, Lua name, alias or hash). Needs no embedder. */
  findNatives(query: string): IndexedChunk[] {
    return this.#lookup.find(query)
  }

  async search(
    query: string,
    k: number,
    opts: { kind?: ChunkKind } = {},
  ): Promise<SearchResult> {
    return this.searchMany(query, [{ k, ...opts }])
  }

  /**
   * Several rankings from one query embedding (e.g. top docs plus top natives for the chat, so the
   * ~7,000 natives never crowd the docs out). Natives named in the query (by name or hash) go first
   * in any request that includes natives. Results keep the order of the requests, without repeats.
   */
  async searchMany(
    query: string,
    requests: readonly SearchRequest[],
  ): Promise<SearchResult> {
    const vector = await this.#queryVector(query)
    const exact = this.#lookup.find(query)

    let usedSemantic = false
    const hits: Hit[] = []
    const seen = new Set<string>()
    // Natives named in the query lead the whole result, ahead of the docs request. They still
    // count toward the quota of each request that includes natives.
    const nativeK = requests.filter((r) => r.kind !== 'doc').map((r) => r.k)
    if (nativeK.length)
      for (const c of exact.slice(0, Math.min(...nativeK))) {
        seen.add(c.id)
        hits.push(toHit(c, 1))
      }
    for (const r of requests) {
      const semantic = vector
        ? semanticSearch(
            this.#index,
            vector,
            r.k,
            this.#opts.minSemanticScore,
            r.kind,
          )
        : []
      // Nothing close enough semantically: keywords may still match exact identifiers.
      if (semantic.length) usedSemantic = true
      const ranked = semantic.length
        ? semantic
        : this.#keyword.search(query, r.k, r.kind)
      const pinned = r.kind === 'doc' ? [] : exact.map((c) => toHit(c, 1))
      const local = new Set<string>()
      for (const h of [...pinned, ...ranked]) {
        if (local.has(h.id)) continue
        local.add(h.id)
        if (local.size > r.k) break
        if (seen.has(h.id)) continue
        seen.add(h.id)
        hits.push(h)
      }
    }

    return {
      mode: usedSemantic ? 'semantic' : 'keyword',
      // No query vector: semantic search was not used or failed, always a degraded answer.
      degraded: vector === null,
      hits,
    }
  }

  /** The query embedding, or null when the embedder is not usable (never throws). */
  async #queryVector(query: string): Promise<number[] | null> {
    const wantSemantic = this.#index.semantic && this.#embedder !== null
    const now = (this.#opts.now ?? Date.now)()
    if (!wantSemantic || now < this.#downUntil) return null
    try {
      const raw = await this.#embedder!.embed(queryPrompt(query))
      const dims = this.#index.dims!
      return raw.length === dims ? raw : truncate(raw, dims)
    } catch {
      this.#downUntil = now + (this.#opts.cooldownMs ?? 30_000)
      return null
    }
  }
}
