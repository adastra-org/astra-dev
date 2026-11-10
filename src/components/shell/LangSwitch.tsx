import { Languages } from 'lucide-react'
import { LANGS } from '@/config/nav'

/** Placeholder: el idioma activo es ES y EN no está disponible. Sin lógica hasta M2. */
export function LangSwitch() {
  return (
    <div
      role="group"
      aria-label="Idioma"
      className="border-border-strong flex items-center gap-1 rounded-md border p-1"
    >
      <Languages className="text-ink-subtle mx-1 size-4" aria-hidden="true" />
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          disabled={!l.available}
          aria-pressed={l.code === 'es'}
          title={l.available ? undefined : 'Inglés llega con la traducción'}
          className={[
            'text-data min-h-9 min-w-9 rounded-sm px-2 md:min-h-7 md:min-w-8',
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
