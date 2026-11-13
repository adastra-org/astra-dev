// Lexical match on native NAMES. The name is the densest description of a native
// (`GET_VEHICLE_NUMBER_PLATE_TEXT` = get + vehicle + number + plate + text), so a question that
// says "obtengo la matrícula de un vehículo" can be matched on it through the Spanish -> English
// glossary, which embeddings of an English index do not do reliably. Used next to the semantic
// ranking (see `fuse` in search.ts), never alone.
import type { IndexedChunk } from './store.ts'
import { translate } from './glossary.ts'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const stem = (t: string) =>
  t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t

/** Words of a native name: `_GET_VEHICLE_CLASS` -> get, vehicle, class. */
const nameWords = (name: string): string[] =>
  fold(name)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1)
    .map(stem)

/** Verbs that open names: they say little about WHICH native, so they weigh almost nothing. */
const VERBS = new Set(['get', 'set', 'is', 'has', 'are', 'can', 'add', 'does'])

export interface NameHit {
  chunk: IndexedChunk
  score: number
}

export class NativeNameIndex {
  readonly #rows: { chunk: IndexedChunk; words: string[] }[] = []
  readonly #df = new Map<string, number>()

  constructor(chunks: readonly IndexedChunk[]) {
    for (const c of chunks) {
      if (!c.native) continue
      const words = [...new Set(nameWords(c.native.name))]
      if (!words.length) continue
      this.#rows.push({ chunk: c, words })
      for (const w of words) this.#df.set(w, (this.#df.get(w) ?? 0) + 1)
    }
  }

  get size(): number {
    return this.#rows.length
  }

  #idf(w: string): number {
    const df = this.#df.get(w) ?? 0
    const base = Math.log(1 + (this.#rows.length - df + 0.5) / (df + 0.5))
    return VERBS.has(w) ? base * 0.15 : base
  }

  /**
   * Query words that exist in some native name, as groups: each asked word with the English words
   * it can stand for. A group counts once, whichever of its forms the name has.
   */
  #groups(tokens: readonly string[]): string[][] {
    const groups: string[][] = []
    for (const t of tokens) {
      const forms = [...new Set([t, ...translate(t)].map(stem))].filter((w) =>
        this.#df.has(w),
      )
      if (forms.length) groups.push(forms)
    }
    return groups
  }

  /** Best matches, best first. `tokens` are normalised query words (see `tokenize`). */
  search(tokens: readonly string[], k: number): NameHit[] {
    const groups = this.#groups(tokens)
    if (!groups.length) return []
    const weight = groups.map((g) => Math.max(...g.map((w) => this.#idf(w))))
    const recallDen = weight.reduce((a, b) => a + b, 0)
    const out: NameHit[] = []
    for (const { chunk, words } of this.#rows) {
      const set = new Set(words)
      let hit = 0
      let content = false
      groups.forEach((g, i) => {
        const w = g.find((f) => set.has(f))
        if (w === undefined) return
        hit += weight[i]!
        if (!VERBS.has(w)) content = true
      })
      // A verb alone ("get") matches thousands of natives and says nothing.
      if (!content) continue
      const nameDen = words.reduce((a, w) => a + this.#idf(w), 0)
      const recall = hit / recallDen
      const precision = Math.min(1, hit / nameDen)
      const f1 = (2 * recall * precision) / (recall + precision)
      if (f1 > 0) out.push({ chunk, score: f1 })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, k)
  }
}
