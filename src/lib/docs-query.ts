// Consultas puras sobre la lista de docs (índice, filtro, resolución de enlaces). Sin el módulo
// virtual, para poder probarlas con `bun test`.
import { tagLabel } from '@/config/tags'
import type { DocMeta } from './docs/types'

const collator = new Intl.Collator('es')

/** Minúsculas y sin tildes: "diseno" encuentra "Diseño". */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export interface DocGroup {
  tag: string
  docs: DocMeta[]
}

/** Agrupa por el primer tag; grupos y docs ordenados alfabéticamente por etiqueta y título. */
export function groupByTag(docs: readonly DocMeta[]): DocGroup[] {
  const map = new Map<string, DocMeta[]>()
  for (const d of docs) {
    const tag = d.tags[0] ?? 'otros'
    map.set(tag, [...(map.get(tag) ?? []), d])
  }
  return [...map.entries()]
    .map(([tag, list]) => ({
      tag,
      docs: [...list].sort((a, b) => collator.compare(a.title, b.title)),
    }))
    .sort((a, b) => collator.compare(tagLabel(a.tag), tagLabel(b.tag)))
}

/** Filtra por título o tag (cualquiera de los tags). Todas las palabras de la consulta deben coincidir. */
export function filterDocs(docs: readonly DocMeta[], query: string): DocMeta[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return [...docs]
  return docs.filter((d) => {
    const hay = fold([d.title, ...d.tags, ...d.tags.map(tagLabel)].join(' '))
    return words.every((w) => hay.includes(w))
  })
}

/** Docs por slug, descartando los que no existen (un `related` roto solo avisa en el build). */
export function resolveSlugs(
  docs: readonly DocMeta[],
  slugs: readonly string[],
): DocMeta[] {
  const by = new Map(docs.map((d) => [d.slug, d]))
  return slugs.flatMap((s) => by.get(s) ?? [])
}
