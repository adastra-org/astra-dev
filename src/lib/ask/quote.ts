// Citar un fragmento de una respuesta en la pregunta siguiente, con las fuentes de ese fragmento.
// Sin React ni DOM: la selección la lee `components/ask/useAnswerSelection.ts` y entrega texto más
// los números `[n]` que el modelo citó dentro o junto al fragmento.
import { ASK_MAX_QUESTION, type AskSource } from './types'

/** Citas a la vez en el campo. */
export const QUOTE_MAX = 2
/** Caracteres de un fragmento. Entre los dos topes el prefijo cabe en `ASK_MAX_QUESTION` con espacio para escribir. */
export const QUOTE_MAX_CHARS = 160
/** Fuentes que se nombran en el texto que viaja al modelo, y largo de cada título. */
const WIRE_SOURCES = 2
const WIRE_TITLE_CHARS = 32

export type QuoteSource = Pick<
  AskSource,
  'n' | 'kind' | 'slug' | 'title' | 'path'
>

export interface Quote {
  /** Fragmento ya normalizado (espacios colapsados) y recortado. */
  text: string
  /** Fuentes que el modelo citó en el fragmento, o en su párrafo si el fragmento no traía citas. */
  sources: QuoteSource[]
}

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

const clip = (s: string, max: number): string =>
  s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`

/**
 * Arma una cita. `cites` son los `[n]` hallados (pueden repetirse o no existir): solo quedan los
 * que corresponden a una fuente recibida, sin repetir y en orden. Vacío si no hay texto.
 */
export function makeQuote(
  raw: string,
  cites: readonly number[],
  sources: readonly AskSource[],
): Quote | null {
  const text = clip(squash(raw), QUOTE_MAX_CHARS)
  if (!text) return null
  const seen = new Set<number>()
  const picked: QuoteSource[] = []
  for (const n of cites) {
    if (seen.has(n)) continue
    seen.add(n)
    const s = sources.find((x) => x.n === n)
    if (s)
      picked.push({
        n: s.n,
        kind: s.kind,
        slug: s.slug,
        title: s.title,
        path: s.path,
      })
  }
  return { text, sources: picked }
}

/** Agrega una cita. Una repetida no suma; al pasar el tope se va la más vieja. */
export function addQuote(list: readonly Quote[], q: Quote): Quote[] {
  if (list.some((x) => x.text === q.text)) return [...list]
  return [...list, q].slice(-QUOTE_MAX)
}

/** Slugs únicos de las fuentes de las citas, en orden (lo que el server usa en `sources`). */
export function quoteSlugs(quotes: readonly Quote[]): string[] {
  return [...new Set(quotes.flatMap((q) => q.sources.map((s) => s.slug)))]
}

function line(q: Quote): string {
  const names = q.sources
    .slice(0, WIRE_SOURCES)
    .map((s) => clip(s.title, WIRE_TITLE_CHARS))
  return `«${q.text}»${names.length ? ` (${names.join('; ')})` : ''}\n`
}

/** Texto que antecede a la pregunta en lo que se envía al modelo. Vacío sin citas. */
export function quotePrefix(quotes: readonly Quote[]): string {
  return quotes.length ? `${quotes.map(line).join('')}\n` : ''
}

/** Largo máximo de lo que la persona escribe cuando hay citas en el campo. */
export function questionRoom(quotes: readonly Quote[]): number {
  return Math.max(0, ASK_MAX_QUESTION - quotePrefix(quotes).length)
}

/**
 * Pregunta tal como viaja: las citas (fragmento y títulos de sus fuentes) y debajo lo escrito.
 * Si juntos pasaran el tope del server, se recorta lo escrito, nunca el fragmento.
 */
export function composeQuestion(
  quotes: readonly Quote[],
  question: string,
): string {
  if (!quotes.length) return question
  return quotePrefix(quotes) + question.slice(0, questionRoom(quotes))
}
