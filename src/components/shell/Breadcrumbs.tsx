import { ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { docBySlug } from '@/lib/docs'
import { crumbsFor } from '@/lib/crumbs'

const link =
  'text-body-sm text-ink-muted hover:bg-surface-overlay hover:text-ink flex min-h-11 items-center justify-center rounded-pill px-2 whitespace-nowrap lg:min-h-8'

/**
 * Migas de pan dentro de una pastilla. Desde `md` muestra el camino completo; bajo `md` colapsa a
 * "… / actual", donde "…" lleva al nivel superior. La última miga es la página (`aria-current`) y se
 * trunca con puntos suspensivos en una sola línea; el resto no se encoge.
 */
export function Breadcrumbs() {
  const { pathname } = useLocation()
  const crumbs = crumbsFor(pathname, (slug) => docBySlug(slug)?.title)
  const current = crumbs[crumbs.length - 1]
  const parent = crumbs[crumbs.length - 2]
  if (!current) return null

  return (
    <nav
      aria-label="Migas de pan"
      className="bg-surface-raised h-11 max-w-full min-w-0 rounded-pill px-1 md:px-2 lg:h-10"
    >
      <ol className="flex h-full min-w-0 items-center">
        {parent && (
          <li className="flex items-center md:hidden">
            <Link
              to={parent.to}
              aria-label={`Subir a ${parent.label}`}
              className={link}
            >
              …
            </Link>
            <ChevronRight
              className="text-ink-subtle size-4 shrink-0"
              aria-hidden="true"
            />
          </li>
        )}
        {crumbs.slice(0, -1).map((c) => (
          <li key={c.to} className="hidden items-center md:flex">
            <Link to={c.to} className={link}>
              {c.label}
            </Link>
            <ChevronRight
              className="text-ink-subtle size-4 shrink-0"
              aria-hidden="true"
            />
          </li>
        ))}
        <li className="min-w-0">
          <span
            aria-current="page"
            title={current.label}
            className="text-label text-ink block truncate px-1 md:px-2"
          >
            {current.label}
          </span>
        </li>
      </ol>
    </nav>
  )
}
