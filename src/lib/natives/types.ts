// Tipos compartidos entre el build (scripts/natives) y la app (src) para los natives publicados.
// Tipos y el codec del índice (sin dependencias, corre igual en el build y en el navegador).
import type { Section, TocItem, Translated } from '../docs/types'

export type NativeSource = 'gta' | 'cfx'

/** Un namespace de GTA (`VEHICLE`) o un apiset de CFX (`client`). Es la unidad del sidebar. */
export interface NativeGroup {
  /** Estable y apto para URL: `gta-vehicle`, `cfx-client`. */
  id: string
  source: NativeSource
  /** `VEHICLE`, o `client`/`server`/`shared` en CFX. */
  label: string
  count: number
}

/** Fila del índice de búsqueda: lo mínimo para listar y encontrar un native. */
export interface NativeRow {
  slug: string
  /** `SET_VEHICLE_DOOR_OPEN`. */
  name: string
  /** `SetVehicleDoorOpen`: el nombre que se escribe en Lua. */
  luaName: string
  group: string
  /** Hashes en mayúsculas con `0x`. */
  hashes: string[]
  /** Primera frase de la descripción, en texto plano (vacía si no hay). */
  summary: string
  /** Idioma del resumen: `es` solo si hay traducción. */
  translated?: Translated
}

/** Cuerpo de un native en un idioma: lo que pinta la página. */
export interface NativeVariant {
  summary: string
  sections: Section[]
  toc: TocItem[]
}

export interface NativeRef {
  slug: string
  name: string
  luaName: string
}

/** Lo que carga la página de un native (`/data/natives/<slug>.json`). */
export interface NativeContent {
  slug: string
  name: string
  luaName: string
  source: NativeSource
  group: string
  /** Namespace (`VEHICLE`); en CFX, `CFX`. */
  ns: string
  apiset: 'client' | 'server' | 'shared' | null
  hashes: string[]
  signature: string
  /** Natives enlazados desde la descripción (`seeAlso` de la fuente). */
  seeAlso: NativeRef[]
  /** Slugs de los docs que lo mencionan. */
  mentionedIn: string[]
  /** Archivo original (repo y ruta fijados al sha importado). */
  originUrl: string
  /** Hay una nota propia de Astra (`content/overrides/natives/`). */
  hasAstraNotes: boolean
  /** Idiomas disponibles; `en` siempre. */
  variants: { en: NativeVariant; es?: NativeVariant }
  /** Flag de la traducción `es`, si existe. */
  translated?: Translated
}

/** Índice completo, ya decodificado. En el archivo las filas son tuplas para ahorrar bytes. */
export interface NativeIndex {
  groups: NativeGroup[]
  rows: NativeRow[]
}

/** Forma en disco del índice (`/data/natives/index.json`). */
export interface NativeIndexFile {
  v: 1
  groups: NativeGroup[]
  /** [slug, name, luaName, índice de grupo, hashes separados por espacio, resumen, flag es]. */
  rows: [string, string, string, number, string, string, 0 | 1 | 2][]
}

export function encodeIndex(index: NativeIndex): NativeIndexFile {
  const at = new Map(index.groups.map((g, i) => [g.id, i]))
  return {
    v: 1,
    groups: index.groups,
    rows: index.rows.map((r) => [
      r.slug,
      r.name,
      r.luaName,
      at.get(r.group) ?? 0,
      r.hashes.join(' '),
      r.summary,
      r.translated === 'reviewed' ? 2 : r.translated === 'auto' ? 1 : 0,
    ]),
  }
}

export function decodeIndex(file: NativeIndexFile): NativeIndex {
  return {
    groups: file.groups,
    rows: file.rows.map(([slug, name, luaName, g, hashes, summary, t]) => ({
      slug,
      name,
      luaName,
      group: file.groups[g]?.id ?? '',
      hashes: hashes ? hashes.split(' ') : [],
      summary,
      ...(t
        ? { translated: t === 2 ? ('reviewed' as const) : ('auto' as const) }
        : {}),
    })),
  }
}
