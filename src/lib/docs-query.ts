// Consultas puras sobre la lista de docs (índice, filtro, resolución de enlaces). Sin el módulo
// virtual, para poder probarlas con `bun test`.
import { tagLabel } from '@/config/tags'
import type { DocLang, DocMeta, Translated } from './docs/types'

const collator = new Intl.Collator('es')

/** Minúsculas y sin tildes: "diseno" encuentra "Diseño". */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Lo que se muestra de un doc en un idioma: título, resumen y el flag si es una traducción. */
export interface DocDisplay {
  title: string
  summary: string
  lang: DocLang
  /** Presente solo cuando el texto mostrado es una traducción. */
  translated?: Translated
}

/**
 * Texto del doc en el idioma pedido. Si no hay traducción cae al original (el del doc), así que un
 * doc sin traducir sigue viéndose. El flag `translated` solo aparece cuando de verdad se muestra
 * una traducción (la del frontmatter del propio doc o la de `translations`).
 */
export function displayDoc(doc: DocMeta, want: DocLang = 'es'): DocDisplay {
  const t =
    want === 'es' && doc.lang !== 'es' ? doc.translations?.es : undefined
  if (t)
    return {
      title: t.title,
      summary: t.summary,
      lang: want,
      translated: t.translated,
    }
  return {
    title: doc.title,
    summary: doc.summary,
    lang: doc.lang,
    ...(doc.translated ? { translated: doc.translated } : {}),
  }
}

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
      docs: [...list].sort((a, b) =>
        collator.compare(displayDoc(a).title, displayDoc(b).title),
      ),
    }))
    .sort((a, b) => collator.compare(tagLabel(a.tag), tagLabel(b.tag)))
}

/** Filtra por título o tag (cualquiera de los tags). Todas las palabras de la consulta deben coincidir. */
export function filterDocs(docs: readonly DocMeta[], query: string): DocMeta[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return [...docs]
  return docs.filter((d) => {
    const hay = fold(
      [
        d.title,
        displayDoc(d).title,
        ...d.tags,
        ...d.tags.flatMap((t) => [tagLabel(t), tagLabel(t, 'en')]),
      ].join(' '),
    )
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

export interface MatchFields {
  title: string
  /** Etiquetas y sinónimos: pesan menos que el título y más que el cuerpo. */
  keywords?: readonly string[]
  /** Texto largo (resumen): último recurso. */
  body?: string
}

/** Peso de cada nivel de coincidencia; el título más corto desempata dentro del nivel. */
export const TIER = {
  titlePrefix: 4000,
  titleMatch: 3000,
  keyword: 2000,
  body: 1000,
} as const

/**
 * Puntaje de una consulta contra los campos de un ítem; 0 si no coincide. Todas las palabras
 * deben aparecer en algún campo. Orden: título que empieza con la consulta > título que la
 * contiene (o contiene todas las palabras) > etiqueta > cuerpo. Sin tildes ni mayúsculas.
 */
export function scoreMatch(query: string, f: MatchFields): number {
  const fq = fold(query).trim().replace(/\s+/g, ' ')
  if (!fq) return 0
  const words = fq.split(' ')
  const title = fold(f.title)
  const keywords = fold((f.keywords ?? []).join(' '))
  const body = fold(f.body ?? '')
  const inAny = (w: string) =>
    title.includes(w) || keywords.includes(w) || body.includes(w)
  if (!words.every(inAny)) return 0
  const tier = title.startsWith(fq)
    ? TIER.titlePrefix
    : title.includes(fq) || words.every((w) => title.includes(w))
      ? TIER.titleMatch
      : words.every((w) => title.includes(w) || keywords.includes(w))
        ? TIER.keyword
        : TIER.body
  return tier - Math.min(title.length, 999)
}

export interface RankedDoc {
  doc: DocMeta
  score: number
  /** Tags (slugs) que coinciden con alguna palabra de la consulta, para mostrarlos como chips. */
  matchedTags: string[]
}

/**
 * Busca docs por título, tags y resumen, mejor coincidencia primero. Consulta vacía: todos, por
 * título. Empates: orden alfabético.
 */
export function rankDocs(docs: readonly DocMeta[], query: string): RankedDoc[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const ranked = docs.flatMap((doc): RankedDoc[] => {
    const score = words.length
      ? scoreMatch(query, {
          title: displayDoc(doc).title,
          keywords: [
            ...doc.tags,
            ...doc.tags.flatMap((t) => [tagLabel(t), tagLabel(t, 'en')]),
          ],
          // Resumen en el idioma mostrado y, si hay traducción, también el original (los
          // identificadores y nombres en inglés se siguen encontrando).
          body:
            displayDoc(doc).lang === doc.lang
              ? doc.summary
              : `${displayDoc(doc).summary} ${doc.title} ${doc.summary}`,
        })
      : 1
    if (!score) return []
    const matchedTags = doc.tags.filter((t) => {
      const hay = fold(`${t} ${tagLabel(t)}`)
      return words.some((w) => hay.includes(w))
    })
    return [{ doc, score, matchedTags }]
  })
  return ranked.sort(
    (a, b) =>
      b.score - a.score ||
      collator.compare(displayDoc(a.doc).title, displayDoc(b.doc).title),
  )
}
