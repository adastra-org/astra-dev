import { useState } from 'react'
import {
  ModelsTable,
  OutcomesList,
  ViewersTable,
} from '@/components/ai/UsageTables'
import { PageHeader } from '@/components/doc/PageHeader'
import { ColumnChart } from '@/components/project/chart/ColumnChart'
import { RangePicker } from '@/components/project/EvolutionSection'
import { ErrorNotice, Freshness, Stat } from '@/components/project/parts'
import { useRemote } from '@/components/project/useRemote'
import { loadAiUsage } from '@/lib/ai/api'
import {
  formatDuration,
  formatPercent,
  formatRate,
  formatTokens,
  formatUsd,
} from '@/lib/ai/format'
import type { AiUsage as Usage } from '@/lib/ai/types'
import { ApiError } from '@/lib/project/api'
import { formatDay, formatValue } from '@/lib/project/series'
import { useTitle } from '@/lib/title'
import { useLang } from '@/lib/use-lang'

const RANGES = [1, 7, 30, 90] as const

const isGate = (e: unknown) =>
  e instanceof ApiError &&
  (e.code === 'unauthenticated' || e.code === 'owner_required')

function Stats({ u }: { u: Usage | null }) {
  const { lang, tr } = useLang()
  const t = u?.totals
  const dash = '—'
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat
        label={tr('ai.stat.requests')}
        value={t ? formatValue(t.requests, lang) : dash}
        note={t ? tr('ai.stat.users', { n: t.activeViewers }) : undefined}
      />
      <Stat
        label={tr('ai.stat.tokens')}
        value={t ? formatTokens(t.inputTokens + t.outputTokens, lang) : dash}
        note={
          t
            ? tr('ai.stat.tokensNote', {
                i: formatTokens(t.inputTokens, lang),
                o: formatTokens(t.outputTokens, lang),
              })
            : undefined
        }
      />
      <Stat
        label={tr('ai.stat.gpu')}
        value={t ? formatDuration(t.gpuMs, lang) : dash}
        note={
          t
            ? tr('ai.stat.gpuNote', { n: t.gpuMeasured, total: t.requests })
            : undefined
        }
      />
      <Stat
        label={tr('ai.stat.cost')}
        value={t ? formatUsd(t.costUsdEst, lang) : dash}
        note={tr('ai.stat.costNote')}
      />
      <Stat
        label={tr('ai.stat.cache')}
        value={t ? formatPercent(t.cacheHitRate, lang) : dash}
        note={t ? tr('ai.stat.cacheNote', { n: t.cacheHits }) : undefined}
      />
      <Stat
        label={tr('ai.stat.limits')}
        value={t ? formatValue(t.rateLimited + t.budgetExceeded, lang) : dash}
        note={
          t
            ? tr('ai.stat.limitsNote', {
                rate: t.rateLimited,
                budget: t.budgetExceeded,
              })
            : undefined
        }
      />
      <Stat
        label={tr('ai.stat.ttft')}
        value={t ? formatDuration(t.avgTtftMs, lang) : dash}
        note={tr('ai.stat.ttftNote')}
      />
      <Stat
        label={tr('ai.stat.tps')}
        value={t ? formatRate(t.avgGenTps, lang) : dash}
        note={tr('ai.stat.tpsNote')}
      />
      <Stat
        label={tr('ai.stat.errors')}
        value={t ? formatValue(t.errors, lang) : dash}
        note={t ? tr('ai.stat.errorsNote', { n: t.fallbacks }) : undefined}
      />
    </dl>
  )
}

function Charts({ u }: { u: Usage }) {
  const { lang, tr } = useLang()
  const cats = u.daily.map((d) => ({
    key: d.date,
    label: formatDay(d.date, lang),
    axis: formatDay(d.date, lang),
  }))
  const tokens = u.totals.inputTokens + u.totals.outputTokens
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ColumnChart
        title={tr('ai.chart.tokens')}
        description={tr('ai.chart.tokensLead')}
        categories={cats}
        categoryHeader={tr('rm.day')}
        summary={tr('ai.chart.tokensSummary', {
          n: formatTokens(tokens, lang),
          days: u.days,
        })}
        series={[
          {
            id: 'in',
            label: tr('ai.tokens.in'),
            color: 'var(--chart-1)',
            values: u.daily.map((d) => d.inputTokens),
          },
          {
            id: 'out',
            label: tr('ai.tokens.out'),
            color: 'var(--chart-2)',
            values: u.daily.map((d) => d.outputTokens),
          },
        ]}
      />
      <ColumnChart
        title={tr('ai.chart.gpu')}
        description={tr('ai.chart.gpuLead')}
        categories={cats}
        categoryHeader={tr('rm.day')}
        summary={tr('ai.chart.gpuSummary', {
          n: formatDuration(u.totals.gpuMs, lang),
          days: u.days,
        })}
        series={[
          {
            id: 'gpu',
            label: tr('ai.chart.gpuSeries'),
            color: 'var(--chart-1)',
            values: u.daily.map((d) => Math.round(d.gpuMs / 100) / 10),
          },
        ]}
      />
    </div>
  )
}

export default function AiUsage() {
  const { tr } = useLang()
  useTitle(tr('ai.title'))
  const [days, setDays] = useState<number>(7)
  const usage = useRemote((s) => loadAiUsage(days, s), days)
  const u = usage.data

  // Sin sesión de owner no hay nada que mostrar: un solo aviso.
  if (isGate(usage.error) && !u)
    return (
      <>
        <PageHeader
          eyebrow={tr('ai.eyebrow')}
          title={tr('ai.title')}
          lead={tr('ai.gateLead')}
        />
        <ErrorNotice error={usage.error} />
      </>
    )

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow={tr('ai.eyebrow')}
        title={tr('ai.title')}
        lead={tr('ai.lead')}
      >
        {u && (
          <div className="mt-3">
            <Freshness
              at={u.generatedAt}
              stale={false}
              source={tr('ai.source')}
            />
          </div>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-ink-muted">{tr('ai.utc')}</p>
        <RangePicker
          value={days}
          onChange={setDays}
          options={RANGES}
          format={(n) => (n === 1 ? tr('ai.today') : tr('rm.days', { n }))}
        />
      </div>

      {usage.error !== null && (
        <ErrorNotice error={usage.error} onRetry={usage.reload} />
      )}

      <section
        aria-label={tr('ai.summary')}
        aria-busy={usage.loading}
        className={`flex flex-col gap-3 transition-opacity duration-(--duration-fast) ${usage.loading && u ? 'opacity-60' : ''}`}
      >
        <Stats u={u} />
        {u && u.lostRecords > 0 && (
          <p role="status" className="text-body-sm text-warning">
            {tr('ai.lost', { n: u.lostRecords })}
          </p>
        )}
      </section>

      {u ? (
        <div
          aria-busy={usage.loading}
          className={`flex flex-col gap-4 transition-opacity duration-(--duration-fast) ${usage.loading ? 'opacity-60' : ''}`}
        >
          {u.totals.requests === 0 && (
            <p role="status" className="text-body text-ink-muted">
              {tr('ai.empty')}
            </p>
          )}
          <Charts u={u} />
          <p className="text-caption text-ink-subtle max-w-prose">
            {tr('ai.gpuNote')}
          </p>
          <ModelsTable models={u.models} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ViewersTable viewers={u.viewers} />
            <OutcomesList outcomes={u.outcomes} />
          </div>
        </div>
      ) : (
        usage.error === null && (
          <p role="status" className="text-body-sm text-ink-muted">
            {tr('ai.loading')}
          </p>
        )
      )}
    </div>
  )
}
