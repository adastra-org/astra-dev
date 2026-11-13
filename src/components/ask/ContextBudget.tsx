import { TriangleAlert } from 'lucide-react'
import { fmtCount, type ContextUsage } from '@/lib/ask/budget'
import { useLang } from '@/lib/use-lang'

/**
 * Cuánto de la ventana del modelo ocupa el próximo envío. Una barra con `role="meter"` y el número
 * en texto: el nivel se dice con icono y palabras, no solo con color.
 */
export function ContextBudget({ usage }: { usage: ContextUsage | null }) {
  const { tr, lang } = useLang()
  if (!usage)
    return (
      <p className="text-body-sm text-ink-muted">{tr('ask.budget.empty')}</p>
    )

  const shown = fmtCount(usage.next, lang)
  const max = fmtCount(usage.limit, lang)
  const fill =
    usage.level === 'full'
      ? 'bg-danger'
      : usage.level === 'warn'
        ? 'bg-warning'
        : 'bg-accent-fill'
  const pct = Math.min(usage.ratio, 1) * 100

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm text-ink-muted">{tr('ask.budget.lead')}</p>
      <p className="text-data text-ink tabular-nums">
        {tr('ask.budget.value', { used: shown, limit: max })}
      </p>
      <div
        role="meter"
        aria-label={tr('ask.budget.title')}
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={Math.min(usage.next, usage.limit)}
        aria-valuetext={tr('ask.budget.value', { used: shown, limit: max })}
        className="bg-surface-sunken h-2 w-full overflow-hidden rounded-pill"
      >
        <div
          className={`${fill} h-full rounded-pill`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {usage.level !== 'ok' && (
        <p
          role="status"
          className={`text-body-sm flex gap-2 ${usage.level === 'full' ? 'text-danger' : 'text-warning'}`}
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="text-ink">
            {tr(usage.level === 'full' ? 'ask.budget.full' : 'ask.budget.warn')}
          </span>
        </p>
      )}
      {usage.draft > 0 && (
        <p className="text-caption text-ink-subtle">
          {tr('ask.budget.draft', { n: fmtCount(usage.draft, lang) })}
        </p>
      )}
      {usage.estimated && (
        <p className="text-caption text-ink-subtle">
          {tr('ask.budget.estimated')}
        </p>
      )}
    </div>
  )
}
