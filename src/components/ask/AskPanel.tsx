import {
  ArrowUp,
  Braces,
  FileText,
  Info,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  SquarePen,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { describeError } from '@/lib/ask/errors'
import { isLinkable, sourceLabel, visibleSources } from '@/lib/ask/sources'
import { askStore, type Turn } from '@/lib/ask/store'
import { ASK_MAX_QUESTION, type AskSource } from '@/lib/ask/types'
import { useLang } from '@/lib/use-lang'
import { AnswerBody } from './AnswerBody'
import { useAsk } from './useAsk'

const SUGGESTIONS = [
  'ask.suggestion1',
  'ask.suggestion2',
  'ask.suggestion3',
] as const

/**
 * Panel del chat: `<dialog>` modal anclado a la derecha (foco atrapado, fondo inerte, Esc cierra).
 * La conversación vive en `askStore`, así que cerrarlo no la pierde ni corta una respuesta en curso.
 */
export function AskPanel() {
  const { open } = useAsk()
  const { tr } = useLang()
  const ref = useRef<HTMLDialogElement>(null)
  // Tras seguir una cita el foco va al contenido; con Esc o el botón, vuelve a quien abrió.
  const toContent = useRef(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      toContent.current = false
      d.showModal()
    } else if (!open && d.open) {
      d.close()
      if (toContent.current)
        document.getElementById('main')?.focus({ preventScroll: true })
    }
  }, [open])

  // Clic en el fondo: cae sobre el propio `<dialog>` (el panel ocupa todo el elemento).
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === d) askStore.close()
    }
    d.addEventListener('click', onBackdrop)
    return () => d.removeEventListener('click', onBackdrop)
  }, [])

  return (
    <dialog
      ref={ref}
      data-palette=""
      aria-label={tr('ask.name')}
      onCancel={(e) => {
        e.preventDefault()
        askStore.close()
      }}
      onClose={() => askStore.close()}
      className="ask-dialog bg-surface-raised text-ink border-border shadow-card backdrop:bg-brand-dark/70 mt-2 mr-2 mb-2 ml-auto h-[calc(100dvh-1rem)] max-h-none w-[calc(100%-1rem)] max-w-md flex-col overflow-hidden rounded-lg border p-0 open:flex"
    >
      {open && <Body onNavigate={() => (toContent.current = true)} />}
    </dialog>
  )
}

function Body({ onNavigate }: { onNavigate: () => void }) {
  const { turns, draft, viewerRole } = useAsk()
  const { tr } = useLang()
  const busy = turns.some(
    (t) => t.status === 'waiting' || t.status === 'streaming',
  )
  const last = turns.at(-1)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Sigue el final del chat mientras llega texto, salvo que la persona haya subido a leer.
  const stick = useRef(true)

  useEffect(() => {
    inputRef.current?.focus()
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const tail = `${turns.length}:${last?.text.length ?? 0}:${last?.status ?? ''}`
  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [tail])

  const submit = () => {
    if (!draft.trim()) {
      inputRef.current?.focus()
      return
    }
    stick.current = true
    void askStore.ask()
  }

  const status = !last
    ? ''
    : last.status === 'waiting'
      ? tr('ask.status.waiting')
      : last.status === 'streaming'
        ? tr('ask.status.streaming')
        : last.status === 'error'
          ? '' // el aviso de error ya es un role=alert
          : last.status === 'stopped'
            ? tr('ask.status.stopped')
            : last.cited.length === 0
              ? tr('ask.status.done')
              : last.cited.length === 1
                ? tr('ask.status.doneOne')
                : tr('ask.status.doneMany', { n: last.cited.length })

  return (
    <>
      <header className="flex shrink-0 items-center gap-1 p-2 pl-4">
        <Sparkles className="text-accent size-5 shrink-0" aria-hidden="true" />
        <h2 className="text-label min-w-0 flex-1 truncate">{tr('ask.name')}</h2>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              askStore.reset()
              inputRef.current?.focus()
            }}
            aria-label={tr('ask.newChat')}
            title={tr('ask.newChat')}
            className="text-ink-muted hover:bg-surface-overlay hover:text-ink grid size-11 shrink-0 place-items-center rounded-md"
          >
            <SquarePen className="size-5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => askStore.close()}
          aria-label={tr('ask.close')}
          className="text-ink-muted hover:bg-surface-overlay hover:text-ink grid size-11 shrink-0 place-items-center rounded-md"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
        aria-busy={busy}
      >
        {turns.length === 0 ? (
          <Empty gated={viewerRole === 'public'} />
        ) : (
          <ol
            className="flex flex-col gap-6"
            aria-label={tr('ask.conversation')}
          >
            {turns.map((t) => (
              <li key={t.id} className="flex flex-col gap-3">
                <TurnView
                  turn={t}
                  isLast={t === last}
                  onNavigate={() => {
                    onNavigate()
                    askStore.close()
                  }}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

      <p role="status" className="sr-only">
        {status}
      </p>

      <form
        className="shrink-0 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (busy) return
          submit()
        }}
      >
        <div className="bg-surface-sunken has-[:focus-visible]:outline-focus flex items-end gap-1 rounded-lg p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2">
          <textarea
            ref={inputRef}
            aria-label={tr('ask.questionLabel')}
            rows={1}
            maxLength={ASK_MAX_QUESTION}
            value={draft}
            placeholder={tr('ask.placeholder')}
            enterKeyHint="send"
            onChange={(e) => askStore.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault()
                if (!busy) submit()
              }
            }}
            className="text-body placeholder:text-ink-subtle text-ink field-sizing-content max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => askStore.stop()}
              aria-label={tr('ask.stop')}
              className="bg-surface-overlay text-ink hover:bg-surface-raised grid size-11 shrink-0 place-items-center rounded-md"
            >
              <Square className="size-4 fill-current" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label={tr('ask.send')}
              className="bg-accent-fill text-on-accent hover:bg-accent-fill-hover grid size-11 shrink-0 place-items-center rounded-md"
            >
              <ArrowUp className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="text-caption text-ink-subtle mt-2 flex justify-between gap-4 px-1">
          <span className="hidden pointer-fine:inline">{tr('ask.keys')}</span>
          {draft.length > ASK_MAX_QUESTION * 0.75 && (
            <span className="ml-auto tabular-nums" aria-live="polite">
              {draft.length} / {ASK_MAX_QUESTION}
            </span>
          )}
        </p>
      </form>
    </>
  )
}

function Empty({ gated }: { gated: boolean }) {
  const { tr } = useLang()
  return (
    <div className="flex flex-col gap-4 pt-2">
      {gated ? (
        <div className="bg-surface-sunken flex gap-3 rounded-md p-4">
          <LockKeyhole
            className="text-warning mt-0.5 size-5 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="text-label">{tr('ask.gated.title')}</p>
            <p className="text-body-sm text-ink-muted mt-1">
              {tr('ask.gated.body')}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div>
            <p className="text-h4">{tr('ask.empty.title')}</p>
            <p className="text-body-sm text-ink-muted mt-2">
              {tr('ask.empty.body')}
            </p>
          </div>
          <ul
            className="flex flex-col gap-2"
            aria-label={tr('ask.suggestions')}
          >
            {SUGGESTIONS.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => void askStore.ask(tr(key))}
                  className="bg-surface-sunken hover:bg-surface-overlay text-body-sm text-ink min-h-11 w-full rounded-md px-4 py-2 text-left"
                >
                  {tr(key)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-caption text-ink-subtle flex gap-2">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{tr('ask.privacy')}</span>
      </p>
    </div>
  )
}

function TurnView({
  turn,
  isLast,
  onNavigate,
}: {
  turn: Turn
  isLast: boolean
  onNavigate: () => void
}) {
  const { tr } = useLang()
  const settled = turn.status !== 'waiting' && turn.status !== 'streaming'
  const shown = settled
    ? visibleSources(turn.sources, turn.cited, turn.refused)
    : []
  const errorView =
    turn.status === 'error'
      ? describeError(turn.error?.code ?? '', turn.error?.retryAfter, tr)
      : null

  return (
    <>
      <p className="bg-surface-overlay text-body text-ink max-w-[85%] self-end rounded-lg px-4 py-2 break-words">
        {turn.question}
      </p>

      {turn.status === 'waiting' && (
        <p
          className="text-body-sm text-ink-muted flex items-center gap-2"
          aria-hidden="true"
        >
          <Sparkles className="text-accent size-4 motion-safe:animate-pulse" />
          {tr('ask.searching')}
        </p>
      )}

      {turn.text && (
        <AnswerBody
          text={turn.text}
          sources={turn.sources}
          onNavigate={onNavigate}
        />
      )}

      {turn.refused && settled && (
        <p className="text-body-sm text-ink-muted">
          {tr('ask.refused.lead')}{' '}
          <Link
            to="/docs"
            onClick={onNavigate}
            className="text-accent underline underline-offset-2"
          >
            {tr('ask.refused.link')}
          </Link>
          .
        </p>
      )}

      {errorView && (
        <div
          role="alert"
          className="bg-danger-surface flex gap-3 rounded-md p-4"
        >
          <TriangleAlert
            className="text-danger mt-0.5 size-5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-label text-ink">{errorView.title}</p>
            {errorView.hint && (
              <p className="text-body-sm text-ink-muted mt-1">
                {errorView.hint}
              </p>
            )}
            {errorView.retry && isLast && (
              <button
                type="button"
                onClick={() => askStore.retry(turn.id)}
                className="text-label text-ink hover:bg-surface-overlay bg-surface-raised -ml-1 mt-2 inline-flex min-h-11 items-center gap-2 rounded-md px-3"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                {tr('ask.retry')}
              </button>
            )}
          </div>
        </div>
      )}

      {settled && turn.status !== 'error' && <Notes turn={turn} />}

      {shown.length > 0 && (
        <section
          aria-label={tr('ask.sourcesCited')}
          className="flex flex-col gap-1"
        >
          <h3 className="text-eyebrow px-3">{tr('ask.sources')}</h3>
          <ul className="flex flex-col">
            {shown.map((s) => (
              <SourceRow key={s.n} source={s} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** Avisos de una respuesta terminada: qué tipo de búsqueda fue, corte por longitud, caché. */
function Notes({ turn }: { turn: Turn }) {
  const { tr } = useLang()
  const notes: string[] = []
  if (turn.status === 'stopped') notes.push(tr('ask.note.stopped'))
  if (turn.truncated) notes.push(tr('ask.note.truncated'))
  if (turn.degraded) notes.push(tr('ask.note.degraded'))
  if (turn.cached) notes.push(tr('ask.note.cached'))
  if (!notes.length) return null
  return (
    <p className="text-caption text-ink-subtle flex gap-2">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{notes.join(' ')}</span>
    </p>
  )
}

function SourceRow({
  source,
  onNavigate,
}: {
  source: AskSource
  onNavigate: () => void
}) {
  const { title, section } = sourceLabel(source)
  const Icon = source.kind === 'native' ? Braces : FileText
  const body = (
    <>
      <span className="text-data bg-surface-sunken text-ink-muted grid h-6 min-w-6 shrink-0 place-items-center rounded-sm px-1.5">
        {source.n}
      </span>
      <Icon className="text-ink-subtle size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-label text-ink block truncate">{title}</span>
        {section && (
          <span className="text-body-sm text-ink-muted block truncate">
            {section}
          </span>
        )}
      </span>
    </>
  )
  const row = 'flex min-h-11 items-center gap-3 rounded-md px-3 py-2'
  return (
    <li>
      {isLinkable(source) ? (
        <Link
          to={source.path}
          onClick={onNavigate}
          className={`${row} hover:bg-surface-overlay`}
        >
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  )
}
