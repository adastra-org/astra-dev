import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatTick, labelIndexes, niceTicks } from '@/lib/project/series'
import { ChartCard, DataTable, Legend, Tooltip } from './shared'
import {
  leftMargin,
  MARGIN,
  useWidth,
  type Category,
  type Series,
} from './util'

const MAX_BAR = 24
const GAP = 2
const R = 4

/** Barra con el extremo de datos redondeado (4 px) y la base recta. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(R, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

export function ColumnChart({
  title,
  description,
  categories,
  series,
  height = 220,
  categoryHeader = 'Periodo',
  summary,
}: {
  title: string
  description?: string
  categories: readonly Category[]
  series: readonly Series[]
  height?: number
  categoryHeader?: string
  /** Una frase con lo que muestra, para lectores de pantalla. */
  summary: string
}) {
  const [wrap, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const n = categories.length
  const max = Math.max(0, ...series.flatMap((s) => s.values))
  const ticks = niceTicks(max)
  const top = ticks.at(-1)!
  const compactAxis = top >= 10_000
  const left = leftMargin(ticks, compactAxis)
  const plotW = Math.max(0, width - left - MARGIN.right)
  const plotH = height - MARGIN.top - MARGIN.bottom
  const y = (v: number) => MARGIN.top + plotH - (v / top) * plotH
  const band = n > 0 ? plotW / n : 0
  const k = series.length
  const bw = Math.max(2, Math.min(MAX_BAR, (band * 0.72 - (k - 1) * GAP) / k))
  const groupW = k * bw + (k - 1) * GAP
  const labels = labelIndexes(n, plotW)

  const at = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - rect.left - left) / band)
    setActive(i >= 0 && i < n ? i : null)
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
          categoryHeader={categoryHeader}
        />
      }
    >
      <div
        ref={wrap}
        className="relative"
        tabIndex={0}
        role="group"
        aria-label={`${title}. ${summary} Usa las flechas para recorrer los valores.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
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
                  x2={left + plotW}
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
                  {formatTick(t, compactAxis)}
                </text>
              </g>
            ))}
            {active !== null && (
              <rect
                x={left + active * band}
                y={MARGIN.top}
                width={band}
                height={plotH}
                fill="var(--surface-overlay)"
              />
            )}
            {categories.map((c, i) => {
              const gx = left + i * band + (band - groupW) / 2
              return (
                <g key={c.key}>
                  {series.map((s, j) => {
                    const v = s.values[i] ?? 0
                    if (v <= 0) return null
                    const h = Math.max(2, MARGIN.top + plotH - y(v))
                    return (
                      <path
                        key={s.id}
                        d={barPath(
                          gx + j * (bw + GAP),
                          MARGIN.top + plotH - h,
                          bw,
                          h,
                        )}
                        fill={s.color}
                      />
                    )
                  })}
                </g>
              )
            })}
            {labels.map((i) => {
              const cx = left + i * band + band / 2
              // El primero y el último no se salen del marco.
              const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'
              const x =
                anchor === 'start'
                  ? Math.max(left, cx - 8)
                  : anchor === 'end'
                    ? Math.min(left + plotW, cx + 8)
                    : cx
              return (
                <text
                  key={categories[i]!.key}
                  x={x}
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
            left={left + active * band + band / 2}
            plotWidth={width}
          />
        )}
      </div>
    </ChartCard>
  )
}
