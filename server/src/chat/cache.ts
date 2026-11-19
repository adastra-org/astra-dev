// Answer cache. Maps (normalized question + retrieved source ids + who may see them) to a finished
// answer, so a repeated question costs no model call and no budget. Process-local, bounded (LRU)
// and with a TTL, like the other in-memory limits.
//
// Safety rules:
// - The key includes the viewer's role and the ids of the sources the model would be shown. If two
//   viewers can be shown different context (today they cannot; every chat role sees the same
//   corpus), they get different keys and never share an answer.
// - The key includes the (sanitized) conversation history: a follow-up is a different question.
// - Only complete, successful answers are stored. Errors and truncated answers never are.
// - Keys are hashes. The question and the answer are never logged.
import { createHash } from 'node:crypto'
import type { Role } from '../config.ts'
import type { HistoryTurn } from './prompt.ts'

export interface CachedAnswer {
  text: string
  cited: number[]
  refused: boolean
}

export interface AnswerCacheOptions {
  /** 0 disables the cache. */
  maxEntries: number
  ttlMs: number
  now?: () => number
}

/** Lowercase, no accents, no ornamental punctuation, single spaces. "¿Cómo  funciona?" -> "como funciona". */
export function normalizeQuestion(q: string): string {
  return q
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface CacheKeyInput {
  role: Role
  question: string
  history: HistoryTurn[]
  /** Chunk ids of the sources placed in the prompt, in prompt order. */
  sourceIds: string[]
  /** What the answer may depend on besides the sources: UI language, day and repo head. NOT the user: one answer is shared by everyone of the same role. */
  context?: string
}

export function cacheKey(input: CacheKeyInput): string {
  const payload = JSON.stringify([
    input.role,
    normalizeQuestion(input.question),
    input.history.map((t) => [t.role, normalizeQuestion(t.content)]),
    input.sourceIds,
    input.context ?? '',
  ])
  return createHash('sha256').update(payload).digest('hex')
}

export class AnswerCache {
  readonly #max: number
  readonly #ttl: number
  readonly #now: () => number
  readonly #map = new Map<string, { value: CachedAnswer; expires: number }>()

  constructor(opts: AnswerCacheOptions) {
    this.#max = Math.max(0, opts.maxEntries)
    this.#ttl = opts.ttlMs
    this.#now = opts.now ?? Date.now
  }

  get enabled(): boolean {
    return this.#max > 0 && this.#ttl > 0
  }

  get size(): number {
    return this.#map.size
  }

  get(key: string): CachedAnswer | null {
    if (!this.enabled) return null
    const hit = this.#map.get(key)
    if (!hit) return null
    if (hit.expires <= this.#now()) {
      this.#map.delete(key)
      return null
    }
    // Refresh recency (Map keeps insertion order: the first key is the least recently used).
    this.#map.delete(key)
    this.#map.set(key, hit)
    return hit.value
  }

  set(key: string, value: CachedAnswer): void {
    if (!this.enabled) return
    this.#map.delete(key)
    this.#map.set(key, { value, expires: this.#now() + this.#ttl })
    this.#evict()
  }

  #evict() {
    const now = this.#now()
    if (this.#map.size > this.#max) {
      // Drop expired entries first, then the least recently used.
      for (const [k, v] of this.#map) if (v.expires <= now) this.#map.delete(k)
    }
    while (this.#map.size > this.#max) {
      const oldest = this.#map.keys().next().value
      if (oldest === undefined) break
      this.#map.delete(oldest)
    }
  }
}
