// Formatos del dashboard de IA. Sin React: se prueban con `bun test`.
import type { UiLang as Lang } from '@/lib/i18n'

const num = (lang: Lang, o: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(lang === 'es' ? 'es' : 'en', o)

/** Duración corta: "340 ms", "6,9 s", "12 min", "1 h 12 min". Sin dato, un guion. */
export function formatDuration(ms: number | null, lang: Lang = 'es'): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  const s = ms / 1000
  if (s < 60) return `${num(lang, { maximumFractionDigits: 1 }).format(s)} s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`
}

/** Tokens: entero con separador hasta 9.999, luego "12,3 k" / "1,2 M". */
export function formatTokens(n: number, lang: Lang = 'es'): string {
  if (n >= 1_000_000)
    return `${num(lang, { maximumFractionDigits: 1 }).format(n / 1_000_000)} M`
  if (n >= 10_000)
    return `${num(lang, { maximumFractionDigits: 1 }).format(n / 1000)} k`
  return num(lang, { maximumFractionDigits: 0 }).format(n)
}

/** Dólares estimados: cuatro decimales por debajo de un centavo, dos desde ahí. */
export function formatUsd(v: number, lang: Lang = 'es'): string {
  const digits = v > 0 && v < 0.01 ? 4 : 2
  return num(lang, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v)
}

export const formatPercent = (ratio: number, lang: Lang = 'es'): string =>
  num(lang, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)

export const formatRate = (v: number | null, lang: Lang = 'es'): string =>
  v === null ? '—' : num(lang, { maximumFractionDigits: 1 }).format(v)
