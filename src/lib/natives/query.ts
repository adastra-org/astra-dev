// Búsqueda de natives sobre el índice compacto. Pura (sin fetch ni módulo virtual): la usan el
// palette, la página de natives y las pruebas. El orden es "exacto primero": un nombre completo o
// un hash encuentra el native, no una nube de parecidos (los identificadores no se buscan bien
// por semántica; eso es del índice de Ask Ether).
import { fold } from '../docs-query'
import type { NativeRow } from './types'

export interface PreparedNative {
  row: NativeRow
  /** `SET_VEHICLE_DOOR_OPEN` y `SetVehicleDoorOpen` → `setvehicledooropen`. */
  flat: string
  /** `set vehicle door open`: para buscar por palabras. */
  spaced: string
  summary: string
  /** Hashes sin `0x`, en mayúsculas. */
  hashes: string[]
}

const flatten = (s: string) => fold(s).replace(/[^a-z0-9]/g, '')

export function prepareNatives(rows: readonly NativeRow[]): PreparedNative[] {
  return rows.map((row) => ({
    row,
    flat: flatten(row.name),
    spaced: fold(row.name.replace(/_/g, ' ')),
    summary: fold(row.summary),
    hashes: row.hashes.map((h) => h.replace(/^0x/i, '').toUpperCase()),
  }))
}

/** Un hash escrito a mano: `0xBB75D38B`, o 8 a 16 dígitos hexadecimales seguidos. */
export function hashQuery(q: string): string | null {
  const t = q.trim()
  const m = /^(?:0x)?([0-9a-f]{8,16})$/i.exec(t)
  if (m?.[1]) return m[1].toUpperCase()
  const short = /^0x([0-9a-f]{1,7})$/i.exec(t)
  return short?.[1] ? short[1].toUpperCase() : null
}

export const NATIVE_TIER = {
  hash: 6000,
  exact: 5000,
  prefix: 4000,
  contains: 3000,
  words: 2000,
  summary: 1000,
} as const

export interface NativeHit {
  row: NativeRow
  score: number
  /** El hash que coincidió, si la consulta era un hash. */
  hash?: string
}

export function scoreNative(
  p: PreparedNative,
  q: { flat: string; words: string[]; hash: string | null },
): { score: number; hash?: string } {
  if (q.hash) {
    const exact = p.hashes.find((h) => h === q.hash)
    if (exact) return { score: NATIVE_TIER.hash, hash: `0x${exact}` }
    const part = p.hashes.find((h) => h.startsWith(q.hash as string))
    if (part && q.hash.length >= 6)
      return { score: NATIVE_TIER.hash - 1000, hash: `0x${part}` }
  }
  if (!q.flat) return { score: 0 }
  const len = Math.min(p.flat.length, 999)
  if (p.flat === q.flat) return { score: NATIVE_TIER.exact }
  if (p.flat.startsWith(q.flat)) return { score: NATIVE_TIER.prefix - len }
  if (p.flat.includes(q.flat)) return { score: NATIVE_TIER.contains - len }
  if (q.words.length > 1 && q.words.every((w) => p.spaced.includes(w)))
    return { score: NATIVE_TIER.words - len }
  if (q.words.every((w) => p.summary.includes(w)))
    return { score: NATIVE_TIER.summary - len }
  return { score: 0 }
}

/** Mejores `limit` natives para la consulta; vacía o de un carácter no devuelve nada. */
export function searchNatives(
  prepared: readonly PreparedNative[],
  query: string,
  limit = 8,
): NativeHit[] {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const q = {
    flat: flatten(trimmed),
    words: fold(trimmed.replace(/_/g, ' ')).split(/\s+/).filter(Boolean),
    hash: hashQuery(trimmed),
  }
  const hits: NativeHit[] = []
  for (const p of prepared) {
    const { score, hash } = scoreNative(p, q)
    if (score > 0) hits.push({ row: p.row, score, ...(hash ? { hash } : {}) })
  }
  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.row.name.length - b.row.name.length ||
        a.row.name.localeCompare(b.row.name),
    )
    .slice(0, limit)
}

/** Filas de un grupo, por nombre. */
export const rowsOfGroup = (rows: readonly NativeRow[], group: string) =>
  rows
    .filter((r) => r.group === group)
    .sort((a, b) => a.name.localeCompare(b.name))
