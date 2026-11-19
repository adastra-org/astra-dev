import { useEffect, useId, useRef, useState } from 'react'
import {
  Brain,
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
import { useLang, type LangValue } from '@/lib/use-lang'

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
function liveKey(turn: Turn): MessageKey {
  if (turn.text) return 'ask.act.writing'
  return turn.thinking ? 'ask.act.thinking' : 'ask.act.waiting'
}

/**
 * El razonamiento (solo staff) es una entrada más del grupo, con el mismo ritmo que los pasos. El
 * texto va debajo con filete a la izquierda, sin fondo. El contenedor es `flex-col-reverse`: el
 * navegador lo mantiene pegado al final mientras crece, sin efectos ni medir el DOM. Es texto
 * plano, nunca Markdown.
 */
function ThoughtRow({ text }: { text: string }) {
  const { tr } = useLang()
  return (
    <li className="flex flex-col gap-1">
      <div className="text-body-sm text-ink-muted flex items-center gap-2">
        <Brain className="text-ink-subtle size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">{tr('ask.act.thought')}</span>
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label={tr('ask.act.thought')}
        className="border-border focus-visible:outline-accent ml-2 flex max-h-40 flex-col-reverse overflow-y-auto border-l-2 pl-4"
      >
        <p className="text-body-sm text-ink-muted py-1 whitespace-pre-wrap">
          {text}
        </p>
      </div>
    </li>
  )
}

/** "3 pasos · razonamiento · 1,2 s": solo las partes que existen. */
function summaryOf(turn: Turn, lang: string, tr: LangValue['tr']): string {
  const parts: string[] = []
  const n = turn.steps.length
  if (n)
    parts.push(tr(n === 1 ? 'ask.act.steps.one' : 'ask.act.steps.many', { n }))
  if (turn.thinking) parts.push(tr('ask.act.reasoning'))
  const { startedAt, doneAt } = turn.timing
  if (startedAt !== null && doneAt !== null && doneAt >= startedAt) {
    const s = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-AR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format((doneAt - startedAt) / 1000)
    parts.push(tr('ask.act.seconds', { s }))
  }
  return parts.join(' · ')
}

/**
 * Un solo grupo plegable por respuesta: los pasos del server, el estado de ahora y, para staff, el
 * razonamiento como una entrada más. Abierto mientras se genera; al terminar se compacta a una
 * línea de resumen, y el usuario puede reabrirlo. Si el usuario lo tocó, se respeta su elección.
 */
export function Activity({ turn }: { turn: Turn }) {
  const { tr, lang } = useLang()
  const live = turn.status === 'waiting' || turn.status === 'streaming'
  const [open, setOpen] = useState(live)
  const touched = useRef(false)
  const bodyId = useId()
  useEffect(() => {
    if (!touched.current) setOpen(live)
  }, [live])
  if (!turn.steps.length && !turn.thinking) return null
  return (
    <section aria-label={tr('ask.act.live')} className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          touched.current = true
          setOpen((o) => !o)
        }}
        className="text-caption text-ink-muted hover:text-ink focus-visible:outline-accent flex min-h-11 w-fit max-w-full cursor-pointer items-center gap-1.5 rounded-md md:min-h-8"
      >
        <ChevronRight
          className={`text-ink-subtle size-4 shrink-0 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
        {live ? (
          <>
            <LoaderCircle
              className="text-accent size-4 shrink-0 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span className="text-ink">{tr(liveKey(turn))}</span>
          </>
        ) : (
          <span>{summaryOf(turn, lang, tr)}</span>
        )}
      </button>
      <p className="sr-only" role="status">
        {live ? tr(liveKey(turn)) : ''}
      </p>
      <div
        id={bodyId}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0 overflow-hidden">
          <ol className="flex flex-col gap-1 pt-1 pb-2">
            {turn.steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {turn.thinking && <ThoughtRow text={turn.thinking} />}
          </ol>
        </div>
      </div>
    </section>
  )
}
