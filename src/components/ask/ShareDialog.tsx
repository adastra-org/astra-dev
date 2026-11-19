import { Check, Copy, Link2, Share2, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { describeAskError, type ErrorView } from '@/lib/ask/errors'
import {
  buildSharePayload,
  createShare,
  listMyShares,
  revokeShare,
  shareableTurns,
  SHARE_TTL_CHOICES,
  shareUrl,
  type ShareAudience,
  type ShareConfig,
  type ShareSummary,
} from '@/lib/ask/share'
import type { Turn } from '@/lib/ask/store'
import { AskError } from '@/lib/ask/types'
import type { MessageKey } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { Choice } from './OnboardingDialog'

const BTN =
  'text-label inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 md:min-h-8 disabled:opacity-50'

type Phase = 'idle' | 'creating' | 'done'

/** Ids de los turnos que se marcan al abrir: los últimos `max` compartibles. */
export function defaultSelection(turns: readonly Turn[], max: number) {
  return new Set(
    shareableTurns(turns)
      .slice(-Math.max(1, max))
      .map((t) => t.id),
  )
}

const short = (s: string, n = 70) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}

/**
 * Compartir una charla (issue #34). `<dialog>` modal nativo, como el onboarding. El usuario elige
 * qué turnos salen, ve el texto exacto que se envía, decide quién lo abre y cuánto dura. El enlace
 * se muestra una sola vez: el server solo guarda su hash. Contrato en docs/server/README.md.
 */
export function ShareDialog({
  open,
  onClose,
  turns,
  memories,
  config,
}: {
  open: boolean
  onClose: () => void
  turns: readonly Turn[]
  /** Textos de las memorias de este navegador: se tapan si aparecen literales. */
  memories: readonly string[]
  config: ShareConfig
}) {
  const { tr, lang } = useLang()
  const ref = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const uid = useId()
  const ttls = SHARE_TTL_CHOICES.filter((h) => h <= config.maxTtlHours)
  const initialTtl = ttls.includes(config.defaultTtlHours)
    ? config.defaultTtlHours
    : (ttls.at(-1) ?? config.defaultTtlHours)

  const [include, setInclude] = useState<ReadonlySet<number>>(() =>
    defaultSelection(turns, config.maxTurns),
  )
  const [audience, setAudience] = useState<ShareAudience>('staff')
  const [confirmed, setConfirmed] = useState(false)
  const [ttl, setTtl] = useState(initialTtl)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorView | null>(null)
  const [result, setResult] = useState<{
    url: string
    expiresAt: string
  } | null>(null)
  const [copied, setCopied] = useState(false)
  const [mine, setMine] = useState<ShareSummary[] | null>(null)
  const [notice, setNotice] = useState('')

  const eligible = shareableTurns(turns)
  const built = useMemo(
    () => buildSharePayload(turns, { include, memories }),
    [turns, include, memories],
  )
  const overMax = include.size > config.maxTurns
  const canCreate =
    phase === 'idle' &&
    built.turns.length > 0 &&
    !overMax &&
    !built.tooLong &&
    (audience === 'staff' || confirmed)

  const loadMine = () =>
    listMyShares()
      .then(setMine)
      .catch(() => setMine([]))

  // Al abrir: estado limpio (el enlace anterior no se conserva) y la lista de enlaces propios.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setInclude(defaultSelection(turns, config.maxTurns))
      setAudience('staff')
      setConfirmed(false)
      setTtl(initialTtl)
      setPhase('idle')
      setError(null)
      setResult(null)
      setCopied(false)
      setNotice('')
      setMine(null)
      d.showModal()
      void loadMine()
    } else if (!open && d.open) d.close()
    // Solo reacciona a abrir/cerrar; lo demás se lee en ese momento.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Clic en el fondo: cae sobre el propio `<dialog>`.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === d) onClose()
    }
    d.addEventListener('click', onBackdrop)
    return () => d.removeEventListener('click', onBackdrop)
  })

  const toggle = (id: number) =>
    setInclude((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const create = async () => {
    if (!canCreate) return
    setPhase('creating')
    setError(null)
    try {
      const made = await createShare({
        turns: built.turns,
        audience,
        ttlHours: ttl,
      })
      setResult({
        url: shareUrl(made.token, window.location.origin),
        expiresAt: made.expiresAt,
      })
      setPhase('done')
      void loadMine()
      queueMicrotask(() => titleRef.current?.focus())
    } catch (e) {
      setPhase('idle')
      setError(
        describeAskError(
          e instanceof AskError ? e : new AskError('internal', String(e)),
          tr,
        ),
      )
    }
  }

  const copy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso del portapapeles: el campo queda seleccionado para copiar a mano.
      document.getElementById(`${uid}-url`)?.focus()
    }
  }

  const revoke = async (id: string) => {
    try {
      await revokeShare(id)
      setNotice(tr('share.revoked'))
      setMine((m) => (m ? m.filter((s) => s.id !== id) : m))
    } catch (e) {
      setNotice('')
      setError(
        describeAskError(
          e instanceof AskError ? e : new AskError('internal', String(e)),
          tr,
        ),
      )
    }
  }

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${uid}-title`}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (open) onClose()
      }}
      className="bg-surface-raised text-ink border-border shadow-card backdrop:bg-brand-dark/70 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-xl flex-col overflow-hidden rounded-lg border p-0 open:flex"
    >
      {open && (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-surface-sunken text-accent flex size-10 shrink-0 items-center justify-center rounded-md"
              >
                {phase === 'done' ? (
                  <Link2 className="size-5" />
                ) : (
                  <Share2 className="size-5" />
                )}
              </span>
              <div className="min-w-0">
                <h2
                  id={`${uid}-title`}
                  ref={titleRef}
                  tabIndex={-1}
                  className="text-h4 outline-none"
                >
                  {phase === 'done'
                    ? tr('share.done.title')
                    : tr('share.title')}
                </h2>
                <p className="text-body-sm text-ink-muted mt-1">
                  {phase === 'done' ? tr('share.done.hint') : tr('share.lead')}
                </p>
              </div>
            </div>

            {phase === 'done' && result ? (
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-url`} className="text-label">
                  {tr('share.url.label')}
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id={`${uid}-url`}
                    type="text"
                    readOnly
                    value={result.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="text-data text-ink bg-surface-sunken focus-visible:outline-focus min-h-11 min-w-0 flex-1 rounded-md px-3 outline-offset-0 focus-visible:outline-2 md:min-h-9"
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className={`${BTN} bg-accent-fill text-on-accent hover:bg-accent-fill-hover`}
                  >
                    {copied ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : (
                      <Copy className="size-4" aria-hidden="true" />
                    )}
                    {copied ? tr('share.copied') : tr('share.copy')}
                  </button>
                </div>
                <p role="status" className="text-caption text-ink-muted">
                  {tr('share.view.expires', { date: date(result.expiresAt) })}
                  <span className="sr-only">
                    {copied ? ` ${tr('share.copied')}` : ''}
                  </span>
                </p>
              </div>
            ) : (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-label mb-2">
                    {tr('share.turns.legend')}
                  </legend>
                  {eligible.map((t, i) => {
                    const on = include.has(t.id)
                    return (
                      <label
                        key={t.id}
                        className="has-[:focus-visible]:outline-focus flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-2 has-[:focus-visible]:outline-2"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(t.id)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`${on ? 'bg-accent-fill text-on-accent' : 'border-border-strong border'} mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm`}
                        >
                          {on && <Check className="size-3.5" />}
                        </span>
                        <span className="text-body-sm min-w-0 break-words">
                          {tr('share.turns.item', {
                            n: i + 1,
                            q: short(t.question),
                          })}
                        </span>
                      </label>
                    )
                  })}
                  {built.turns.length === 0 && (
                    <p className="text-body-sm text-ink-muted">
                      {tr('share.turns.none')}
                    </p>
                  )}
                  {overMax && (
                    <p className="text-body-sm text-danger">
                      {tr('share.turns.max', { n: config.maxTurns })}
                    </p>
                  )}
                </fieldset>

                <details className="bg-surface-sunken rounded-md">
                  <summary className="text-label min-h-11 cursor-pointer px-3 py-3 md:min-h-8 md:py-1.5">
                    {tr('share.preview')}
                  </summary>
                  <div className="flex max-h-64 flex-col gap-3 overflow-y-auto px-3 pb-3">
                    {built.turns.map((t, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <p className="text-eyebrow">
                          {tr('share.preview.question')}
                        </p>
                        <p className="text-body-sm break-words whitespace-pre-wrap">
                          {t.question}
                        </p>
                        <p className="text-eyebrow">
                          {tr('share.preview.answer')}
                        </p>
                        <p className="text-body-sm text-ink-muted break-words whitespace-pre-wrap">
                          {t.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>

                {built.scrubbed > 0 && (
                  <Note>{tr('share.scrubbed', { n: built.scrubbed })}</Note>
                )}
                {built.withMemories && <Note>{tr('share.memoriesWarn')}</Note>}
                {built.tooLong && <Note>{tr('share.tooLong')}</Note>}

                {config.publicAllowed && (
                  <Choice
                    name={`${uid}-audience`}
                    legend={tr('share.audience.legend')}
                    value={audience}
                    options={(['staff', 'public'] as const).map((v) => ({
                      value: v,
                      label: tr(`share.audience.${v}` as MessageKey),
                      desc: tr(`share.audience.${v}.desc` as MessageKey),
                    }))}
                    onChange={(v) => {
                      setAudience(v)
                      setConfirmed(false)
                    }}
                  />
                )}

                {config.publicAllowed && audience === 'public' && (
                  <label className="has-[:focus-visible]:outline-focus flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-1 py-2 has-[:focus-visible]:outline-2">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={`${confirmed ? 'bg-accent-fill text-on-accent' : 'border-border-strong border'} mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm`}
                    >
                      {confirmed && <Check className="size-3.5" />}
                    </span>
                    <span className="text-body-sm">
                      {tr('share.audience.confirm')}
                    </span>
                  </label>
                )}

                {ttls.length > 1 && (
                  <Choice
                    name={`${uid}-ttl`}
                    legend={tr('share.ttl.legend')}
                    value={String(ttl)}
                    options={ttls.map((h) => ({
                      value: String(h),
                      label: tr(`share.ttl.${h}` as MessageKey),
                      desc: '',
                    }))}
                    onChange={(v) => setTtl(Number(v))}
                  />
                )}
              </>
            )}

            {error && (
              <div role="alert" className="text-body-sm flex gap-2">
                <TriangleAlert
                  className="text-danger mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-ink">{error.title}</p>
                  {error.hint && <p className="text-ink-muted">{error.hint}</p>}
                </div>
              </div>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-eyebrow">{tr('share.mine')}</h3>
              {mine === null ? (
                <p className="text-body-sm text-ink-muted">
                  {tr('share.mine.loading')}
                </p>
              ) : mine.length === 0 ? (
                <p className="text-body-sm text-ink-muted">
                  {tr('share.mine.empty')}
                </p>
              ) : (
                <ul className="flex flex-col">
                  {mine.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 py-1"
                    >
                      <span className="text-body-sm text-ink-muted min-w-0">
                        {tr('share.mine.item', {
                          audience: tr(
                            `share.audience.${s.audience}` as MessageKey,
                          ),
                          date: date(s.expiresAt),
                          turns: s.turns,
                          views: s.views,
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => void revoke(s.id)}
                        aria-label={tr('share.revoke.label', {
                          date: date(s.expiresAt),
                        })}
                        className="text-label text-ink hover:bg-surface-overlay inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 md:min-h-8"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        {tr('share.revoke')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p role="status" className="text-caption text-ink-muted">
                {notice}
              </p>
            </section>
          </div>

          <div className="border-border flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:justify-end md:px-6">
            <button
              type="button"
              onClick={onClose}
              className={`${BTN} text-ink bg-surface-overlay hover:bg-surface-sunken`}
            >
              {tr('share.close')}
            </button>
            {phase !== 'done' && (
              <button
                type="button"
                disabled={!canCreate}
                onClick={() => void create()}
                className={`${BTN} bg-accent-fill text-on-accent hover:bg-accent-fill-hover`}
              >
                <Link2 className="size-4" aria-hidden="true" />
                {phase === 'creating'
                  ? tr('share.creating')
                  : tr('share.create')}
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  )
}

function Note({ children }: { children: string }) {
  return (
    <p className="text-body-sm text-ink-muted bg-surface-sunken flex gap-2 rounded-md p-3">
      <TriangleAlert
        className="text-warning mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      {children}
    </p>
  )
}
