import { useEffect, useState } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { CommandPalette } from '@/components/palette/CommandPalette'
import {
  describeTarget,
  isApple,
  isPaletteShortcut,
} from '@/lib/palette/shortcut'
import { useLang } from '@/lib/use-lang'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

/** Sidebar + barra superior + contenido. Bajo `lg` el sidebar es un cajón. */
export function Shell() {
  const { tr } = useLang()
  // El cajón guarda la ruta en la que se abrió: al navegar deja de coincidir y se cierra.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const { pathname } = useLocation()
  const open = openAt === pathname
  const setOpen = (v: boolean) => setOpenAt(v ? pathname : null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      // Con el palette encima, Esc cierra solo esa capa.
      if (document.querySelector('dialog[data-palette][open]')) return
      if (e.key === 'Escape') setOpenAt(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Palette: Ctrl+K / Cmd+K alterna desde cualquier página (reglas en lib/palette/shortcut.ts).
  const [paletteOpen, setPaletteOpen] = useState(false)
  useEffect(() => {
    const apple = isApple(navigator.platform || '')
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e, describeTarget(e.target), apple)) return
      e.preventDefault()
      setPaletteOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="text-label bg-accent-fill text-on-accent sr-only rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        {tr('shell.skip')}
      </a>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-col">
        <TopBar
          menuOpen={open}
          onMenu={() => setOpen(!open)}
          onSearch={() => setPaletteOpen(true)}
        />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none md:px-8 md:py-10"
        >
          <div className="mx-auto w-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <ScrollRestoration />
    </div>
  )
}
