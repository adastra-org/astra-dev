import { Languages } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Translated } from '@/lib/docs/types'
import { useLang } from '@/lib/use-lang'

interface Props {
  /** `es` si se muestra la traducción; `en` si se pidió el original (`?lang=en`). */
  showing: 'es' | 'en'
  translated: Translated
  /** Ruta de la página, para el enlace que cambia de versión. */
  to: string
}

/**
 * Aviso sobre el idioma del texto. Con la traducción a la vista dice si es automática o revisada
 * y ofrece el original; con el original a la vista ofrece la traducción. No es el selector de
 * idioma de la interfaz: solo cambia esta página.
 */
export function TranslationNote({ showing, translated, to }: Props) {
  const { tr } = useLang()
  return (
    <aside
      aria-label={tr('translation.note')}
      className="bg-surface-raised text-body-sm text-ink-muted flex max-w-prose flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-4 py-3"
    >
      <Languages className="text-accent size-4 shrink-0" aria-hidden="true" />
      {showing === 'es' ? (
        <span>
          <strong className="text-ink font-medium">
            {tr(`translation.${translated}`)}
          </strong>
          {translated === 'auto' ? tr('translation.autoHint') : '.'}
        </span>
      ) : (
        <span>
          {tr('translation.original')}{' '}
          <strong className="text-ink font-medium">
            {tr('translation.originalStrong')}
          </strong>
          .
        </span>
      )}
      <Link
        to={showing === 'es' ? `${to}?lang=en` : to}
        replace
        className="text-label text-accent hover:text-ink inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-8"
      >
        {showing === 'es'
          ? tr('translation.seeOriginal')
          : tr('translation.seeTranslation')}
      </Link>
    </aside>
  )
}

/** Aviso en inglés sobre un doc escrito solo en español (no hay traducción al inglés todavía). */
export function OnlySpanishNote() {
  const { tr } = useLang()
  return (
    <aside
      aria-label={tr('translation.note')}
      className="bg-surface-raised text-body-sm text-ink-muted flex max-w-prose items-center gap-x-3 rounded-md px-4 py-3"
    >
      <Languages className="text-accent size-4 shrink-0" aria-hidden="true" />
      <span>{tr('translation.onlySpanish')}</span>
    </aside>
  )
}
