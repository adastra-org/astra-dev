import { Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { navFor } from '@/config/nav'
import { LangSwitch } from './LangSwitch'

interface Props {
  menuOpen: boolean
  onMenu: () => void
}

export function TopBar({ menuOpen, onMenu }: Props) {
  const { pathname } = useLocation()
  const section = navFor(pathname)

  return (
    <header className="bg-surface border-border sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 md:px-8">
      <button
        type="button"
        aria-label="Abrir menú"
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        onClick={onMenu}
        className="text-ink-muted hover:bg-surface-raised hover:text-ink -ml-2 grid size-11 place-items-center rounded-md lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <p className="text-label text-ink-muted min-w-0 flex-1 truncate">
        {section?.label ?? 'Astra Dev'}
      </p>
      <LangSwitch />
    </header>
  )
}
