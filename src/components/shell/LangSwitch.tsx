import { Languages } from 'lucide-react'
import { LANGS } from '@/config/nav'

/** Placeholder: el idioma activo es ES y EN no está disponible. Sin lógica hasta M2. */
export function LangSwitch() {
  return (
    <div
      role="group"
      aria-label="Idioma"
      className="bg-surface-raised rounded-pill flex shrink-0 items-center"
    >
      <Languages
        className="text-ink-subtle mr-1 ml-3 hidden size-4 md:block"
        aria-hidden="true"
      />
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          disabled={!l.available}
          aria-pressed={l.code === 'es'}
          title={l.available ? undefined : 'Inglés llega con la traducción'}
          className={[
            'text-data rounded-pill min-h-11 min-w-11 px-3 lg:min-h-10',
            l.code === 'es'
              ? 'bg-accent-fill text-on-accent'
              : 'text-ink-subtle disabled:opacity-70',
          ].join(' ')}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}
