import { Brain, Check, LoaderCircle, Square, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MEMORY_MAX_CHARS } from '@/lib/ask/memories'
import type { MemoryProposal, MemoryToolName } from '@/lib/ask/memory-tools'
import { askStore, type ToolRun } from '@/lib/ask/store'
import type { MessageKey } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'

type Action = 'save' | 'edit' | 'delete'
const ACTION: Record<MemoryToolName, Action> = {
  guardar_memoria: 'save',
  editar_memoria: 'edit',
  borrar_memoria: 'delete',
}

const REASONS = [
  'empty',
  'too_long',
  'duplicate',
  'max_items',
  'max_total',
  'not_found',
  'changed',
  'bad_format',
  'too_many_writes',
  'unavailable',
] as const

/** The text the model put in the tag, for the finished card (the pending card has `proposal`). */
function bodyText(action: Action, body: string): string {
  if (action === 'save') return body.trim()
  if (action === 'edit')
    return body.replace(/^\s*\d{1,2}[ \t]*\r?\n/, '').trim()
  return ''
}

/**
 * A memory write the model asked for. While it waits, the user sees exactly what would be written
 * (as plain text, never interpreted) and decides: save (the text can be changed first) or discard.
 * Nothing is written before that, unless the user turned on "remember without asking" in Memories.
 */
export function MemoryStep({ turnId, run }: { turnId: number; run: ToolRun }) {
  const { tr } = useLang()
  const action = ACTION[run.name as MemoryToolName] ?? 'save'
  const pending = run.status === 'running' && run.proposal
  const phase =
    run.status === 'running' ? 'title' : run.result?.ok ? 'done' : 'tried'
  const title = tr(`ask.mem.${action}.${phase}` as MessageKey)
  return (
    <section
      aria-label={title}
      className="bg-surface-sunken border-border max-w-3xl min-w-0 overflow-hidden rounded-md border"
    >
      <h4 className="text-label text-ink-muted flex min-h-11 items-center gap-2 px-4 py-1 md:min-h-9">
        <Brain className="text-ink-subtle size-4 shrink-0" aria-hidden="true" />
        {title}
      </h4>
      <div className="border-border border-t px-4 py-3">
        {pending ? (
          <ProposalForm
            turnId={turnId}
            round={run.round}
            action={action}
            proposal={run.proposal!}
          />
        ) : run.status === 'running' ? (
          <p
            role="status"
            className="text-body-sm text-ink-subtle flex items-center gap-2"
          >
            <LoaderCircle
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            {tr('code.running')}
          </p>
        ) : (
          <Outcome run={run} action={action} />
        )}
      </div>
    </section>
  )
}

function ProposalForm({
  turnId,
  round,
  action,
  proposal,
}: {
  turnId: number
  round: number
  action: Action
  proposal: MemoryProposal
}) {
  const { tr } = useLang()
  const [text, setText] = useState(proposal.text)
  const accept = useRef<HTMLButtonElement>(null)
  // The answer is waiting for this decision: land the keyboard on it.
  useEffect(() => accept.current?.focus(), [])
  const decide = (ok: boolean) =>
    askStore.decideMemory(turnId, round, ok ? { ok, text } : { ok })
  return (
    <form
      role="group"
      aria-label={tr(`ask.mem.${action}.title` as MessageKey)}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        decide(text.trim() !== '' || action === 'delete')
      }}
    >
      {proposal.before !== undefined && (
        <p className="text-body-sm text-ink-muted break-words">
          <span className="text-caption text-ink-subtle mr-2 uppercase">
            {tr('ask.mem.before')}
          </span>
          {proposal.before}
        </p>
      )}
      {action !== 'delete' && (
        <label className="flex flex-col gap-1">
          <span className="text-caption text-ink-subtle">
            {tr('ask.mem.textLabel')}
          </span>
          <input
            type="text"
            value={text}
            maxLength={MEMORY_MAX_CHARS}
            onChange={(e) => setText(e.target.value)}
            className="text-body text-ink bg-surface focus-visible:outline-focus min-h-11 w-full rounded-md px-2 outline-offset-0 focus-visible:outline-2 md:min-h-8"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-1">
        <button
          ref={accept}
          type="submit"
          disabled={action !== 'delete' && text.trim() === ''}
          className="text-label bg-accent-fill text-on-accent hover:bg-accent-fill-hover min-h-11 rounded-md px-3 disabled:opacity-50 md:min-h-8"
        >
          {tr(`ask.mem.accept.${action}` as MessageKey)}
        </button>
        <button
          type="button"
          onClick={() => decide(false)}
          className="text-label text-ink-muted hover:bg-surface-overlay hover:text-ink min-h-11 rounded-md px-3 md:min-h-8"
        >
          {tr('ask.mem.discard')}
        </button>
      </div>
    </form>
  )
}

function Outcome({ run, action }: { run: ToolRun; action: Action }) {
  const { tr } = useLang()
  const shown = bodyText(action, run.body)
  const r = run.result
  let line: React.ReactNode
  if (!r) {
    line = (
      <span className="text-ink-muted flex items-center gap-2">
        <Square className="size-3.5" aria-hidden="true" />
        {tr('ask.mem.discarded')}
      </span>
    )
  } else if (r.ok) {
    line = (
      <span className="text-success flex items-center gap-2">
        <Check className="size-4" aria-hidden="true" />
        {tr(`ask.mem.ok.${action}` as MessageKey)}
      </span>
    )
  } else if (r.error?.message === 'discarded' || r.status === 'cancelled') {
    line = (
      <span className="text-ink-muted flex items-center gap-2">
        <Square className="size-3.5" aria-hidden="true" />
        {tr('ask.mem.discarded')}
      </span>
    )
  } else {
    const code = (REASONS as readonly string[]).includes(r.error?.message ?? '')
      ? r.error!.message
      : 'other'
    line = (
      <span className="text-warning flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {tr('ask.mem.rejected', {
          reason: tr(`ask.mem.reason.${code}` as MessageKey),
        })}
      </span>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {shown && <p className="text-body-sm text-ink break-words">{shown}</p>}
      <p role="status" className="text-body-sm">
        {line}
      </p>
    </div>
  )
}
