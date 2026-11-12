import { formatDay, formatValue } from '@/lib/project/series'
import type { Complexity } from '@/lib/project/types'
import { LineChart } from './chart/LineChart'
import { EmptyNote } from './parts'

export function ComplexitySection({ data }: { data: Complexity | null }) {
  if (!data || data.series.length === 0)
    return (
      <EmptyNote>
        Todavía no hay serie de complejidad en la rama. Se genera con{' '}
        <code>bun run complexity -- --backfill</code> y se sube al repo en{' '}
        <code>docs/project/complexity.json</code>.
      </EmptyNote>
    )
  const s = data.series
  const last = s.at(-1)!
  const cats = s.map((p) => ({
    key: p.date,
    label: `${formatDay(p.date)} · ${p.sha}`,
    axis: formatDay(p.date),
  }))
  const xs = s.map((p) => Date.parse(`${p.date}T00:00:00Z`))
  const now = (label: string, v: number) =>
    `Hoy: ${formatValue(v)} ${label} (${formatDay(last.date)}).`

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <LineChart
          compact
          title="Líneas"
          description={now('líneas de código', last.lines)}
          categories={cats}
          xValues={xs}
          height={160}
          summary={`${formatValue(last.lines)} líneas de código y ${formatValue(last.docLines)} de documentación.`}
          series={[
            {
              id: 'lines',
              label: 'Código',
              color: 'var(--chart-1)',
              values: s.map((p) => p.lines),
            },
            {
              id: 'docLines',
              label: 'Docs',
              color: 'var(--chart-2)',
              values: s.map((p) => p.docLines),
            },
          ]}
        />
        <LineChart
          compact
          title="Archivos"
          description={now('archivos medidos', last.files)}
          categories={cats}
          xValues={xs}
          height={160}
          summary={`${formatValue(last.files)} archivos.`}
          series={[
            {
              id: 'files',
              label: 'Archivos',
              color: 'var(--chart-1)',
              values: s.map((p) => p.files),
            },
          ]}
        />
        <LineChart
          compact
          title="Churn semanal"
          description={now('líneas cambiadas en 7 días', last.churn)}
          categories={cats}
          xValues={xs}
          height={160}
          summary={`${formatValue(last.churn)} líneas cambiadas en los últimos 7 días.`}
          series={[
            {
              id: 'churn',
              label: 'Churn',
              color: 'var(--chart-1)',
              values: s.map((p) => p.churn),
            },
          ]}
        />
      </div>
      <p className="text-caption text-ink-subtle max-w-prose">
        Cuenta código (ts, tsx, js, css, html, sh, yaml, json) y docs (md) del
        repo; no cuenta lockfiles, tokens generados ni <code>public/</code>. El
        churn suma líneas añadidas y borradas en los 7 días hasta esa fecha.
      </p>
    </div>
  )
}
