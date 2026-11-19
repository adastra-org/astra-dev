import { useState, type ReactNode } from 'react'
import { PageHeader } from '@/components/doc/PageHeader'
import { ChecklistSection } from '@/components/project/ChecklistSection'
import { ComplexitySection } from '@/components/project/ComplexitySection'
import {
  EvolutionSection,
  RangePicker,
} from '@/components/project/EvolutionSection'
import type { Range } from '@/components/project/ranges'
import { ErrorNotice, Freshness, Stat } from '@/components/project/parts'
import { useRemote } from '@/components/project/useRemote'
import { ApiError, loadChecklist, loadEvolution } from '@/lib/project/api'
import { formatValue } from '@/lib/project/series'
import { useTitle } from '@/lib/title'
import { useLang } from '@/lib/use-lang'

function Section({
  id,
  title,
  lead,
  aside,
  children,
}: {
  id: string
  title: string
  lead?: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-prose">
          <h2 id={id} className="text-h3 mb-2 scroll-mt-20">
            {title}
          </h2>
          {lead && <p className="text-body text-ink-muted">{lead}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

const isGate = (e: unknown) =>
  e instanceof ApiError &&
  (e.code === 'unauthenticated' || e.code === 'staff_required')

export default function Roadmap() {
  const { lang, tr } = useLang()
  useTitle(tr('roadmap.title'))
  const [days, setDays] = useState<Range>(30)
  const checklist = useRemote(loadChecklist, 'checklist')
  const evolution = useRemote((s) => loadEvolution(days, s), days)

  // Sin sesión de staff no hay nada que mostrar: un solo aviso, no uno por sección.
  if (isGate(checklist.error) && !checklist.data)
    return (
      <>
        <PageHeader
          eyebrow={tr('roadmap.eyebrow')}
          title={tr('roadmap.title')}
          lead={tr('rm.gateLead')}
        />
        <ErrorNotice error={checklist.error} />
      </>
    )

  const c = checklist.data
  const ev = evolution.data
  const planTotal = c?.checklist.plan.reduce((n, m) => n + m.total, 0) ?? 0
  const planDone = c?.checklist.plan.reduce((n, m) => n + m.done, 0) ?? 0
  const dash = '—'

  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        eyebrow={tr('roadmap.eyebrow')}
        title={tr('roadmap.title')}
        lead={tr('rm.lead')}
      >
        {c && (
          <div className="mt-3">
            <Freshness
              at={c.checklist.generatedAt}
              stale={c.checklist.stale}
              source={tr('rm.source.plan')}
            />
          </div>
        )}
      </PageHeader>

      <Section id="estado" title={tr('rm.status')}>
        <dl
          aria-busy={checklist.loading || evolution.loading}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <Stat
            label={tr('rm.plan')}
            value={c ? `${planDone}/${planTotal}` : dash}
            note={tr('rm.planNote')}
          />
          <Stat
            label={tr('rm.issuesOpen')}
            value={ev ? formatValue(ev.totals.openIssues, lang) : dash}
            note={
              ev
                ? tr('rm.closedN', {
                    n: formatValue(ev.totals.closedIssues, lang),
                  })
                : undefined
            }
          />
          <Stat
            label={tr('rm.prsOpen')}
            value={ev ? formatValue(ev.totals.openPrs, lang) : dash}
            note={
              ev
                ? tr('rm.mergedN', {
                    n: formatValue(ev.totals.mergedPrs, lang),
                  })
                : undefined
            }
          />
          <Stat
            label={tr('rm.commitsDays', { days })}
            value={ev ? formatValue(ev.totals.commits, lang) : dash}
            note={ev ? tr('rm.inRef', { ref: ev.ref }) : undefined}
          />
        </dl>
      </Section>

      <Section
        id="checklist"
        title={tr('rm.checklist')}
        lead={tr('rm.checklistLead')}
      >
        {checklist.error !== null && (
          <ErrorNotice error={checklist.error} onRetry={checklist.reload} />
        )}
        {c ? (
          <ChecklistSection data={c.checklist} />
        ) : (
          checklist.error === null && (
            <p role="status" className="text-body-sm text-ink-muted">
              {tr('rm.loadingPlan')}
            </p>
          )
        )}
      </Section>

      <Section
        id="evolucion"
        title={tr('rm.evolution')}
        lead={tr('rm.evolutionLead')}
        aside={<RangePicker value={days} onChange={setDays} />}
      >
        {evolution.error !== null && !isGate(evolution.error) && (
          <ErrorNotice error={evolution.error} onRetry={evolution.reload} />
        )}
        {ev ? (
          <div
            aria-busy={evolution.loading}
            className={`flex flex-col gap-3 transition-opacity duration-(--duration-fast) ${evolution.loading ? 'opacity-60' : ''}`}
          >
            <Freshness
              at={ev.generatedAt}
              stale={ev.stale}
              source={tr('rm.source.repo', { repo: ev.repo })}
            />
            <EvolutionSection data={ev} />
          </div>
        ) : (
          evolution.error === null && (
            <p role="status" className="text-body-sm text-ink-muted">
              {tr('rm.loadingEvolution')}
            </p>
          )
        )}
      </Section>

      <Section
        id="complejidad"
        title={tr('rm.complexity')}
        lead={tr('rm.complexityLead')}
      >
        {c ? (
          <ComplexitySection data={c.complexity} />
        ) : (
          checklist.error === null && (
            <p role="status" className="text-body-sm text-ink-muted">
              {tr('rm.loadingSeries')}
            </p>
          )
        )}
      </Section>
    </div>
  )
}
