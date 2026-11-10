import { Search } from 'lucide-react'
import { isApple } from '@/lib/palette/shortcut'
import { Shortcut } from './Kbd'

const keys = isApple(
  typeof navigator === 'undefined' ? '' : navigator.platform || '',
)
  ? ['⌘', 'K']
  : ['Ctrl', 'K']

/**
 * Botón de la barra superior. Bajo `md` es solo la lupa (44 px); desde `md` parece un campo con
 * el atajo al lado. El atajo se oculta en pantallas táctiles (`pointer-fine`): ahí no hay teclado.
 */
export function PaletteTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Buscar"
      aria-haspopup="dialog"
      aria-keyshortcuts={keys[0] === '⌘' ? 'Meta+K' : 'Control+K'}
      className="text-ink-muted bg-surface-raised hover:text-ink flex size-11 shrink-0 items-center justify-center gap-3 rounded-md md:h-11 md:w-64 md:justify-start md:px-3 lg:h-9"
    >
      <Search className="size-5 shrink-0 md:size-4" aria-hidden="true" />
      <span className="text-body-sm hidden flex-1 text-left md:inline">
        Buscar
      </span>
      <span className="hidden pointer-fine:md:inline-flex">
        <Shortcut
          keys={keys}
          label={keys[0] === '⌘' ? 'Comando K' : 'Control K'}
        />
      </span>
    </button>
  )
}
