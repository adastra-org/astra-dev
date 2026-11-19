// Exact lookup of natives by name, Lua name, alias or hash. Embeddings and BM25 are poor at
// identifiers (`GET_ENTITY_COORDS`, `0xBB75D38B`), so a native named in the query is found here and
// ranked first, whatever else the semantic search returns.
import type { IndexedChunk } from './store.ts'

/** `SetVehicleDoorOpen` and `SET_VEHICLE_DOOR_OPEN` share a key. */
export const nameKey = (s: string): string =>
  s.replace(/[^A-Za-z0-9]/g, '').toUpperCase()

const HASH = /^0x[0-9a-f]{1,16}$/i

/** `0x00ab` and `0xAB` are the same hash. */
export const hashKey = (h: string): string =>
  `0x${h
    .replace(/^0x/i, '')
    .replace(/^0+(?=.)/, '')
    .toUpperCase()}`

/** Names that read as identifiers inside a sentence: snake_case or camel/Pascal with 2+ words. */
const looksLikeIdentifier = (t: string): boolean =>
  t.includes('_') || /[a-z][A-Z]/.test(t)

export class NativeLookup {
  readonly #byName = new Map<string, Set<IndexedChunk>>()
  readonly #byHash = new Map<string, Set<IndexedChunk>>()

  constructor(chunks: readonly IndexedChunk[]) {
    const add = (
      m: Map<string, Set<IndexedChunk>>,
      k: string,
      c: IndexedChunk,
    ) => {
      const set = m.get(k) ?? new Set()
      set.add(c)
      m.set(k, set)
    }
    for (const c of chunks) {
      const n = c.native
      if (!n) continue
      for (const name of [n.name, n.luaName])
        if (nameKey(name).length >= 3) add(this.#byName, nameKey(name), c)
      for (const h of n.hashes) add(this.#byHash, hashKey(h), c)
      // Aliases are old names or hashes (`_0xE26C…`, `0xE26C…`).
      for (const a of n.aliases) {
        const bare = a.replace(/^_/, '')
        if (HASH.test(bare)) add(this.#byHash, hashKey(bare), c)
        else if (nameKey(a).length >= 3) add(this.#byName, nameKey(a), c)
      }
    }
  }

  get size(): number {
    return new Set([...this.#byName.values()].flatMap((s) => [...s])).size
  }

  /** GTA first when CFX redefines the name (the client native, as `native_link` does). */
  #lookup(token: string): IndexedChunk[] {
    const bare = token.replace(/^_/, '')
    const found = HASH.test(bare)
      ? this.#byHash.get(hashKey(bare))
      : this.#byName.get(nameKey(token))
    return [...(found ?? [])].sort(
      (a, b) =>
        Number(b.native?.source === 'gta') - Number(a.native?.source === 'gta'),
    )
  }

  /**
   * Natives the query names. A query that is a single token matches by any name or hash. Inside a
   * sentence only hashes and identifier-looking tokens count, so "wait for the resource" does not
   * pin the `WAIT` native.
   */
  find(query: string, max = 4): IndexedChunk[] {
    const clean = query
      .trim()
      .replace(/[`'"]/g, '')
      .replace(/\(.*\)\s*;?$/, '')
      .replace(/[;.]+$/, '')
    const tokens = /\s/.test(clean)
      ? (
          query.match(/0x[0-9a-fA-F]{6,16}\b|[A-Za-z_][A-Za-z0-9_]{3,}/g) ?? []
        ).filter((t) => HASH.test(t) || looksLikeIdentifier(t))
      : [clean]
    const out: IndexedChunk[] = []
    const seen = new Set<string>()
    for (const t of tokens) {
      if (!t) continue
      for (const c of this.#lookup(t)) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        out.push(c)
        if (out.length >= max) return out
      }
    }
    return out
  }
}
