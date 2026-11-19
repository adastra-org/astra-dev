// Utilidades puras de los gráficos: agrupar días, ejes con números redondos y formatos.
import type { EvolutionDay } from './types'

export interface Bucket {
  /** Primer día del grupo (`YYYY-MM-DD`). */
  start: string
  /** Último día del grupo. */
  end: string
  opened: number
  closed: number
  commits: number
}

/** Agrupa días consecutivos de a `size`, contando desde el final (el grupo más nuevo queda completo). */
export function bucketDays(
  daily: readonly EvolutionDay[],
  size: number,
): Bucket[] {
  if (size <= 1)
    return daily.map((d) => ({
      start: d.date,
      end: d.date,
      opened: d.opened,
      closed: d.closed,
      commits: d.commits,
    }))
  const out: Bucket[] = []
  for (let end = daily.length; end > 0; end -= size) {
    const slice = daily.slice(Math.max(0, end - size), end)
    out.unshift({
      start: slice[0]!.date,
      end: slice.at(-1)!.date,
      opened: slice.reduce((n, d) => n + d.opened, 0),
      closed: slice.reduce((n, d) => n + d.closed, 0),
      commits: slice.reduce((n, d) => n + d.commits, 0),
    })
  }
  return out
}

/** Hasta 30 días se ve cada día; más allá, semanas. */
export const bucketSizeFor = (days: number) => (days <= 30 ? 1 : 7)

/** Marcas del eje Y: números redondos de 0 a un tope >= max (1, 2, 5 o 10 por década). */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1]
  const raw = max / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step =
    [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const ticks: number[] = []
  for (let v = 0; ; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6)
    if (v >= max) break
  }
  return ticks
}

type Lang = 'es' | 'en'

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>()
const numberFmt = (lang: Lang, opts: Intl.NumberFormatOptions) => {
  const key = `n:${lang}:${JSON.stringify(opts)}`
  let f = cache.get(key)
  if (!f) cache.set(key, (f = new Intl.NumberFormat(lang, opts)))
  return f as Intl.NumberFormat
}
const dateFmt = (lang: Lang, opts: Intl.DateTimeFormatOptions) => {
  const key = `d:${lang}:${JSON.stringify(opts)}`
  let f = cache.get(key)
  if (!f) cache.set(key, (f = new Intl.DateTimeFormat(lang, opts)))
  return f as Intl.DateTimeFormat
}

/** Entero completo, o compacto (10 mil) cuando el eje llega a las decenas de miles. */
export const formatTick = (
  v: number,
  compactAxis: boolean,
  lang: Lang = 'es',
) =>
  compactAxis
    ? numberFmt(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(
        v,
      )
    : numberFmt(lang, { maximumFractionDigits: 1 }).format(v)

export const formatValue = (v: number, lang: Lang = 'es') =>
  numberFmt(lang, { maximumFractionDigits: 1 }).format(v)

/** `YYYY-MM-DD` a "12 nov" / "Nov 12". */
export const formatDay = (iso: string, lang: Lang = 'es') =>
  dateFmt(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  )

export const formatRange = (start: string, end: string, lang: Lang = 'es') =>
  start === end
    ? formatDay(start, lang)
    : `${formatDay(start, lang)} – ${formatDay(end, lang)}`

export const formatStamp = (iso: string, lang: Lang = 'es') =>
  dateFmt(lang, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

/**
 * Índices del eje X a rotular: una marca cada `minPx` como mucho, siempre el primero y el último
 * (si el último queda pegado al anterior, el anterior cede).
 */
export function labelIndexes(
  count: number,
  widthPx: number,
  minPx = 64,
): number[] {
  if (count <= 0) return []
  const fit = Math.max(2, Math.floor(widthPx / minPx))
  if (count <= fit) return Array.from({ length: count }, (_, i) => i)
  const step = Math.ceil((count - 1) / (fit - 1))
  const out: number[] = []
  for (let i = 0; i < count; i += step) out.push(i)
  if (out.at(-1) !== count - 1) {
    if (count - 1 - out.at(-1)! < step / 2) out.pop()
    out.push(count - 1)
  }
  return out
}
