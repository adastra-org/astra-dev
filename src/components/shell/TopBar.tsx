import { Menu } from 'lucide-react'
import { AskTrigger } from '@/components/ask/AskTrigger'
import { PaletteTrigger } from '@/components/palette/PaletteTrigger'
import { useLang } from '@/lib/use-lang'
import { Breadcrumbs } from './Breadcrumbs'
import { LangSwitch } from './LangSwitch'

interface Props {
  menuOpen: boolean
  onMenu: () => void
  onSearch: () => void
}

/**
 * Fila de pastillas flotantes, sin fondo ni borde: cada pastilla lleva su propio relleno, así el
 * contenido que pasa por debajo no choca con texto. El contenedor no recibe clics (`pointer-events-none`)
 * para no tapar lo que queda entre pastillas.
 */
export function TopBar({ menuOpen, onMenu, onSearch }: Props) {
  const { tr } = useLang()
  return (
    <header className="pointer-events-none sticky top-0 z-20 flex shrink-0 items-center gap-2 px-4 pt-3 md:px-8">
      <div className="pointer-events-auto contents">
        <button
          type="button"
          aria-label={tr('shell.openMenu')}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          onClick={onMenu}
          className="text-ink-muted bg-surface-raised hover:bg-surface-overlay hover:text-ink rounded-pill grid size-11 shrink-0 place-items-center lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
        <Breadcrumbs />
        <div
          className="pointer-events-none min-w-0 flex-1"
          aria-hidden="true"
        />
        <PaletteTrigger onOpen={onSearch} />
        <AskTrigger />
        <LangSwitch />
      </div>
    </header>
  )
}
