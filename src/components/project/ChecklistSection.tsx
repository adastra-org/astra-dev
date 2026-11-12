import {
  ChevronDown,
  Circle,
  CircleCheck,
  CircleDashed,
  ExternalLink,
} from 'lucide-react'
import type {
  Checklist,
  ExternalChecklist,
  GithubMilestone,
  PlanMilestone,
  PlanState,
} from '@/lib/project/types'
import { EmptyNote, Meter } from './parts'

const STATE: Record<
  PlanState,
  { Icon: typeof Circle; tone: string; label: string }
> = {
  done: { Icon: CircleCheck, tone: 'text-success', label: 'Hecho' },
  partial: { Icon: CircleDashed, tone: 'text-warning', label: 'Parcial' },
  todo: { Icon: Circle, tone: 'text-ink-subtle', label: 'Pendiente' },
}

function StateIcon({ state }: { state: PlanState }) {
  const { Icon, tone, label } = STATE[state]
  return (
    <>
      <Icon className={`${tone} mt-0.5 size-4 shrink-0`} aria-hidden="true" />
      <span className="sr-only">{label}: </span>
    </>
  )
}

/** Milestone de GitHub cuyo título empieza por el id del plan (`M5`). */
const githubFor = (m: PlanMilestone, list: readonly GithubMilestone[]) =>
  list.find((g) => g.title === m.id || g.title.startsWith(`${m.id} `))

function PlanCard({
  milestone,
  github,
  defaultOpen,
}: {
  milestone: PlanMilestone
  github: GithubMilestone | undefined
  defaultOpen: boolean
}) {
  const complete = milestone.total > 0 && milestone.done === milestone.total
  return (
    <details
      open={defaultOpen}
      className="group bg-surface-raised border-border rounded-md border"
    >
      <summary className="flex min-h-11 list-none flex-col gap-2 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
            <span className="text-data text-accent">{milestone.id}</span>
            <span className="text-label">{milestone.title}</span>
            <span className="text-data text-ink-subtle">
              v{milestone.version}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="text-body-sm text-ink-muted tabular-nums">
              {milestone.done}/{milestone.total}
              {complete && <span className="sr-only"> (completo)</span>}
            </span>
            <ChevronDown
              className="text-ink-subtle size-4 transition-transform duration-(--duration-panel) ease-(--ease-out-brand) group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </span>
        </span>
        <Meter
          done={milestone.done}
          partial={milestone.partial}
          total={milestone.total}
          label={`Avance de ${milestone.id}`}
        />
      </summary>
      <div className="text-body-sm flex flex-col gap-4 px-4 pt-1 pb-4">
        {github && (
          <a
            href={github.url}
            target="_blank"
            rel="noreferrer"
            className="text-label text-accent flex min-h-11 w-fit items-center gap-2 lg:min-h-8"
          >
            GitHub: {github.open} abiertos · {github.closed} cerrados
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
        {milestone.groups.map((g, i) => (
          <div key={i} className="flex flex-col gap-2">
            {g.label && <p className="text-ink-muted">{g.label}</p>}
            <ul className="flex flex-col gap-2">
              {g.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <StateIcon state={it.state} />
                  <span className="text-ink [text-wrap:pretty]">{it.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}

const EXTERNAL_NOTE: Record<
  Exclude<ExternalChecklist['status'], 'ok'>,
  string
> = {
  disabled:
    'MyChecklist no está conectado: el server no tiene un token de lectura. Ver docs/server/README.md.',
  error:
    'MyChecklist no respondió o devolvió algo inesperado. El resto de la página no depende de él.',
  not_found: 'No existe la lista en MyChecklist con ese nombre.',
}

function External({ data }: { data: ExternalChecklist }) {
  return (
    <section aria-labelledby="mychecklist" className="flex flex-col gap-3">
      <h3 id="mychecklist" className="text-h4">
        MyChecklist · {data.name}
      </h3>
      {data.status !== 'ok' ? (
        <EmptyNote>{EXTERNAL_NOTE[data.status]}</EmptyNote>
      ) : (
        <>
          <p className="text-body-sm text-ink-muted">
            {data.open} abiertos de {data.total}.
          </p>
          {data.groups.map((g, i) => (
            <div key={i} className="flex flex-col gap-2">
              {g.title && <h4 className="text-label">{g.title}</h4>}
              <ul className="text-body-sm flex flex-col gap-2">
                {g.items.map((it) => (
                  <li key={it.id} className="flex gap-2">
                    <StateIcon state={it.done ? 'done' : 'todo'} />
                    <span className="text-ink [text-wrap:pretty]">
                      {it.shortId && (
                        <span className="text-data text-ink-subtle mr-2">
                          {it.shortId}
                        </span>
                      )}
                      {it.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

export function ChecklistSection({ data }: { data: Checklist }) {
  // Abierto el primer milestone con trabajo pendiente: es donde está el equipo.
  const current = data.plan.find((m) => m.done < m.total)?.id
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {data.plan.map((m) => (
        <PlanCard
          key={m.id}
          milestone={m}
          github={githubFor(m, data.milestones)}
          defaultOpen={m.id === current}
        />
      ))}
      <External data={data.external} />
    </div>
  )
}
