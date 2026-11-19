import {
  Check,
  Palette,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import {
  isLastStep,
  nextStepIndex,
  ONBOARDING_STEPS,
  onboardingProgress,
  previousStepIndex,
  type OnboardingStep,
} from '@/lib/ask/onboarding'
import {
  ACCENTS,
  LENGTHS,
  NAME_MAX,
  prefsStore,
  TONES,
  type Accent,
  type AskPrefs,
} from '@/lib/ask/prefs'
import type { MessageKey } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { useAskPrefs } from './useAskPrefs'

const STEP_ICON: Record<OnboardingStep, LucideIcon> = {
  hello: Sparkles,
  tone: Sparkles,
  color: Palette,
}

type Draft = Pick<AskPrefs, 'tone' | 'length' | 'accent' | 'name'>

const BTN =
  'text-label inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 md:min-h-8'

/**
 * Onboarding con Ether: tres pasos (hola y nombre, tono y largo, color). `<dialog>` modal nativo,
 * como el panel y la paleta: foco atrapado, fondo inerte, Esc cierra. Esc, "Saltar" y el fondo
 * marcan el onboarding como visto sin guardar lo elegido; "Listo" guarda y lo marca como visto.
 * Portado de `eternum/lux`; plan en docs/chat/README.md (Onboarding).
 */
export function OnboardingDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { tr } = useLang()
  const { prefs, persisted } = useAskPrefs()
  const ref = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const uid = useId()
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<Draft>(prefs)

  // Al abrir: el recorrido empieza de cero con lo guardado como punto de partida.
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setIndex(0)
      setDraft({
        tone: prefs.tone,
        length: prefs.length,
        accent: prefs.accent,
        name: prefs.name,
      })
      d.showModal()
      // El navegador enfoca el primer elemento enfocable (el título): se lleva al campo del nombre.
      d.querySelector<HTMLElement>('input[type=text]')?.focus()
    } else if (!open && d.open) d.close()
    // `prefs` se lee solo al abrir.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Clic en el fondo: cae sobre el propio `<dialog>` (el panel ocupa todo el elemento).
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === d) skip()
    }
    d.addEventListener('click', onBackdrop)
    return () => d.removeEventListener('click', onBackdrop)
  })

  // Cada paso mueve el foco a su título: lo lee el lector de pantalla y el teclado sigue desde ahí.
  useEffect(() => {
    if (open && index > 0) titleRef.current?.focus()
  }, [index, open])

  const skip = () => {
    prefsStore.markDone()
    onClose()
  }
  const finish = () => {
    prefsStore.update({ ...draft, done: true })
    onClose()
  }

  const total = ONBOARDING_STEPS.length
  const step = ONBOARDING_STEPS[Math.min(index, total - 1)]!
  const last = isLastStep(index, total)
  const Icon = STEP_ICON[step]
  const stepLabel = tr('ask.onb.step', { current: index + 1, total })
  const titleKey = `ask.onb.${step}.title` as MessageKey

  return (
    <dialog
      ref={ref}
      data-palette=""
      data-chat-accent={draft.accent}
      aria-labelledby={`${uid}-title`}
      onCancel={(e) => {
        e.preventDefault()
        skip()
      }}
      onClose={() => {
        if (open) onClose()
      }}
      className="bg-surface-raised text-ink border-border shadow-card backdrop:bg-brand-dark/70 m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg flex-col overflow-hidden rounded-lg border p-0 open:flex"
    >
      {open && (
        <>
          <div className="flex flex-col gap-2 px-4 pt-4 pb-3 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-eyebrow">{tr('ask.onb.title')}</span>
              <span className="text-caption text-ink-muted tabular-nums">
                {stepLabel}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={tr('ask.onb.progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={onboardingProgress(index, total)}
              aria-valuetext={stepLabel}
              className="bg-surface-sunken h-1.5 w-full overflow-hidden rounded-pill"
            >
              <div
                className="bg-accent-fill h-full rounded-pill"
                style={{ width: `${onboardingProgress(index, total)}%` }}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4 md:px-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="bg-surface-sunken text-accent flex size-10 shrink-0 items-center justify-center rounded-md"
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h2
                  id={`${uid}-title`}
                  ref={titleRef}
                  tabIndex={-1}
                  className="text-h4 outline-none"
                >
                  {tr(titleKey)}
                </h2>
                <p className="text-body-sm text-ink-muted mt-1">
                  {tr(`ask.onb.${step}.lead` as MessageKey)}
                </p>
              </div>
            </div>

            {step === 'hello' && (
              <div className="flex flex-col gap-1">
                <label htmlFor={`${uid}-name`} className="text-label">
                  {tr('ask.onb.hello.name')}
                </label>
                <input
                  id={`${uid}-name`}
                  type="text"
                  autoComplete="off"
                  value={draft.name}
                  maxLength={NAME_MAX}
                  placeholder={tr('ask.onb.hello.namePlaceholder')}
                  aria-describedby={`${uid}-name-hint`}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      setIndex((i) => nextStepIndex(i, total))
                    }
                  }}
                  className="text-body text-ink bg-surface-sunken placeholder:text-ink-subtle focus-visible:outline-focus min-h-11 w-full rounded-md px-3 outline-offset-0 focus-visible:outline-2 md:min-h-9"
                />
                <p
                  id={`${uid}-name-hint`}
                  className="text-caption text-ink-subtle"
                >
                  {tr('ask.onb.hello.nameHint')}
                </p>
              </div>
            )}

            {step === 'tone' && (
              <>
                <Choice
                  name={`${uid}-tone`}
                  legend={tr('ask.onb.tone.label')}
                  value={draft.tone}
                  options={TONES.map((v) => ({
                    value: v,
                    label: tr(`ask.onb.tone.${v}` as MessageKey),
                    desc: tr(`ask.onb.tone.${v}.desc` as MessageKey),
                  }))}
                  onChange={(tone) => setDraft((d) => ({ ...d, tone }))}
                />
                <Choice
                  name={`${uid}-length`}
                  legend={tr('ask.onb.length.label')}
                  value={draft.length}
                  options={LENGTHS.map((v) => ({
                    value: v,
                    label: tr(`ask.onb.length.${v}` as MessageKey),
                    desc: tr(`ask.onb.length.${v}.desc` as MessageKey),
                  }))}
                  onChange={(length) => setDraft((d) => ({ ...d, length }))}
                />
              </>
            )}

            {step === 'color' && (
              <>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-label mb-2">
                    {tr('ask.onb.color.label')}
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {ACCENTS.map((a) => (
                      <Swatch
                        key={a}
                        name={`${uid}-accent`}
                        accent={a}
                        label={tr(`ask.onb.color.${a}` as MessageKey)}
                        checked={draft.accent === a}
                        onChange={() => setDraft((d) => ({ ...d, accent: a }))}
                      />
                    ))}
                  </div>
                </fieldset>
                <div className="bg-surface-sunken flex flex-col gap-2 rounded-md p-3">
                  <p className="text-body-sm text-ink-muted">
                    {tr('ask.onb.color.preview')}
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="text-label bg-accent-fill text-on-accent inline-flex min-h-8 items-center rounded-md px-3">
                      {tr('ask.onb.color.sampleButton')}
                    </span>
                    <span className="text-label text-accent underline underline-offset-4">
                      {tr('ask.onb.color.sampleLink')}
                    </span>
                  </div>
                </div>
              </>
            )}

            <p role="status" className="text-caption text-ink-subtle">
              {persisted ? (
                tr('ask.onb.saved')
              ) : (
                <span className="text-ink-muted flex gap-2">
                  <TriangleAlert
                    className="text-warning mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  {tr('ask.onb.unsaved')}
                </span>
              )}
            </p>
          </div>

          <div className="border-border flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
            <button
              type="button"
              onClick={skip}
              className={`${BTN} text-ink-muted hover:bg-surface-overlay hover:text-ink`}
            >
              {tr('ask.onb.skip')}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => setIndex((i) => previousStepIndex(i, total))}
                className={`${BTN} text-ink bg-surface-overlay hover:bg-surface-sunken flex-1 disabled:opacity-50 sm:flex-none`}
              >
                {tr('ask.onb.back')}
              </button>
              <button
                type="button"
                onClick={() =>
                  last ? finish() : setIndex((i) => nextStepIndex(i, total))
                }
                className={`${BTN} bg-accent-fill text-on-accent hover:bg-accent-fill-hover flex-1 sm:flex-none`}
              >
                {last && <Check className="size-4" aria-hidden="true" />}
                {last ? tr('ask.onb.finish') : tr('ask.onb.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </dialog>
  )
}

interface Option<T extends string> {
  value: T
  label: string
  desc: string
}

/** Grupo de radios nativos con tarjetas: la elegida lleva marca y borde, no solo color. */
function Choice<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string
  legend: string
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-label mb-2">{legend}</legend>
      {options.map((o) => {
        const on = o.value === value
        return (
          <label
            key={o.value}
            className={`${on ? 'border-accent bg-surface-overlay' : 'border-border'} has-[:focus-visible]:outline-focus flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 has-[:focus-visible]:outline-2`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={on}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`${on ? 'bg-accent-fill text-on-accent' : 'border-border-strong border'} mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-pill`}
            >
              {on && <Check className="size-3.5" />}
            </span>
            <span className="min-w-0">
              <span className="text-label block">{o.label}</span>
              <span className="text-body-sm text-ink-muted block">
                {o.desc}
              </span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

/** Muestra de un color: el relleno sale del propio preset (`data-chat-accent`), sin hex. */
function Swatch({
  name,
  accent,
  label,
  checked,
  onChange,
}: {
  name: string
  accent: Accent
  label: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <label
      data-chat-accent={accent}
      className={`${checked ? 'border-accent bg-surface-overlay' : 'border-border'} has-[:focus-visible]:outline-focus flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 has-[:focus-visible]:outline-2`}
    >
      <input
        type="radio"
        name={name}
        value={accent}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="bg-accent-fill text-on-accent flex size-6 shrink-0 items-center justify-center rounded-pill"
      >
        {checked && <Check className="size-4" />}
      </span>
      <span className="text-label">{label}</span>
    </label>
  )
}
