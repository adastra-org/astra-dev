import { formatDay, formatValue } from '@/lib/project/series'
import type { Complexity } from '@/lib/project/types'
import { useLang } from '@/lib/use-lang'
import { LineChart } from './chart/LineChart'
import { EmptyNote } from './parts'

export function ComplexitySection({ data }: { data: Complexity | null }) {
  const { lang, tr } = useLang()
  if (!data || data.series.length === 0)
    return (
      <EmptyNote>
        {tr('rm.cx.emptyA')} <code>bun run complexity -- --backfill</code>{' '}
        {tr('rm.cx.emptyB')} <code>docs/project/complexity.json</code>.
      </EmptyNote>
    )
  const s = data.series
  const last = s.at(-1)!
  const cats = s.map((p) => ({
    key: p.date,
    label: `${formatDay(p.date, lang)} · ${p.sha}`,
    axis: formatDay(p.date, lang),
  }))
  const xs = s.map((p) => Date.parse(`${p.date}T00:00:00Z`))
  const now = (what: string, v: number) =>
    tr('rm.cx.today', {
      v: formatValue(v, lang),
      what,
      day: formatDay(last.date, lang),
    })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <LineChart
          compact
          title={tr('rm.cx.lines')}
          description={now(tr('rm.cx.todayLines'), last.lines)}
          categories={cats}
          xValues={xs}
          height={160}
          summary={tr('rm.cx.sumLines', {
            lines: formatValue(last.lines, lang),
            docs: formatValue(last.docLines, lang),
          })}
          series={[
            {
              id: 'lines',
              label: tr('rm.cx.code'),
              color: 'var(--chart-1)',
              values: s.map((p) => p.lines),
            },
            {
              id: 'docLines',
              label: tr('rm.cx.docs'),
              color: 'var(--chart-2)',
              values: s.map((p) => p.docLines),
            },
          ]}
        />
        <LineChart
          compact
          title={tr('rm.cx.files')}
          description={now(tr('rm.cx.todayFiles'), last.files)}
          categories={cats}
          xValues={xs}
          height={160}
          summary={tr('rm.cx.sumFiles', { n: formatValue(last.files, lang) })}
          series={[
            {
              id: 'files',
              label: tr('rm.cx.files'),
              color: 'var(--chart-1)',
              values: s.map((p) => p.files),
            },
          ]}
        />
        <LineChart
          compact
          title={tr('rm.cx.churn')}
          description={now(tr('rm.cx.todayChurn'), last.churn)}
          categories={cats}
          xValues={xs}
          height={160}
          summary={tr('rm.cx.sumChurn', { n: formatValue(last.churn, lang) })}
          series={[
            {
              id: 'churn',
              label: tr('rm.cx.churnSeries'),
              color: 'var(--chart-1)',
              values: s.map((p) => p.churn),
            },
          ]}
        />
      </div>
      <p className="text-caption text-ink-subtle max-w-prose">
        {tr('rm.cx.note')}
      </p>
    </div>
  )
}
