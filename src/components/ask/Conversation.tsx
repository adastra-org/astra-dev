// Partes de la conversación que comparten el panel (`AskPanel`) y la página (`/ask`): transcript,
// turnos, edición y reenvío, velocidad y composer. Todo el estado sale de `askStore`.
import {
  ArrowUp,
  Braces,
  FileText,
  Gauge,
  Info,
  LockKeyhole,
  LogIn,
  Pencil,
  Quote as QuoteIcon,
  RotateCcw,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useId, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { describeError, type ErrorView } from '@/lib/ask/errors'
import { fmtCount, outputSpeed, ttftMs } from '@/lib/ask/budget'
import { isBusy, isTurnBusy } from '@/lib/ask/status'
import { isLinkable, sourceLabel, visibleSources } from '@/lib/ask/sources'
import { questionRoom, type Quote } from '@/lib/ask/quote'
import { askStore, type Turn } from '@/lib/ask/store'
import type { AskSource } from '@/lib/ask/types'
import type { Permission } from '@/lib/palette/types'
import { useLang } from '@/lib/use-lang'
import { Activity } from './Activity'
import { AnswerBody } from './AnswerBody'
import { EtherOrb } from './EtherOrb'
import { useAnswerSelection, type SelectionBar } from './useAnswerSelection'
import { useAsk } from './useAsk'

const SUGGESTIONS = [
  'ask.suggestion1',
  'ask.suggestion2',
  'ask.suggestion3',
] as const

export function Empty({ gated }: { gated: boolean }) {
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

/**
 * Lista de turnos, o la bienvenida si no hay ninguno. Sin contenedor de scroll: lo pone el padre.
 * Al seleccionar texto de una respuesta aparece "Citar en la pregunta"; `onQuoted` deja al padre
 * llevar el foco al campo.
 */
export function Transcript({
  turns,
  viewerRole,
  onNavigate,
  onQuoted,
}: {
  turns: readonly Turn[]
  viewerRole: Permission | 'unknown'
  /** Se llama al seguir una cita o un enlace de la conversación. */
  onNavigate?: () => void
  /** Se citó un fragmento en la pregunta. */
  onQuoted?: () => void
}) {
  const { tr } = useLang()
  const listRef = useRef<HTMLOListElement>(null)
  const { bar, quote } = useAnswerSelection(listRef, turns)
  if (turns.length === 0) return <Empty gated={viewerRole === 'public'} />
  const last = turns.at(-1)
  const locked = isTurnBusy(turns)
  return (
    <>
      <ol
        ref={listRef}
        className="flex flex-col gap-6"
        aria-label={tr('ask.conversation')}
      >
        {turns.map((t) => (
          <li key={t.id} data-turn={t.id} className="flex flex-col gap-3">
            <TurnView
              turn={t}
              isLast={t === last}
              locked={locked}
              {...(onNavigate ? { onNavigate } : {})}
            />
          </li>
        ))}
      </ol>
      {bar && (
        <QuoteBar
          bar={bar}
          onQuote={() => {
            if (quote()) onQuoted?.()
          }}
        />
      )}
    </>
  )
}

const BAR_HALF = 96
const BAR_HEIGHT = 44

/**
 * Barra sobre la selección. Va dentro del `<dialog>` modal (un portal al body quedaría inerte) y
 * en `fixed`, así que no la recorta el scroll del chat.
 */
function QuoteBar({
  bar,
  onQuote,
}: {
  bar: SelectionBar
  onQuote: () => void
}) {
  const { tr } = useLang()
  const left = Math.min(
    Math.max(bar.x, BAR_HALF),
    Math.max(BAR_HALF, window.innerWidth - BAR_HALF),
  )
  const top =
    bar.top >= BAR_HEIGHT + 12 ? bar.top - BAR_HEIGHT - 8 : bar.bottom + 8
  return (
    <div
      style={{ left, top }}
      className="bg-surface-raised border-border shadow-card fixed z-10 -translate-x-1/2 rounded-md border p-0.5"
    >
      <button
        type="button"
        // El clic no debe deshacer la selección antes de leerla.
        onPointerDown={(e) => e.preventDefault()}
        onClick={onQuote}
        className="text-label text-ink hover:bg-surface-overlay inline-flex min-h-11 items-center gap-2 rounded-md px-3"
      >
        <QuoteIcon className="size-4" aria-hidden="true" />
        {tr('ask.quote.action')}
      </button>
    </div>
  )
}

/** Fragmentos citados en una pregunta, cada uno con las fuentes que el modelo le dio. */
function QuotedBlock({
  quotes,
  onNavigate,
}: {
  quotes: readonly Quote[]
  onNavigate: () => void
}) {
  const { tr } = useLang()
  if (!quotes.length) return null
  return (
    <ul
      aria-label={tr('ask.quote.list')}
      className="flex max-w-[85%] flex-col gap-2 self-end"
    >
      {quotes.map((q) => (
        <li
          key={q.text}
          className="bg-surface-sunken text-ink-muted flex flex-col gap-2 rounded-md px-3 py-2"
        >
          <p className="text-body-sm break-words">{q.text}</p>
          {q.sources.length > 0 && (
            <ul
              aria-label={tr('ask.quote.sources')}
              className="flex flex-wrap gap-1"
            >
              {q.sources.map((s) => (
                <li key={s.slug} className="min-w-0">
                  {isLinkable(s) ? (
                    <Link
                      to={s.path}
                      onClick={onNavigate}
                      className={`${SOURCE_CHIP} hover:bg-surface-overlay hover:text-ink`}
                    >
                      <SourceChipBody source={s} />
                    </Link>
                  ) : (
                    <span className={SOURCE_CHIP}>
                      <SourceChipBody source={s} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

const SOURCE_CHIP =
  'text-caption text-ink-muted bg-surface-raised inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-sm px-2'

function SourceChipBody({ source }: { source: Quote['sources'][number] }) {
  const Icon = source.kind === 'native' ? Braces : FileText
  return (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{source.title}</span>
    </>
  )
}

export function TurnView({
  turn,
  isLast,
  locked,
  onNavigate,
}: {
  turn: Turn
  isLast: boolean
  /** Hay una respuesta en curso en la conversación: no se edita ni se reenvía. */
  locked: boolean
  onNavigate?: () => void
}) {
  const { tr } = useLang()
  const settled = !isBusy(turn)
  const shown = settled
    ? visibleSources(turn.sources, turn.cited, turn.refused)
    : []
  const errorView =
    turn.status === 'error'
      ? describeError(turn.error?.code ?? '', turn.error?.retryAfter, tr)
      : null
  const navigate = () => onNavigate?.()

  return (
    <>
      <UserMessage turn={turn} locked={locked} onNavigate={navigate} />

      {turn.status === 'waiting' && !turn.steps.length && <Searching />}

      <Activity turn={turn} />

      {turn.text && (
        <AnswerBody
          text={turn.text}
          sources={turn.sources}
          onNavigate={navigate}
        />
      )}

      {turn.refused && settled && <RefusedNote onNavigate={navigate} />}

      {errorView && (
        <ErrorNotice turnId={turn.id} view={errorView} canRetry={isLast} />
      )}

      {settled && turn.status !== 'error' && <Notes turn={turn} />}
      {settled && turn.status === 'done' && <Speed turn={turn} />}

      {shown.length > 0 && (
        <section
          aria-label={tr('ask.sourcesCited')}
          className="flex flex-col gap-1"
        >
          <h3 className="text-eyebrow px-3">{tr('ask.sources')}</h3>
          <ul className="flex flex-col">
            {shown.map((s) => (
              <SourceRow key={s.n} source={s} onNavigate={navigate} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * La pregunta del usuario. Cuando la respuesta ya terminó, ofrece Editar (el texto se reenvía desde
 * ese punto) y Reenviar (la misma pregunta, respuesta nueva). Mientras el modelo responde, ninguna.
 */
function UserMessage({
  turn,
  locked,
  onNavigate,
}: {
  turn: Turn
  locked: boolean
  onNavigate: () => void
}) {
  const { tr } = useLang()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(turn.question)
  const settled = !isBusy(turn)

  if (editing)
    return (
      <>
        <QuotedBlock quotes={turn.quotes} onNavigate={onNavigate} />
        <form
          className="bg-surface-sunken flex w-full flex-col gap-2 self-end rounded-lg p-2"
          onSubmit={(e) => {
            e.preventDefault()
            const q = text.trim()
            if (!q || locked) return
            setEditing(false)
            askStore.edit(turn.id, q)
          }}
        >
          <textarea
            aria-label={tr('ask.editLabel')}
            value={text}
            rows={2}
            maxLength={questionRoom(turn.quotes)}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setText(turn.question)
                setEditing(false)
              } else if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            className="text-body text-ink field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent px-2 py-1.5 outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setText(turn.question)
                setEditing(false)
              }}
              className="text-label text-ink-muted hover:bg-surface-overlay hover:text-ink min-h-11 rounded-md px-3 md:min-h-8"
            >
              {tr('ask.editCancel')}
            </button>
            <button
              type="submit"
              disabled={!text.trim() || locked}
              className="text-label bg-accent-fill text-on-accent hover:bg-accent-fill-hover min-h-11 rounded-md px-3 disabled:opacity-50 md:min-h-8"
            >
              {tr('ask.editSave')}
            </button>
          </div>
        </form>
      </>
    )

  // Las acciones ocupan siempre su lugar (opacity, no display): sin salto de layout. Se muestran con
  // hover o foco dentro del mensaje; en táctil (`hover: none`) están siempre visibles.
  return (
    <div className="group/msg flex flex-col gap-2">
      <QuotedBlock quotes={turn.quotes} onNavigate={onNavigate} />
      <p className="bg-surface-overlay text-body text-ink max-w-[85%] self-end rounded-lg px-4 py-2 break-words">
        {turn.question}
      </p>
      {settled && (
        <div
          role="group"
          aria-label={tr('ask.turnActions')}
          className="flex justify-end gap-1 transition-opacity motion-reduce:transition-none [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/msg:opacity-100 [@media(hover:hover)]:group-hover/msg:opacity-100"
        >
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              setText(turn.question)
              setEditing(true)
            }}
            className="text-label text-ink-muted hover:bg-surface-overlay hover:text-ink inline-flex min-h-11 items-center gap-2 rounded-md px-3 disabled:opacity-50 md:min-h-8"
          >
            <Pencil className="size-4" aria-hidden="true" />
            {tr('ask.edit')}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => askStore.resend(turn.id)}
            className="text-label text-ink-muted hover:bg-surface-overlay hover:text-ink inline-flex min-h-11 items-center gap-2 rounded-md px-3 disabled:opacity-50 md:min-h-8"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {tr('ask.resend')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Primer texto y velocidad de la respuesta, medidos en el navegador. */
function Speed({ turn }: { turn: Turn }) {
  const { tr, lang } = useLang()
  const ttft = ttftMs(turn)
  const tps = outputSpeed(turn)
  if (ttft === null && tps === null) {
    if (turn.cached) return null
    return (
      <p className="text-caption text-ink-subtle flex gap-2">
        <Gauge className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{tr('ask.speed.none')}</span>
      </p>
    )
  }
  return (
    <p className="text-caption text-ink-subtle flex flex-wrap gap-x-4 gap-y-1">
      <Gauge className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{tr('ask.speed.title')}</span>
      {ttft !== null && <span>{tr('ask.speed.ttft', { n: ttft })}</span>}
      {tps !== null ? (
        <span className="tabular-nums">
          {tr('ask.speed.tps', { n: fmtCount(tps, lang) })}
        </span>
      ) : (
        <span className="tabular-nums">{tr('ask.speed.tpsNone')}</span>
      )}
    </p>
  )
}

/** Antes del primer evento del server: la búsqueda todavía no terminó. */
function Searching() {
  const { tr } = useLang()
  return (
    <p
      className="text-body-sm text-ink-muted flex items-center gap-2"
      aria-hidden="true"
    >
      <EtherOrb size={16} state="thinking" className="shrink-0" />
      {tr('ask.searching')}
    </p>
  )
}

function RefusedNote({ onNavigate }: { onNavigate: () => void }) {
  const { tr } = useLang()
  return (
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
  )
}

function ErrorNotice({
  turnId,
  view,
  canRetry,
}: {
  turnId: Turn['id']
  view: ErrorView
  canRetry: boolean
}) {
  const { tr } = useLang()
  return (
    <div role="alert" className="bg-danger-surface flex gap-3 rounded-md p-4">
      <TriangleAlert
        className="text-danger mt-0.5 size-5 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-label text-ink">{view.title}</p>
        {view.hint && (
          <p className="text-body-sm text-ink-muted mt-1">{view.hint}</p>
        )}
        {view.action && (
          <a
            href={view.action.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-label text-ink hover:bg-surface-overlay bg-surface-raised -ml-1 mt-2 mr-2 inline-flex min-h-11 items-center gap-2 rounded-md px-3"
          >
            <LogIn className="size-4" aria-hidden="true" />
            {view.action.label}
          </a>
        )}
        {view.retry && canRetry && (
          <button
            type="button"
            onClick={() => askStore.retry(turnId)}
            className="text-label text-ink hover:bg-surface-overlay bg-surface-raised -ml-1 mt-2 inline-flex min-h-11 items-center gap-2 rounded-md px-3"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {tr('ask.retry')}
          </button>
        )}
      </div>
    </div>
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

export function SourceRow({
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

/**
 * Campo de pregunta. Intro envía, Mayús + Intro salta de línea. Mientras responde, el botón es
 * "Detener". `onSubmit` corre antes de enviar (el panel lo usa para volver al final del chat).
 */
export function Composer({
  inputRef,
  onSubmit,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  onSubmit?: () => void
}) {
  const { draft, turns, quotes } = useAsk()
  const { tr } = useLang()
  const quotesId = useId()
  const busy = isTurnBusy(turns)
  // Lo escrito comparte el tope del server con las citas que lo anteceden.
  const room = questionRoom(quotes)

  const submit = () => {
    if (!draft.trim()) {
      inputRef.current?.focus()
      return
    }
    onSubmit?.()
    void askStore.ask()
  }

  return (
    <form
      className="shrink-0"
      onSubmit={(e) => {
        e.preventDefault()
        if (busy) return
        submit()
      }}
    >
      {quotes.length > 0 && (
        <ul
          id={quotesId}
          aria-label={tr('ask.quote.list')}
          className="mb-2 flex flex-col gap-1"
        >
          {quotes.map((q) => (
            <li
              key={q.text}
              className="bg-surface-sunken text-ink-muted flex items-start gap-1 rounded-md pl-3"
            >
              <QuoteIcon
                className="text-ink-subtle mt-3 size-4 shrink-0"
                aria-hidden="true"
              />
              <span className="text-body-sm line-clamp-2 min-w-0 flex-1 py-2.5 break-words">
                {q.text}
              </span>
              <button
                type="button"
                onClick={() => askStore.removeQuote(q.text)}
                aria-label={tr('ask.quote.remove', { text: q.text })}
                className="text-ink-muted hover:bg-surface-overlay hover:text-ink grid size-11 shrink-0 place-items-center rounded-md"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="bg-surface-sunken has-[:focus-visible]:outline-focus flex items-end gap-1 rounded-lg p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2">
        <textarea
          ref={inputRef}
          aria-label={tr('ask.questionLabel')}
          {...(quotes.length ? { 'aria-describedby': quotesId } : {})}
          rows={1}
          maxLength={room}
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
        {draft.length > room * 0.75 && (
          <span className="ml-auto tabular-nums" aria-live="polite">
            {draft.length} / {room}
          </span>
        )}
      </p>
    </form>
  )
}
