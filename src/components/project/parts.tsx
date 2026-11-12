import { RefreshCw, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { describeError } from '@/lib/project/api'
import { formatStamp } from '@/lib/project/series'

/** Cifra grande con su rótulo. */
export function Stat({
  label,
  value,
  note,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="bg-surface-raised flex flex-col gap-1 rounded-md p-4">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="text-h3 tabular-nums">{value}</dd>
      {note && <dd className="text-caption text-ink-subtle">{note}</dd>}
    </div>
  )
}

/** Barra de avance: hecho, parcial y lo que falta. El texto dice lo mismo que el color. */
export function Meter({
  done,
  partial,
  total,
  label,
}: {
  done: number
  partial: number
  total: number
  label: string
}) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} de ${total} hechos${partial ? `, ${partial} parcial${partial > 1 ? 'es' : ''}` : ''}`}
      className="bg-surface-overlay flex h-2 w-full gap-0.5 overflow-hidden rounded-pill"
    >
      <span className="bg-success h-full" style={{ width: `${pct(done)}%` }} />
      <span
        className="bg-warning h-full"
        style={{ width: `${pct(partial)}%` }}
      />
    </div>
  )
}

/** Error de una sección, con reintento. `data` previo sigue visible debajo. */
export function ErrorNotice({
  error,
  onRetry,
}: {
  error: unknown
  onRetry?: () => void
}) {
  const { title, hint } = describeError(error)
  return (
    <div
      role="alert"
      className="bg-danger-surface border-danger text-body-sm flex max-w-prose items-start gap-3 rounded-md border p-4"
    >
      <TriangleAlert
        className="text-danger mt-0.5 size-5 shrink-0"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-2">
        <p>
          <strong className="text-ink">{title}.</strong>{' '}
          <span className="text-ink-muted">{hint}</span>
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-label bg-surface-overlay hover:bg-accent-fill hover:text-on-accent flex min-h-11 w-fit items-center gap-2 rounded-pill px-4 transition-colors lg:min-h-8"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Reintentar
          </button>
        )}
      </div>
    </div>
  )
}

/** "Datos de GitHub al 12 nov, 14:30". Con `stale`, avisa que GitHub no respondió. */
export function Freshness({
  at,
  stale,
  source,
}: {
  at: string
  stale: boolean
  source: string
}) {
  return (
    <p className="text-caption text-ink-subtle flex flex-wrap items-center gap-x-2">
      <span>
        {source} al {formatStamp(at)}
      </span>
      {stale && (
        <span className="text-warning flex items-center gap-1">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          GitHub no respondió: se muestra la última copia guardada
        </span>
      )}
    </p>
  )
}

/** Sección vacía o sin serie: dice qué falta y cómo se llena. Nunca datos inventados. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-border-strong text-body-sm text-ink-muted max-w-prose rounded-md border border-dashed p-4">
      {children}
    </p>
  )
}
