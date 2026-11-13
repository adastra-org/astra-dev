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
  RotateCcw,
  Square,
  TriangleAlert,
} from 'lucide-react'
import { useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { describeError, type ErrorView } from '@/lib/ask/errors'
import { fmtCount, outputSpeed, ttftMs } from '@/lib/ask/budget'
import { isBusy, isTurnBusy } from '@/lib/ask/status'
import { isLinkable, sourceLabel, visibleSources } from '@/lib/ask/sources'
import { askStore, type Turn } from '@/lib/ask/store'
import { ASK_MAX_QUESTION, type AskSource } from '@/lib/ask/types'
import type { Permission } from '@/lib/palette/types'
import { useLang } from '@/lib/use-lang'
import { Activity } from './Activity'
import { ToolStep } from './ToolStep'
import { AnswerBody } from './AnswerBody'
import { EtherOrb } from './EtherOrb'
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

/** Lista de turnos, o la bienvenida si no hay ninguno. Sin contenedor de scroll: lo pone el padre. */
export function Transcript({
  turns,
  viewerRole,
  onNavigate,
}: {
  turns: readonly Turn[]
  viewerRole: Permission | 'unknown'
  /** Se llama al seguir una cita o un enlace de la conversación. */
  onNavigate?: () => void
}) {
  const { tr } = useLang()
  if (turns.length === 0) return <Empty gated={viewerRole === 'public'} />
  const last = turns.at(-1)
  const locked = isTurnBusy(turns)
  return (
    <ol className="flex flex-col gap-6" aria-label={tr('ask.conversation')}>
      {turns.map((t) => (
        <li key={t.id} className="flex flex-col gap-3">
          <TurnView
            turn={t}
            isLast={t === last}
            locked={locked}
            {...(onNavigate ? { onNavigate } : {})}
          />
        </li>
      ))}
    </ol>
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
      <UserMessage turn={turn} locked={locked} />

      {turn.status === 'waiting' && !turn.steps.length && <Searching />}

      <Activity turn={turn} />

      <TurnBody turn={turn} settled={settled} onNavigate={navigate} />

      {turn.confirm && settled && (
        <ContinuePrompt turn={turn} locked={locked} />
      )}

      {turn.refused && settled && <RefusedNote onNavigate={navigate} />}

      {errorView && (
        <ErrorNotice turnId={turn.id} view={errorView} canRetry={isLast} />
      )}

      {settled && turn.status !== 'error' && <Notes turn={turn} />}
      {settled && turn.status === 'done' && !turn.tools.length && (
        <Speed turn={turn} />
      )}

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
 * El texto de la respuesta con las llamadas a herramientas en el lugar donde ocurrieron: texto,
 * tarjeta, texto, tarjeta. Sin llamadas es un solo `AnswerBody`.
 */
function TurnBody({
  turn,
  settled,
  onNavigate,
}: {
  turn: Turn
  settled: boolean
  onNavigate: () => void
}) {
  const parts: ReactNode[] = []
  let from = 0
  for (const run of turn.tools) {
    const text = turn.text.slice(from, run.at)
    if (text.trim())
      parts.push(
        <AnswerBody
          key={`t${run.round}`}
          text={text}
          sources={turn.sources}
          onNavigate={onNavigate}
          runnable={settled}
        />,
      )
    parts.push(<ToolStep key={`c${run.round}`} run={run} />)
    from = run.at
  }
  const rest = turn.text.slice(from)
  if (rest.trim() || (!turn.tools.length && turn.text))
    parts.push(
      <AnswerBody
        key="rest"
        text={rest}
        sources={turn.sources}
        onNavigate={onNavigate}
        runnable={settled}
      />,
    )
  if (!parts.length) return null
  return <>{parts}</>
}

/** El owner llegó al tope de rondas: el server pidió confirmar. Seguir reinicia el contador. */
function ContinuePrompt({ turn, locked }: { turn: Turn; locked: boolean }) {
  const { tr } = useLang()
  return (
    <div
      role="status"
      className="bg-surface-sunken text-body-sm flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3"
    >
      <p className="text-ink-muted min-w-0">
        {tr('ask.tool.confirm', { n: turn.confirm?.rounds ?? 0 })}
      </p>
      <button
        type="button"
        disabled={locked}
        onClick={() => askStore.continueTurn(turn.id)}
        className="text-label bg-accent-fill text-on-accent hover:bg-accent-fill-hover min-h-11 rounded-md px-4 disabled:opacity-50 md:min-h-8"
      >
        {tr('ask.tool.continue')}
      </button>
    </div>
  )
}

/**
 * La pregunta del usuario. Cuando la respuesta ya terminó, ofrece Editar (el texto se reenvía desde
 * ese punto) y Reenviar (la misma pregunta, respuesta nueva). Mientras el modelo responde, ninguna.
 */
function UserMessage({ turn, locked }: { turn: Turn; locked: boolean }) {
  const { tr } = useLang()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(turn.question)
  const settled = !isBusy(turn)

  if (editing)
    return (
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
          maxLength={ASK_MAX_QUESTION}
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
    )

  // Las acciones ocupan siempre su lugar (opacity, no display): sin salto de layout. Se muestran con
  // hover o foco dentro del mensaje; en táctil (`hover: none`) están siempre visibles.
  return (
    <div className="group/msg flex flex-col gap-2">
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
      {tps !== null && (
        <span className="tabular-nums">
          {tr('ask.speed.tps', { n: fmtCount(tps, lang) })}
        </span>
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
  const { draft, turns } = useAsk()
  const { tr } = useLang()
  const busy = isTurnBusy(turns)

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
  )
}
