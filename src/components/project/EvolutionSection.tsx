import {
  bucketDays,
  bucketSizeFor,
  formatDay,
  formatRange,
} from '@/lib/project/series'
import type { Evolution } from '@/lib/project/types'
import { ColumnChart } from './chart/ColumnChart'
import { LineChart } from './chart/LineChart'
import { EmptyNote } from './parts'
import { RANGES, type Range } from './ranges'

export function RangePicker({
  value,
  onChange,
}: {
  value: Range
  onChange: (r: Range) => void
}) {
  return (
    <div role="group" aria-label="Periodo" className="flex flex-wrap gap-2">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className="text-label bg-surface-raised text-ink-muted hover:bg-surface-overlay hover:text-ink aria-pressed:bg-accent-fill aria-pressed:text-on-accent flex min-h-11 items-center rounded-pill px-4 transition-colors lg:min-h-10"
        >
          {r} días
        </button>
      ))}
    </div>
  )
}

export function EvolutionSection({ data }: { data: Evolution }) {
  const size = bucketSizeFor(data.days)
  const buckets = bucketDays(data.daily, size)
  const unit = size === 1 ? 'día' : 'semana'
  const cats = buckets.map((b) => ({
    key: b.start,
    label: formatRange(b.start, b.end),
    axis: formatDay(b.start),
  }))
  const dayCats = data.daily.map((d) => ({
    key: d.date,
    label: formatDay(d.date),
    axis: formatDay(d.date),
  }))
  const b = data.burndown
  const last = b.points.at(-1)
  const first = b.points[0]

  return (
    <div className="flex flex-col gap-4">
      {data.truncated && (
        <EmptyNote>
          El repo tiene más historia de la que lee el server: los números más
          antiguos pueden faltar.
        </EmptyNote>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <ColumnChart
          title="Issues nuevos y cerrados"
          description={`Por ${unit}, en los últimos ${data.days} días.`}
          categories={cats}
          categoryHeader="Periodo"
          summary={`${data.totals.openIssues} issues abiertos hoy.`}
          series={[
            {
              id: 'opened',
              label: 'Nuevos',
              color: 'var(--chart-1)',
              values: buckets.map((x) => x.opened),
            },
            {
              id: 'closed',
              label: 'Cerrados',
              color: 'var(--chart-2)',
              values: buckets.map((x) => x.closed),
            },
          ]}
        />
        <ColumnChart
          title={`Commits en ${data.ref}`}
          description={`Por ${unit}, según la fecha del autor.`}
          categories={cats}
          categoryHeader="Periodo"
          summary={`${data.totals.commits} commits en el periodo.`}
          series={[
            {
              id: 'commits',
              label: 'Commits',
              color: 'var(--chart-1)',
              values: buckets.map((x) => x.commits),
            },
          ]}
        />
        <div className="lg:col-span-2">
          <LineChart
            title={
              b.milestoneTitle ? `Burndown · ${b.milestoneTitle}` : 'Burndown'
            }
            description={
              b.milestoneTitle
                ? b.dueOn
                  ? `Issues pendientes del milestone. Entrega ${formatDay(b.dueOn.slice(0, 10))}; la línea ideal baja recta hasta esa fecha.`
                  : 'Issues pendientes del milestone.'
                : 'Ningún milestone abierto tiene fecha: se cuentan todos los issues abiertos del repo.'
            }
            categories={dayCats}
            categoryHeader="Día"
            summary={
              last && first
                ? `Pendientes: ${first.remaining} al inicio, ${last.remaining} hoy.`
                : 'Sin datos.'
            }
            series={[
              {
                id: 'remaining',
                label: 'Pendientes',
                color: 'var(--chart-1)',
                values: b.points.map((p) => p.remaining),
              },
              ...(b.ideal
                ? [
                    {
                      id: 'ideal',
                      label: 'Ideal',
                      color: 'var(--chart-ref)',
                      dashed: true,
                      values: b.ideal.map((p) => p.remaining),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>
    </div>
  )
}
