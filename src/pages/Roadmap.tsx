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
  useTitle('Roadmap')
  const [days, setDays] = useState<Range>(30)
  const checklist = useRemote(loadChecklist, 'checklist')
  const evolution = useRemote((s) => loadEvolution(days, s), days)

  // Sin sesión de staff no hay nada que mostrar: un solo aviso, no uno por sección.
  if (isGate(checklist.error) && !checklist.data)
    return (
      <>
        <PageHeader
          eyebrow="Proyecto"
          title="Roadmap"
          lead="Checklist, evolución y complejidad del desarrollo de Ad Astra."
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
        eyebrow="Proyecto"
        title="Roadmap"
        lead="Qué está hecho, qué falta y cómo crece el código. Solo para el staff."
      >
        {c && (
          <div className="mt-3">
            <Freshness
              at={c.checklist.generatedAt}
              stale={c.checklist.stale}
              source="Plan y milestones de GitHub"
            />
          </div>
        )}
      </PageHeader>

      <Section id="estado" title="Estado">
        <dl
          aria-busy={checklist.loading || evolution.loading}
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <Stat
            label="Plan"
            value={c ? `${planDone}/${planTotal}` : dash}
            note="ítems hechos"
          />
          <Stat
            label="Issues abiertos"
            value={ev ? formatValue(ev.totals.openIssues) : dash}
            note={
              ev ? `${formatValue(ev.totals.closedIssues)} cerrados` : undefined
            }
          />
          <Stat
            label="PRs abiertos"
            value={ev ? formatValue(ev.totals.openPrs) : dash}
            note={
              ev ? `${formatValue(ev.totals.mergedPrs)} mergeados` : undefined
            }
          />
          <Stat
            label={`Commits · ${days} d`}
            value={ev ? formatValue(ev.totals.commits) : dash}
            note={ev ? `en ${ev.ref}` : undefined}
          />
        </dl>
      </Section>

      <Section
        id="checklist"
        title="Checklist"
        lead="Los milestones del plan con el estado de cada ítem. Se lee de docs/plan/README.md en GitHub, así que sigue al plan sin redeploy."
      >
        {checklist.error !== null && (
          <ErrorNotice error={checklist.error} onRetry={checklist.reload} />
        )}
        {c ? (
          <ChecklistSection data={c.checklist} />
        ) : (
          checklist.error === null && (
            <p role="status" className="text-body-sm text-ink-muted">
              Cargando el plan…
            </p>
          )
        )}
      </Section>

      <Section
        id="evolucion"
        title="Evolución"
        lead="Issues, commits y burndown del repo astra-dev."
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
              source={`Datos de ${ev.repo}`}
            />
            <EvolutionSection data={ev} />
          </div>
        ) : (
          evolution.error === null && (
            <p role="status" className="text-body-sm text-ink-muted">
              Cargando la evolución…
            </p>
          )
        )}
      </Section>

      <Section
        id="complejidad"
        title="Complejidad"
        lead="Tamaño del repo en el tiempo: líneas, archivos y churn. Un script lo mide desde git y se guarda en el repo."
      >
        {c ? (
          <ComplexitySection data={c.complexity} />
        ) : (
          checklist.error === null && (
            <p role="status" className="text-body-sm text-ink-muted">
              Cargando la serie…
            </p>
          )
        )}
      </Section>
    </div>
  )
}
