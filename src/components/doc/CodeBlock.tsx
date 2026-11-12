import {
  Check,
  CircleAlert,
  Copy,
  ListChecks,
  LoaderCircle,
  Play,
  Sparkles,
  Square,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Diagnostic } from '@/lib/sandbox/lint'
import type { RunResult } from '@/lib/sandbox/run'

interface Props {
  code: string
  /** Lenguaje, como etiqueta. */
  lang?: string
  /** HTML ya resaltado del interior de `<code>` (lo genera el build). Sin él, texto plano. */
  html?: string
  /** `lua run` en el Markdown: muestra Ejecutar, Revisar y Formatear (M4). */
  runnable?: boolean
}

type ToolBusy = 'lint' | 'format' | null

const LIMIT_TEXT = {
  time: 'Se cortó por tiempo: el snippet pasó los 3 s.',
  instructions:
    'Se cortó por cantidad de instrucciones: parece un bucle infinito.',
  memory: 'Se cortó por memoria: el snippet pidió más de lo permitido.',
  output: 'Se cortó la salida: superó el máximo permitido.',
} as const

const ms = (n: number) => `${Math.round(n)} ms`

/** El bloque de código. `CodeBlock` no sabe ejecutar: carga el sandbox solo al pulsar. */
export function CodeBlock({ code, lang, html, runnable }: Props) {
  const [copied, setCopied] = useState(false)
  const [edited, setEdited] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [result, setResult] = useState<RunResult | null>(null)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[] | null>(null)
  const [toolBusy, setToolBusy] = useState<ToolBusy>(null)
  const [toolError, setToolError] = useState<string | null>(null)
  const alive = useRef(true)
  const cancelRun = useRef<(() => void) | null>(null)
  const text = edited ?? code

  // Al desmontar (navegación): se mata el worker y no se escribe estado.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      cancelRun.current?.()
    }
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Sin permiso de portapapeles: el texto sigue seleccionable.
    }
  }

  const run = async () => {
    if (running) return
    setRunning(true)
    setLines([])
    setResult(null)
    setDiagnostics(null)
    setToolError(null)
    try {
      const { runLua } = await import('@/lib/sandbox/run')
      if (!alive.current) return
      const handle = runLua(text, (_line, all) => {
        if (alive.current) setLines([...all])
      })
      cancelRun.current = handle.cancel
      const r = await handle.result
      cancelRun.current = null
      if (alive.current) setResult(r)
    } catch (e) {
      if (alive.current)
        setResult({
          status: 'crash',
          message:
            e instanceof Error ? e.message : 'No se pudo cargar el sandbox',
          ms: 0,
          lines: [],
        })
    } finally {
      if (alive.current) setRunning(false)
    }
  }

  const stop = () => cancelRun.current?.()

  const review = async () => {
    if (toolBusy) return
    setToolBusy('lint')
    setToolError(null)
    try {
      const { lint } = await import('@/lib/sandbox/tools')
      const r = await lint(text)
      if (!alive.current) return
      if (r.ok) setDiagnostics(r.value)
      else setToolError(r.message)
    } finally {
      if (alive.current) setToolBusy(null)
    }
  }

  const format = async () => {
    if (toolBusy || running) return
    setToolBusy('format')
    setToolError(null)
    try {
      const { format: formatLua } = await import('@/lib/sandbox/tools')
      const r = await formatLua(text)
      if (!alive.current) return
      if (!r.ok) {
        setToolError(r.message)
        return
      }
      if (r.value.formatted) {
        setEdited(r.value.code)
        setDiagnostics(null)
      } else {
        setDiagnostics([r.value.diagnostic])
      }
    } finally {
      if (alive.current) setToolBusy(null)
    }
  }

  const output =
    result !== null || lines.length > 0
      ? { result, lines }
      : running
        ? { result: null, lines }
        : null

  return (
    <figure className="code-fig bg-surface-sunken border-border max-w-3xl min-w-0 overflow-hidden rounded-md border">
      <figcaption className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-4 py-1">
        <span className="text-data text-ink-subtle uppercase">
          {lang ?? 'texto'}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {runnable &&
            (running ? (
              <ToolButton icon={Square} label="Detener" onClick={stop} />
            ) : (
              <ToolButton icon={Play} label="Ejecutar" onClick={run} />
            ))}
          {runnable && !running && (
            <>
              <ToolButton
                icon={toolBusy === 'lint' ? LoaderCircle : ListChecks}
                label="Revisar"
                onClick={review}
                busy={toolBusy === 'lint'}
              />
              <ToolButton
                icon={toolBusy === 'format' ? LoaderCircle : Sparkles}
                label="Formatear"
                onClick={format}
                busy={toolBusy === 'format'}
              />
            </>
          )}
          <ToolButton
            icon={copied ? Check : Copy}
            label={copied ? 'Copiado' : 'Copiar'}
            onClick={copy}
            tone={copied ? 'success' : undefined}
          />
        </div>
      </figcaption>
      <pre className="text-code text-ink overflow-x-auto p-4" tabIndex={0}>
        {edited === null && html !== undefined ? (
          <code dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code>{text}</code>
        )}
      </pre>
      {output && (
        <div
          role="region"
          aria-label="Salida de la ejecución"
          className="border-border bg-surface border-t px-4 py-3"
        >
          <div role="status" aria-live="polite">
            <Status result={output.result} running={running} />
          </div>
          {output.lines.length > 0 && (
            <pre className="text-code text-ink-muted mt-2 overflow-x-auto whitespace-pre-wrap">
              {output.lines.join('\n')}
            </pre>
          )}
        </div>
      )}
      {diagnostics !== null && <Diagnostics list={diagnostics} />}
      {toolError !== null && (
        <p
          role="alert"
          className="border-border text-body-sm text-warning flex items-start gap-2 border-t px-4 py-3"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {toolError}
        </p>
      )}
      <span className="sr-only" role="status">
        {copied ? 'Código copiado al portapapeles' : ''}
      </span>
    </figure>
  )
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  busy,
  tone,
}: {
  icon: typeof Play
  label: string
  onClick: () => void
  busy?: boolean
  tone?: 'success'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-label flex min-h-11 items-center gap-2 rounded-md px-3 hover:bg-surface-raised hover:text-ink md:min-h-8 ${
        tone === 'success' ? 'text-success' : 'text-ink-muted'
      }`}
    >
      <Icon
        className={`size-4 ${busy ? 'animate-spin motion-reduce:animate-none' : ''}`}
        aria-hidden="true"
      />
      {label}
    </button>
  )
}

/** Qué pasó, en una línea. El detalle del error va aparte, debajo de la salida. */
function Status({
  result,
  running,
}: {
  result: RunResult | null
  running: boolean
}): ReactNode {
  if (running)
    return (
      <p className="text-body-sm text-ink-subtle flex items-center gap-2">
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        Ejecutando…
      </p>
    )
  if (result === null) return null
  if (result.status === 'finished') {
    const o = result.outcome
    if (o.status === 'ok')
      return (
        <p className="text-body-sm text-success flex items-center gap-2">
          <Check className="size-4" aria-hidden="true" />
          Listo · {ms(result.ms)}
          {result.lines.length === 0 && (
            <span className="text-ink-subtle">(sin salida)</span>
          )}
        </p>
      )
    if (o.status === 'limit')
      return (
        <p className="text-body-sm text-warning flex items-start gap-2">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          {LIMIT_TEXT[o.reason]} · {ms(result.ms)}
        </p>
      )
    return (
      <div className="text-body-sm flex flex-col gap-1">
        <p className="text-warning flex items-center gap-2">
          <TriangleAlert className="size-4" aria-hidden="true" />
          {o.line !== null ? `Error en la línea ${o.line}` : 'Error'}
          <span className="text-ink-subtle">· {ms(result.ms)}</span>
        </p>
        <pre className="text-code text-ink-muted overflow-x-auto whitespace-pre-wrap">
          {o.message}
        </pre>
      </div>
    )
  }
  if (result.status === 'timeout')
    return (
      <p className="text-body-sm text-warning flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        No terminó a tiempo y se detuvo · {ms(result.ms)}
      </p>
    )
  if (result.status === 'cancelled')
    return (
      <p className="text-body-sm text-ink-muted flex items-center gap-2">
        <Square className="size-3.5" aria-hidden="true" />
        Detenido · {ms(result.ms)}
      </p>
    )
  return (
    <p className="text-body-sm text-warning flex items-start gap-2">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {result.message}
    </p>
  )
}

function Diagnostics({ list }: { list: Diagnostic[] }) {
  return (
    <div
      role="region"
      aria-label="Revisión del código"
      className="border-border bg-surface border-t px-4 py-3"
    >
      {list.length === 0 ? (
        <p className="text-body-sm text-success flex items-center gap-2">
          <Check className="size-4" aria-hidden="true" />
          Sin observaciones.
        </p>
      ) : (
        <ul className="text-body-sm flex flex-col gap-2">
          {list.map((d, i) => (
            <li key={i} className="flex items-start gap-2">
              <TriangleAlert
                className={`mt-0.5 size-4 shrink-0 ${
                  d.severity === 'error' ? 'text-warning' : 'text-ink-subtle'
                }`}
                aria-hidden="true"
              />
              <span>
                <span className="text-data text-ink-subtle mr-2 uppercase">
                  {d.severity === 'error' ? 'Error' : 'Aviso'} · {d.line}:
                  {d.column}
                </span>
                {d.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
