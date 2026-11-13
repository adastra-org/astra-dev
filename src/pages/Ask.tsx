import { Gauge, SquarePen } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ContextBudget } from '@/components/ask/ContextBudget'
import { Composer, Transcript } from '@/components/ask/Conversation'
import { MemoriesPanel } from '@/components/ask/MemoriesPanel'
import { useAsk } from '@/components/ask/useAsk'
import { useMemories } from '@/components/ask/useMemories'
import { PageHeader } from '@/components/doc/PageHeader'
import {
  contextUsage,
  fmtCount,
  lastSpeed,
  sessionTotals,
} from '@/lib/ask/budget'
import { memoryTokens } from '@/lib/ask/memories'
import { isTurnBusy, turnStatusText } from '@/lib/ask/status'
import { askStore } from '@/lib/ask/store'
import { useTitle } from '@/lib/title'
import { useLang } from '@/lib/use-lang'

/** Distancia al final (px) bajo la cual el chat sigue solo el texto que llega. */
const FOLLOW_PX = 160

/**
 * Página del chat. Es la misma conversación que el panel (`askStore`): el transcript y el composer
 * son los mismos componentes; el rail muestra el presupuesto de contexto, la velocidad y la sesión.
 */
export default function Ask() {
  const { tr, lang } = useLang()
  useTitle(tr('ask.page.title'))
  const { turns, draft, viewerRole, contextWindow } = useAsk()
  const memories = useMemories()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const last = turns.at(-1)
  const busy = isTurnBusy(turns)

  // Sigue el final mientras llega texto, pero solo si la persona está cerca del final.
  const tail = `${turns.length}:${last?.text.length ?? 0}:${last?.status ?? ''}`
  useEffect(() => {
    const near =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - FOLLOW_PX
    if (near) endRef.current?.scrollIntoView({ block: 'end' })
  }, [tail])

  const usage = contextUsage(
    turns,
    contextWindow,
    draft,
    memoryTokens(memories.items),
  )
  const speed = lastSpeed(turns)
  const session = sessionTotals(turns)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={tr('ask.page.eyebrow')}
        title={tr('ask.page.title')}
        lead={tr('ask.page.lead')}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <section
          aria-label={tr('ask.conversation')}
          className="flex min-w-0 flex-col gap-6"
        >
          <Transcript turns={turns} viewerRole={viewerRole} />
          <div ref={endRef} />
          <p role="status" className="sr-only">
            {turnStatusText(last, tr)}
          </p>
          <div className="bg-surface sticky bottom-0 pt-2 pb-3">
            <Composer inputRef={inputRef} />
          </div>
        </section>

        <aside
          aria-label={tr('ask.rail.title')}
          className="flex flex-col gap-6 lg:sticky lg:top-20"
        >
          <section className="flex flex-col gap-2">
            <ContextBudget usage={usage} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-eyebrow">{tr('ask.speed.title')}</h3>
            {speed ? (
              <div className="text-body-sm text-ink-muted flex flex-col gap-1">
                <p className="text-data text-ink tabular-nums flex items-center gap-2">
                  <Gauge className="size-4" aria-hidden="true" />
                  {tr('ask.speed.tps', { n: fmtCount(speed.tps, lang) })}
                </p>
                {speed.ttft !== null && (
                  <p>{tr('ask.speed.ttft', { n: speed.ttft })}</p>
                )}
              </div>
            ) : (
              <p className="text-body-sm text-ink-muted">
                {tr('ask.speed.none')}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-eyebrow">{tr('ask.rail.session')}</h3>
            <p className="text-body-sm text-ink-muted">
              {tr('ask.rail.questions', { n: session.questions })}
            </p>
            <p className="text-body-sm text-ink-muted tabular-nums">
              {tr('ask.rail.tokens', { n: fmtCount(session.tokens, lang) })}
            </p>
            <button
              type="button"
              disabled={turns.length === 0 || busy}
              onClick={() => {
                askStore.reset()
                inputRef.current?.focus()
              }}
              className="text-label text-ink bg-surface-raised hover:bg-surface-overlay mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-3 disabled:opacity-50 md:min-h-8"
            >
              <SquarePen className="size-4" aria-hidden="true" />
              {tr('ask.newChat')}
            </button>
          </section>

          <MemoriesPanel />
        </aside>
      </div>
    </div>
  )
}
