import {
  Check,
  ListChecks,
  LoaderCircle,
  Play,
  Square,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ToolRun } from '@/lib/ask/store'
import type { ToolResult } from '@/lib/ask/tool-result'
import type { MessageKey } from '@/lib/i18n'
import { useLang, type LangValue } from '@/lib/use-lang'

const ICON: Record<string, LucideIcon> = { ejecutar: Play, check: ListChecks }

const LIMIT_KEY = {
  time: 'code.limit.time',
  instructions: 'code.limit.instructions',
  memory: 'code.limit.memory',
  output: 'code.limit.output',
} as const

type Tr = LangValue['tr']

const titleKey = (name: string, running: boolean): MessageKey =>
  name === 'check'
    ? running
      ? 'ask.tool.checking'
      : 'ask.tool.checked'
    : running
      ? 'ask.tool.running'
      : 'ask.tool.ran'

/** "limit:time" → the sandbox's own sentence; anything else is the fixed reason code. */
function limitText(message: string, tr: Tr): string {
  const m = /^limit:(time|instructions|memory|output)$/.exec(message)
  return m ? tr(LIMIT_KEY[m[1] as keyof typeof LIMIT_KEY]) : message
}

/**
 * One tool call of the model, between the text before and after it: the code it sent, then the
 * result block (state, output, error with line, duration). Everything is text: the code is the
 * model's, so it is only ever shown, never interpreted. It ran, if at all, in the M4 sandbox.
 */
export function ToolStep({ run }: { run: ToolRun }) {
  const { tr } = useLang()
  const Icon = ICON[run.name] ?? Play
  const running = run.status === 'running'
  return (
    <section
      aria-label={tr(titleKey(run.name, running))}
      className="bg-surface-sunken border-border max-w-3xl min-w-0 overflow-hidden rounded-md border"
    >
      <h4 className="text-label text-ink-muted flex min-h-11 items-center gap-2 px-4 py-1 md:min-h-9">
        <Icon className="text-ink-subtle size-4 shrink-0" aria-hidden="true" />
        {tr(titleKey(run.name, running))}
      </h4>
      <pre
        className="text-code text-ink border-border max-h-64 overflow-auto border-t p-4"
        tabIndex={0}
      >
        <code>{run.body}</code>
      </pre>
      <div
        role="region"
        aria-label={tr('ask.tool.result')}
        className="border-border bg-surface border-t px-4 py-3"
      >
        {running ? (
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
        ) : run.result ? (
          <ResultView result={run.result} />
        ) : (
          <p className="text-body-sm text-ink-muted flex items-center gap-2">
            <Square className="size-3.5" aria-hidden="true" />
            {tr('code.cancelled')}
          </p>
        )}
      </div>
    </section>
  )
}

const ms = (n: number) => `${n} ms`

/** The fixed result shape, drawn. Same fields the model reads: status, output, error, duration. */
export function ResultView({ result }: { result: ToolResult }) {
  const { tr } = useLang()
  const err = result.error
  return (
    <div className="flex flex-col gap-2">
      <div role="status" aria-live="polite">
        <StateLine result={result} tr={tr} />
      </div>
      {result.tool === 'ejecutar' &&
        result.stdout === '' &&
        result.status === 'ok' && (
          <p className="text-body-sm text-ink-subtle">{tr('code.noOutput')}</p>
        )}
      {result.stdout !== '' && (
        <pre
          className="text-code text-ink-muted max-h-48 overflow-auto whitespace-pre-wrap"
          tabIndex={0}
          aria-label={tr('ask.tool.stdout')}
        >
          {result.stdout}
        </pre>
      )}
      {err && result.status === 'error' && result.diagnostics.length === 0 && (
        <pre className="text-code text-ink-muted max-h-32 overflow-auto whitespace-pre-wrap">
          {err.message}
        </pre>
      )}
      {result.diagnostics.length > 0 && (
        <ul className="text-body-sm flex flex-col gap-1">
          {result.diagnostics.map((d, i) => (
            <li key={i} className="flex items-start gap-2">
              <TriangleAlert
                className={`mt-0.5 size-4 shrink-0 ${d.severity === 'error' ? 'text-warning' : 'text-ink-subtle'}`}
                aria-hidden="true"
              />
              <span>
                <span className="text-data text-ink-subtle mr-2 uppercase">
                  {`${d.severity === 'error' ? tr('code.error') : tr('code.warning')} · ${d.line}:${d.column}`}
                </span>
                {d.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result.truncated && (
        <p className="text-caption text-ink-subtle">
          {tr('ask.tool.truncated', { n: result.stdoutChars })}
        </p>
      )}
    </div>
  )
}

function StateLine({ result, tr }: { result: ToolResult; tr: Tr }) {
  const time = (
    <span className="text-ink-subtle">· {ms(result.durationMs)}</span>
  )
  if (result.status === 'ok')
    return (
      <p className="text-body-sm text-success flex items-center gap-2">
        <Check className="size-4" aria-hidden="true" />
        {result.tool === 'check' && result.diagnostics.length > 0
          ? tr('ask.tool.checkedWarnings', { n: result.diagnostics.length })
          : result.tool === 'check'
            ? tr('code.noFindings')
            : tr('code.ok')}{' '}
        {time}
      </p>
    )
  const warn = 'text-body-sm text-warning flex items-start gap-2'
  const icon = (
    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
  )
  switch (result.status) {
    case 'error':
      return (
        <p className={warn}>
          {icon}
          <span>
            {result.error?.line != null
              ? tr('code.errorLine', { line: result.error.line })
              : tr('code.error')}{' '}
            {time}
          </span>
        </p>
      )
    case 'limit':
      return (
        <p className={warn}>
          {icon}
          <span>
            {limitText(result.error?.message ?? '', tr)} {time}
          </span>
        </p>
      )
    case 'timeout':
      return (
        <p className={warn}>
          {icon}
          <span>
            {tr('code.timeout')} {time}
          </span>
        </p>
      )
    case 'cancelled':
      return (
        <p className="text-body-sm text-ink-muted flex items-center gap-2">
          <Square className="size-3.5" aria-hidden="true" />
          {tr('code.cancelled')} {time}
        </p>
      )
    case 'rejected':
      return (
        <p className={warn}>
          {icon}
          <span>
            {tr('ask.tool.rejected', { reason: result.error?.message ?? '' })}
          </span>
        </p>
      )
    default:
      return (
        <p className={warn}>
          {icon}
          <span>{result.error?.message ?? tr('code.error')}</span>
        </p>
      )
  }
}
