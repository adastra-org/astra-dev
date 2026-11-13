import type { ReactNode } from 'react'
import { formatDuration, formatTokens, formatUsd } from '@/lib/ai/format'
import type { AiModel, AiOutcome, AiViewer } from '@/lib/ai/types'
import type { MessageKey } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { ChartCard } from '@/components/project/chart/shared'
import { formatValue } from '@/lib/project/series'

/** Tabla ancha: desplaza dentro de sí misma y se puede recorrer con teclado. */
function Scroll({ children }: { children: ReactNode }) {
  return (
    <div tabIndex={0} className="max-h-96 overflow-auto rounded-md">
      {children}
    </div>
  )
}

const TH = 'py-2 pr-4 font-semibold whitespace-nowrap'
const TD = 'py-1.5 pr-4 whitespace-nowrap'

function Head({ cols }: { cols: readonly { label: string; num?: boolean }[] }) {
  return (
    <thead className="bg-surface-raised text-ink-muted sticky top-0">
      <tr>
        {cols.map((c) => (
          <th
            key={c.label}
            scope="col"
            className={`${TH} ${c.num ? 'text-right' : ''}`}
          >
            {c.label}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function ModelsTable({ models }: { models: readonly AiModel[] }) {
  const { lang, tr } = useLang()
  const cols = [
    { label: tr('ai.col.model') },
    { label: tr('ai.col.requests'), num: true },
    { label: tr('ai.col.tokens'), num: true },
    { label: tr('ai.col.gpu'), num: true },
    { label: tr('ai.col.cost'), num: true },
    { label: tr('ai.col.ttft'), num: true },
    { label: tr('ai.col.tps'), num: true },
    { label: tr('ai.col.fallbacks'), num: true },
  ]
  return (
    <ChartCard title={tr('ai.models')} description={tr('ai.modelsLead')}>
      {models.length === 0 ? (
        <p className="text-body-sm text-ink-muted">{tr('ai.empty')}</p>
      ) : (
        <Scroll>
          <table className="text-body-sm w-full text-left tabular-nums">
            <caption className="sr-only">{tr('ai.models')}</caption>
            <Head cols={cols} />
            <tbody>
              {models.map((m) => (
                <tr
                  key={`${m.provider}/${m.model}`}
                  className="even:bg-surface-sunken"
                >
                  <th scope="row" className={`${TD} text-ink font-normal`}>
                    {m.model || '—'}{' '}
                    <span className="text-data text-ink-subtle">
                      {m.provider}
                    </span>
                  </th>
                  <td className={`${TD} text-right`}>
                    {formatValue(m.requests, lang)}
                  </td>
                  <td className={`${TD} text-right`}>
                    {formatTokens(m.inputTokens + m.outputTokens, lang)}
                  </td>
                  <td className={`${TD} text-right`}>
                    {m.provider === 'local'
                      ? formatDuration(m.gpuMs, lang)
                      : '—'}
                  </td>
                  <td className={`${TD} text-right`}>
                    {m.provider === 'deepseek'
                      ? formatUsd(m.costUsdEst, lang)
                      : '—'}
                  </td>
                  <td className={`${TD} text-right`}>
                    {formatDuration(m.avgTtftMs, lang)}
                  </td>
                  <td className={`${TD} text-right`}>
                    {m.avgGenTps === null
                      ? '—'
                      : formatValue(m.avgGenTps, lang)}
                  </td>
                  <td className={`${TD} text-right`}>
                    {formatValue(m.fallbacks, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      )}
    </ChartCard>
  )
}

export function ViewersTable({ viewers }: { viewers: readonly AiViewer[] }) {
  const { lang, tr } = useLang()
  const cols = [
    { label: tr('ai.col.user') },
    { label: tr('ai.col.role') },
    { label: tr('ai.col.requests'), num: true },
    { label: tr('ai.col.tokens'), num: true },
    { label: tr('ai.col.gpu'), num: true },
  ]
  return (
    <ChartCard title={tr('ai.viewers')} description={tr('ai.viewersLead')}>
      {viewers.length === 0 ? (
        <p className="text-body-sm text-ink-muted">{tr('ai.empty')}</p>
      ) : (
        <Scroll>
          <table className="text-body-sm w-full text-left tabular-nums">
            <caption className="sr-only">{tr('ai.viewers')}</caption>
            <Head cols={cols} />
            <tbody>
              {viewers.map((v) => (
                <tr key={v.viewerId} className="even:bg-surface-sunken">
                  <th scope="row" className={`${TD} text-ink font-normal`}>
                    {v.handle ?? v.viewerId}
                  </th>
                  <td className={`${TD} text-data text-ink-subtle uppercase`}>
                    {v.role}
                  </td>
                  <td className={`${TD} text-right`}>
                    {formatValue(v.requests, lang)}
                  </td>
                  <td className={`${TD} text-right`}>
                    {formatTokens(v.tokens, lang)}
                  </td>
                  <td className={`${TD} text-right`}>
                    {v.gpuMs > 0 ? formatDuration(v.gpuMs, lang) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
      )}
    </ChartCard>
  )
}

const OUTCOME_KEYS: Record<string, MessageKey> = {
  ok: 'ai.outcome.ok',
  cached: 'ai.outcome.cached',
  refused: 'ai.outcome.refused',
  truncated: 'ai.outcome.truncated',
  rate_limited: 'ai.outcome.rate_limited',
  budget_exceeded: 'ai.outcome.budget_exceeded',
  llm_unavailable: 'ai.outcome.llm_unavailable',
  viewer_unavailable: 'ai.outcome.viewer_unavailable',
  index_unavailable: 'ai.outcome.index_unavailable',
  subscription_required: 'ai.outcome.subscription_required',
  aborted: 'ai.outcome.aborted',
  internal: 'ai.outcome.internal',
}

export function OutcomesList({ outcomes }: { outcomes: readonly AiOutcome[] }) {
  const { lang, tr } = useLang()
  const total = outcomes.reduce((n, o) => n + o.count, 0)
  return (
    <ChartCard title={tr('ai.outcomes')} description={tr('ai.outcomesLead')}>
      {outcomes.length === 0 ? (
        <p className="text-body-sm text-ink-muted">{tr('ai.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {outcomes.map((o) => {
            const key = OUTCOME_KEYS[o.outcome]
            return (
              <li
                key={o.outcome}
                className="text-body-sm even:bg-surface-sunken flex items-center justify-between gap-4 rounded-sm px-2 py-1.5"
              >
                <span className="text-ink">{key ? tr(key) : o.outcome}</span>
                <span className="text-ink-muted whitespace-nowrap tabular-nums">
                  {formatValue(o.count, lang)}
                  <span className="text-ink-subtle ml-2">
                    {total > 0
                      ? `${Math.round((o.count / total) * 100)} %`
                      : ''}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </ChartCard>
  )
}
