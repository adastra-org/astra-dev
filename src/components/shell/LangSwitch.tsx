import { Languages } from 'lucide-react'
import { useLang } from '@/lib/use-lang'
import { UI_LANGS } from '@/lib/i18n'

/** Selector de idioma de la interfaz (ES / EN). La elección queda en `localStorage`. */
export function LangSwitch() {
  const { lang, setLang, tr } = useLang()
  return (
    <div
      role="group"
      aria-label={tr('lang.name')}
      className="bg-surface-raised rounded-pill flex shrink-0 items-center"
    >
      <Languages
        className="text-ink-subtle mr-1 ml-3 hidden size-4 md:block"
        aria-hidden="true"
      />
      {UI_LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === lang}
          aria-label={
            code === lang
              ? undefined
              : tr('lang.switchTo', { lang: tr(`lang.${code}`) })
          }
          onClick={() => setLang(code)}
          className={[
            'text-data rounded-pill min-h-11 min-w-11 px-3 lg:min-h-10',
            code === lang
              ? 'bg-accent-fill text-on-accent'
              : 'text-ink-subtle hover:text-ink',
          ].join(' ')}
        >
          {tr(`lang.${code}`)}
        </button>
      ))}
    </div>
  )
}
