import { ChartColumn, Table } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatValue } from '@/lib/project/series'
import { useLang } from '@/lib/use-lang'
import type { Category, Series } from './util'

export function Swatch({ series }: { series: Series }) {
  if (series.dashed)
    return (
      <svg width="16" height="4" aria-hidden="true">
        <line
          x1="0"
          y1="2"
          x2="16"
          y2="2"
          stroke={series.color}
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      </svg>
    )
  return (
    <span
      className="inline-block size-2.5 rounded-sm"
      style={{ background: series.color }}
      aria-hidden="true"
    />
  )
}

export function Legend({ series }: { series: readonly Series[] }) {
  // Una sola serie no necesita leyenda: el título ya dice qué se grafica.
  if (series.length < 2) return null
  return (
    <ul className="text-caption text-ink-muted flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <li key={s.id} className="flex items-center gap-2">
          <Swatch series={s} />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

export function Tooltip({
  title,
  series,
  index,
  left,
  plotWidth,
}: {
  title: string
  series: readonly Series[]
  index: number
  /** Posición X (px) del punto activo dentro del contenedor. */
  left: number
  plotWidth: number
}) {
  const { lang } = useLang()
  // Del lado izquierdo del punto cuando está en la mitad derecha, para no salirse.
  const flip = left > plotWidth * 0.6
  return (
    <div
      role="presentation"
      className="bg-surface-overlay text-body-sm pointer-events-none absolute top-1 z-10 min-w-36 rounded-md px-3 py-2 shadow-card"
      style={
        flip
          ? { right: `calc(100% - ${left}px + 10px)` }
          : { left: `${left + 10}px` }
      }
    >
      <p className="text-caption text-ink-muted mb-1">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {series.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <Swatch series={s} />
            <span className="text-ink text-label tabular-nums">
              {formatValue(s.values[index] ?? 0, lang)}
            </span>
            <span className="text-ink-muted text-caption">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DataTable({
  caption,
  categories,
  series,
  categoryHeader,
}: {
  caption: string
  categories: readonly Category[]
  series: readonly Series[]
  categoryHeader: string
}) {
  const { lang } = useLang()
  return (
    <div
      // Tabla ancha o larga: desplaza dentro de sí misma, enfocable con teclado.
      tabIndex={0}
      className="max-h-72 overflow-auto rounded-md"
    >
      <table className="text-body-sm w-full text-left tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-raised text-ink-muted sticky top-0">
          <tr>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {categoryHeader}
            </th>
            {series.map((s) => (
              <th
                key={s.id}
                scope="col"
                className="py-2 pr-4 text-right font-semibold"
              >
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c, i) => (
            <tr key={c.key} className="even:bg-surface-sunken">
              <th scope="row" className="text-ink py-1.5 pr-4 font-normal">
                {c.label}
              </th>
              {series.map((s) => (
                <td key={s.id} className="text-ink py-1.5 pr-4 text-right">
                  {formatValue(s.values[i] ?? 0, lang)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Marco de un gráfico: título, leyenda, alternancia gráfico/tabla y el cuerpo. */
export function ChartCard({
  title,
  description,
  legend,
  table,
  children,
}: {
  title: string
  description?: string
  legend?: ReactNode
  /** Vista de tabla; si no se pasa, no hay botón. */
  table?: ReactNode
  children: ReactNode
}) {
  const { tr } = useLang()
  const [asTable, setAsTable] = useState(false)
  return (
    <figure className="bg-surface-raised border-border flex min-w-0 flex-col gap-3 rounded-md border p-4">
      <figcaption className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-h4 [text-wrap:balance]">{title}</h3>
          {table && (
            <button
              type="button"
              aria-pressed={asTable}
              onClick={() => setAsTable((v) => !v)}
              className="text-label text-ink-muted hover:bg-surface-overlay hover:text-ink flex min-h-11 shrink-0 items-center gap-2 rounded-pill px-3 transition-colors lg:min-h-8"
            >
              {asTable ? (
                <ChartColumn className="size-4" aria-hidden="true" />
              ) : (
                <Table className="size-4" aria-hidden="true" />
              )}
              {asTable ? tr('rm.chart.viewChart') : tr('rm.chart.viewTable')}
            </button>
          )}
        </div>
        {description && (
          <p className="text-body-sm text-ink-muted max-w-prose">
            {description}
          </p>
        )}
      </figcaption>
      {legend}
      {asTable && table ? table : children}
    </figure>
  )
}
