import { BadgeCheck, Languages } from 'lucide-react'
import type { Translated } from '@/lib/docs/types'
import { useLang } from '@/lib/use-lang'

/** Chip de una traducción en listas y cabeceras. Relleno, sin borde. */
/** El significado va en palabras, nunca solo en color o icono. */
export function TranslationBadge({ translated }: { translated: Translated }) {
  const { tr } = useLang()
  const Icon = translated === 'reviewed' ? BadgeCheck : Languages
  return (
    <span
      className={[
        'text-data inline-flex items-center gap-1 rounded-sm px-2 py-1 whitespace-nowrap uppercase',
        translated === 'reviewed'
          ? 'bg-surface-sunken text-success'
          : 'bg-surface-sunken text-ink-muted',
      ].join(' ')}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {tr(`translation.${translated}`)}
    </span>
  )
}
