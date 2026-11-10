// Retrieval: cosine over the embeddings when the embedder answers, BM25 keyword search otherwise.
// The embedder is local to the VPS; if it is down, slow or the index has no vectors, search keeps
// working in keyword mode and reports `degraded` instead of failing.
import { cosine, truncate, type EmbedderClient } from '@wefaber/embed'
import type { DocsIndex, IndexedChunk } from './store.ts'
import { queryPrompt } from './prompts.ts'

export interface Hit {
  id: string
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

/** Lowercase, accent-free word tokens; stop words dropped; trailing plural `s` stripped. */
export function tokenize(text: string): string[] {
  return fold(text)
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

  search(query: string, k: number): Hit[] {
    const terms = [...new Set(tokenize(query))]
    if (!terms.length) return []
    const N = this.#chunks.length
    const k1 = 1.2
    const b = 0.75
    const scored: Hit[] = []
    this.#chunks.forEach((c, i) => {
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
): Hit[] {
  const out: Hit[] = []
  for (const c of index.chunks) {
    if (!c.vector) continue
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

export class Retriever {
  readonly #index: DocsIndex
  readonly #embedder: EmbedderClient | null
  readonly #keyword: KeywordIndex
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
    this.#opts = opts
  }

  get info() {
    return {
      chunks: this.#index.chunks.length,
      semantic: this.#index.semantic,
      model: this.#index.model,
      builtAt: this.#index.builtAt,
      sourceHash: this.#index.sourceHash,
    }
  }

  async search(query: string, k: number): Promise<SearchResult> {
    const wantSemantic = this.#index.semantic && this.#embedder !== null
    const now = (this.#opts.now ?? Date.now)()

    if (wantSemantic && now >= this.#downUntil) {
      try {
        const raw = await this.#embedder!.embed(queryPrompt(query))
        const dims = this.#index.dims!
        const q = raw.length === dims ? raw : truncate(raw, dims)
        const hits = semanticSearch(
          this.#index,
          q,
          k,
          this.#opts.minSemanticScore,
        )
        // Nothing close enough semantically: keywords may still match exact identifiers.
        if (hits.length) return { mode: 'semantic', degraded: false, hits }
        return {
          mode: 'keyword',
          degraded: false,
          hits: this.#keyword.search(query, k),
        }
      } catch {
        this.#downUntil = now + (this.#opts.cooldownMs ?? 30_000)
      }
    }

    return {
      mode: 'keyword',
      // Reached only when semantic search was not used or failed: always a degraded answer.
      degraded: true,
      hits: this.#keyword.search(query, k),
    }
  }
}
