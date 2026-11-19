import { SlidersHorizontal } from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { useAskPrefs } from './useAskPrefs'

/** Rail de /ask: resumen de cómo habla Ether y el botón para rehacer el onboarding. */
export function PersonalizePanel({
  onOpen,
  openRef,
}: {
  onOpen: () => void
  openRef?: React.Ref<HTMLButtonElement>
}) {
  const { tr } = useLang()
  const { prefs } = useAskPrefs()
  return (
    <section
      aria-labelledby="ask-personalize-title"
      className="flex flex-col gap-2"
    >
      <h2 id="ask-personalize-title" className="text-eyebrow">
        {tr('ask.onb.rail.title')}
      </h2>
      {prefs.name && (
        <p className="text-body-sm text-ink">
          {tr('ask.onb.rail.hello', { name: prefs.name })}
        </p>
      )}
      <p className="text-body-sm text-ink-muted">
        {tr('ask.onb.rail.summary', {
          tone: tr(`ask.onb.tone.${prefs.tone}` as MessageKey).toLowerCase(),
          length: tr(
            `ask.onb.length.${prefs.length}` as MessageKey,
          ).toLowerCase(),
          accent: tr(
            `ask.onb.color.${prefs.accent}` as MessageKey,
          ).toLowerCase(),
        })}
      </p>
      <button
        ref={openRef}
        type="button"
        onClick={onOpen}
        className="text-label text-ink bg-surface-raised hover:bg-surface-overlay inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-3 md:min-h-8"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        {tr(prefs.done ? 'ask.onb.reopen' : 'ask.onb.open')}
      </button>
    </section>
  )
}
