import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useLang } from '@/lib/use-lang'
import { formatTick, labelIndexes, niceTicks } from '@/lib/project/series'
import { ChartCard, DataTable, Legend, Tooltip } from './shared'
import {
  leftMargin,
  MARGIN,
  useWidth,
  type Category,
  type Series,
} from './util'

export function LineChart({
  title,
  description,
  categories,
  series,
  xValues,
  height = 220,
  categoryHeader,
  summary,
  compact = false,
}: {
  title: string
  description?: string
  categories: readonly Category[]
  series: readonly Series[]
  /** Posición X de cada categoría (p. ej. milisegundos). Sin esto, equiespaciadas. */
  xValues?: readonly number[]
  height?: number
  categoryHeader?: string
  summary: string
  compact?: boolean
}) {
  const { lang, tr } = useLang()
  const [wrap, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const n = categories.length
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const ticks = niceTicks(max, compact ? 3 : 4)
  const top = ticks.at(-1)!
  const compactAxis = top >= 10_000
  const left = leftMargin(ticks, compactAxis)
  // Aire a los lados para que el punto final y su anillo no se corten.
  const pad = 8
  const plotW = Math.max(0, width - left - MARGIN.right - pad * 2)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const y = (v: number) => MARGIN.top + plotH - (v / top) * plotH
  const span =
    xValues && n > 1 ? Math.max(1, xValues[n - 1]! - xValues[0]!) : n - 1
  const x = (i: number) =>
    left +
    pad +
    (n === 1
      ? plotW / 2
      : ((xValues ? xValues[i]! - xValues[0]! : i) / span) * plotW)
  const labels = labelIndexes(n, plotW, compact ? 72 : 64)

  const nearest = (clientX: number, rectLeft: number) => {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - (clientX - rectLeft))
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }
  const at = (e: PointerEvent<SVGSVGElement>) => {
    if (n === 0) return
    setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect().left))
  }
  const onKey = (e: KeyboardEvent) => {
    if (n === 0) return
    const cur = active ?? (e.key === 'ArrowLeft' ? n : -1)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = Math.min(n - 1, cur + 1)
    else if (e.key === 'ArrowLeft') next = Math.max(0, cur - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') setActive(null)
    if (next !== null) {
      e.preventDefault()
      setActive(next)
    }
  }

  const path = (s: Series) =>
    s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join('')
  // Una sola serie: un lavado del color debajo de la línea (10 %).
  const wash = series.length === 1 && !series[0]!.dashed

  return (
    <ChartCard
      title={title}
      description={description}
      legend={<Legend series={series} />}
      table={
        <DataTable
          caption={title}
          categories={categories}
          series={series}
          categoryHeader={categoryHeader ?? tr('rm.date')}
        />
      }
    >
      <div
        ref={wrap}
        className="relative"
        tabIndex={0}
        role="group"
        aria-label={tr('rm.chart.aria', { title, summary })}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        {width > 0 && n > 0 && (
          <svg
            width={width}
            height={height}
            role="presentation"
            className="touch-pan-y"
            onPointerMove={at}
            onPointerDown={at}
            onPointerLeave={() => setActive(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={left}
                  x2={left + plotW + pad * 2}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--chart-grid)"
                  strokeWidth="1"
                />
                <text
                  x={left - 8}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill="var(--chart-axis)"
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                >
                  {formatTick(t, compactAxis, lang)}
                </text>
              </g>
            ))}
            {wash && n > 1 && (
              <path
                d={`${path(series[0]!)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`}
                fill={series[0]!.color}
                opacity="0.1"
              />
            )}
            {active !== null && (
              <line
                x1={x(active)}
                x2={x(active)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotH}
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
            )}
            {series.map((s) => (
              <g key={s.id}>
                {n > 1 && (
                  <path
                    d={path(s)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? '4 4' : undefined}
                  />
                )}
                {!s.dashed && (
                  <circle
                    cx={x(active ?? n - 1)}
                    cy={y(s.values[active ?? n - 1] ?? 0)}
                    r="4"
                    fill={s.color}
                    stroke="var(--surface-raised)"
                    strokeWidth="2"
                  />
                )}
              </g>
            ))}
            {labels.map((i) => {
              const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
              const lx =
                anchor === 'start'
                  ? Math.max(left, x(i) - 8)
                  : anchor === 'end'
                    ? Math.min(left + plotW + pad * 2, x(i) + 8)
                    : x(i)
              return (
                <text
                  key={categories[i]!.key}
                  x={lx}
                  y={height - 8}
                  textAnchor={anchor}
                  fill="var(--chart-axis)"
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                >
                  {categories[i]!.axis}
                </text>
              )
            })}
          </svg>
        )}
        {active !== null && width > 0 && (
          <Tooltip
            title={categories[active]!.label}
            series={series}
            index={active}
            left={x(active)}
            plotWidth={width}
          />
        )}
      </div>
    </ChartCard>
  )
}
