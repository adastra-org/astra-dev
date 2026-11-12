import {
  bucketDays,
  bucketSizeFor,
  formatDay,
  formatRange,
} from '@/lib/project/series'
import type { Evolution } from '@/lib/project/types'
import { useLang } from '@/lib/use-lang'
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
  const { tr } = useLang()
  return (
    <div
      role="group"
      aria-label={tr('rm.period')}
      className="flex flex-wrap gap-2"
    >
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          onClick={() => onChange(r)}
          className="text-label bg-surface-raised text-ink-muted hover:bg-surface-overlay hover:text-ink aria-pressed:bg-accent-fill aria-pressed:text-on-accent flex min-h-11 items-center rounded-pill px-4 transition-colors lg:min-h-10"
        >
          {tr('rm.days', { n: r })}
        </button>
      ))}
    </div>
  )
}

export function EvolutionSection({ data }: { data: Evolution }) {
  const { lang, tr } = useLang()
  const size = bucketSizeFor(data.days)
  const buckets = bucketDays(data.daily, size)
  const unit = tr(size === 1 ? 'rm.ev.unitDay' : 'rm.ev.unitWeek')
  const cats = buckets.map((b) => ({
    key: b.start,
    label: formatRange(b.start, b.end, lang),
    axis: formatDay(b.start, lang),
  }))
  const dayCats = data.daily.map((d) => ({
    key: d.date,
    label: formatDay(d.date, lang),
    axis: formatDay(d.date, lang),
  }))
  const b = data.burndown
  const last = b.points.at(-1)
  const first = b.points[0]

  return (
    <div className="flex flex-col gap-4">
      {data.truncated && <EmptyNote>{tr('rm.ev.truncated')}</EmptyNote>}
      <div className="grid gap-4 lg:grid-cols-2">
        <ColumnChart
          title={tr('rm.ev.issues')}
          description={tr('rm.ev.per', { unit, days: data.days })}
          categories={cats}
          categoryHeader={tr('rm.period')}
          summary={tr('rm.ev.openIssues', { n: data.totals.openIssues })}
          series={[
            {
              id: 'opened',
              label: tr('rm.ev.opened'),
              color: 'var(--chart-1)',
              values: buckets.map((x) => x.opened),
            },
            {
              id: 'closed',
              label: tr('rm.ev.closed'),
              color: 'var(--chart-2)',
              values: buckets.map((x) => x.closed),
            },
          ]}
        />
        <ColumnChart
          title={tr('rm.ev.commitsIn', { ref: data.ref })}
          description={tr('rm.ev.byAuthorDate', { unit })}
          categories={cats}
          categoryHeader={tr('rm.period')}
          summary={tr('rm.ev.commitsN', { n: data.totals.commits })}
          series={[
            {
              id: 'commits',
              label: tr('rm.ev.commits'),
              color: 'var(--chart-1)',
              values: buckets.map((x) => x.commits),
            },
          ]}
        />
        <div className="lg:col-span-2">
          <LineChart
            title={
              b.milestoneTitle
                ? tr('rm.ev.burndownOf', { title: b.milestoneTitle })
                : tr('rm.ev.burndown')
            }
            description={
              b.milestoneTitle
                ? b.dueOn
                  ? tr('rm.ev.burnDue', {
                      due: formatDay(b.dueOn.slice(0, 10), lang),
                    })
                  : tr('rm.ev.burnNoDue')
                : tr('rm.ev.burnNoMilestone')
            }
            categories={dayCats}
            categoryHeader={tr('rm.day')}
            summary={
              last && first
                ? tr('rm.ev.burnSummary', {
                    first: first.remaining,
                    last: last.remaining,
                  })
                : tr('rm.ev.noData')
            }
            series={[
              {
                id: 'remaining',
                label: tr('rm.ev.remaining'),
                color: 'var(--chart-1)',
                values: b.points.map((p) => p.remaining),
              },
              ...(b.ideal
                ? [
                    {
                      id: 'ideal',
                      label: tr('rm.ev.ideal'),
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
