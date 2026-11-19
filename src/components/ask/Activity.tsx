import {
  Check,
  ChevronRight,
  Filter,
  History,
  LoaderCircle,
  Search,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { Turn } from '@/lib/ask/store'
import type { AskStep } from '@/lib/ask/types'
import { stepLabel } from '@/lib/ask/steps'
import type { MessageKey } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'

const ICON: Record<AskStep['id'], LucideIcon> = {
  history: History,
  search: Search,
  gate: Filter,
  cache: Zap,
}

function StepRow({ step }: { step: AskStep }) {
  const { tr } = useLang()
  const Icon = ICON[step.id]
  return (
    <li className="text-body-sm text-ink-muted flex items-center gap-2">
      <Icon className="text-ink-subtle size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{stepLabel(step, tr)}</span>
      {step.ms > 0 && (
        <span className="text-data text-ink-subtle shrink-0">{`${step.ms} ms`}</span>
      )}
      <Check className="text-success size-4 shrink-0" aria-hidden="true" />
    </li>
  )
}

/** Lo que pasa ahora mismo: esperando al modelo, pensando o escribiendo. */
function LiveRow({ turn }: { turn: Turn }) {
  const { tr } = useLang()
  const key: MessageKey = turn.text
    ? 'ask.act.writing'
    : turn.thinking
      ? 'ask.act.thinking'
      : 'ask.act.waiting'
  return (
    <li className="text-body-sm text-ink flex items-center gap-2">
      <LoaderCircle
        className="text-accent size-4 shrink-0 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span>{tr(key)}</span>
    </li>
  )
}

/**
 * El razonamiento (solo staff) va plegado y discreto: una línea con el título y un chevron, y al
 * abrir un texto sobrio con filete a la izquierda, sin fondo. El contenedor es `flex-col-reverse`:
 * el navegador lo mantiene pegado al final mientras crece, sin efectos ni medir el DOM. Es texto
 * plano, nunca Markdown.
 */
function Thought({ text }: { text: string }) {
  const { tr } = useLang()
  return (
    <details className="group/thought">
      <summary className="text-caption text-ink-muted hover:text-ink focus-visible:outline-accent flex min-h-11 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md md:min-h-8 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="text-ink-subtle size-4 shrink-0 transition-transform group-open/thought:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
        {tr('ask.act.thought')}
      </summary>
      <div
        tabIndex={0}
        role="region"
        aria-label={tr('ask.act.thought')}
        className="border-border focus-visible:outline-accent mt-1 ml-2 flex max-h-40 flex-col-reverse overflow-y-auto border-l-2 pl-4"
      >
        <p className="text-body-sm text-ink-muted py-1 whitespace-pre-wrap">
          {text}
        </p>
      </div>
    </details>
  )
}

/**
 * Qué hace el modelo mientras se espera la respuesta: los pasos del server, el estado de ahora y,
 * para staff, el razonamiento. Al terminar queda plegado bajo "cómo se armó la respuesta".
 */
export function Activity({ turn }: { turn: Turn }) {
  const { tr } = useLang()
  const live = turn.status === 'waiting' || turn.status === 'streaming'
  if (!turn.steps.length && !turn.thinking) return null
  const body = (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-1">
        {turn.steps.map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
        {live && <LiveRow turn={turn} />}
      </ol>
      {turn.thinking && <Thought text={turn.thinking} />}
    </div>
  )
  if (live)
    return (
      <section aria-label={tr('ask.act.live')} aria-live="polite">
        {body}
      </section>
    )
  return (
    <details className="group">
      <summary className="text-caption text-ink-subtle hover:text-ink min-h-11 cursor-pointer list-none py-2 md:min-h-8">
        {tr('ask.act.summary', { n: turn.steps.length })}
      </summary>
      {body}
    </details>
  )
}
