import { BookOpen, House, Milestone, Orbit, Wrench, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import { NAV, type NavIcon } from '@/config/nav'
import { docs } from '@/lib/docs'
import pkg from '../../../package.json'

const ICONS: Record<NavIcon, LucideIcon> = {
  home: House,
  docs: BookOpen,
  tools: Wrench,
  roadmap: Milestone,
}

const sortedDocs = [...docs].sort((a, b) =>
  a.title.localeCompare(b.title, 'es'),
)

interface Props {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: Props) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={onClose}
          className="bg-brand-dark/70 fixed inset-0 z-30 lg:hidden"
        />
      )}
      <aside
        id="sidebar"
        aria-label="Navegación principal"
        className={[
          'bg-surface-sunken border-border fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r',
          'transition-[transform,visibility] duration-(--duration-panel) ease-out motion-reduce:transition-none',
          'lg:sticky lg:top-0 lg:h-svh lg:translate-x-0',
          open ? 'translate-x-0' : 'invisible -translate-x-full lg:visible',
        ].join(' ')}
      >
        <div className="border-border flex h-14 shrink-0 items-center justify-between border-b px-4">
          <Link
            to="/"
            className="font-heading flex items-center gap-2 text-sm font-bold tracking-tight"
          >
            <Orbit className="text-accent size-5" aria-hidden="true" />
            Astra Dev
          </Link>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={onClose}
            className="text-ink-muted hover:bg-surface-raised hover:text-ink -mr-2 grid size-11 place-items-center rounded-md lg:hidden"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const Icon = ICONS[item.icon]
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    className={({ isActive }) =>
                      [
                        'text-label flex min-h-11 items-center gap-3 rounded-md px-3 transition-colors duration-(--duration-fast) lg:min-h-10',
                        isActive
                          ? 'bg-surface-raised text-ink'
                          : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`size-4 shrink-0 ${isActive ? 'text-accent' : ''}`}
                          aria-hidden="true"
                        />
                        {item.label}
                      </>
                    )}
                  </NavLink>
                  {item.icon === 'docs' && (
                    <ul
                      aria-label="Documentos"
                      className="mt-1 mb-2 ml-4 flex flex-col gap-0.5"
                    >
                      {sortedDocs.map((d) => (
                        <li key={d.slug}>
                          <NavLink
                            to={`/docs/${d.slug}`}
                            onClick={onClose}
                            className={({ isActive }) =>
                              [
                                'text-body-sm flex min-h-11 items-center rounded-md px-3 transition-colors duration-(--duration-fast) lg:min-h-8',
                                isActive
                                  ? 'bg-surface-raised text-ink'
                                  : 'text-ink-muted hover:bg-surface-raised hover:text-ink',
                              ].join(' ')
                            }
                          >
                            {d.title}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="text-caption text-ink-subtle px-4 py-4">
          <span className="text-data">v{pkg.version}</span>
          <span className="mx-2" aria-hidden="true">
            ·
          </span>
          Ad Astra
        </div>
      </aside>
    </>
  )
}
