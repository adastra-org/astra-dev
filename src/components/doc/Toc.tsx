import { useEffect, useState } from 'react'
import type { TocItem } from '@/lib/docs/types'
import { Collapsible } from './Collapsible'

/** Índice con el ítem visible resaltado (IntersectionObserver sobre los encabezados). */
function useActiveId(items: TocItem[]): string | undefined {
  const [active, setActive] = useState<string | undefined>()

  useEffect(() => {
    const els = items.flatMap((i) => document.getElementById(i.id) ?? [])
    if (!els.length || !('IntersectionObserver' in window)) return
    const visible = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        const first = items.find((i) => visible.has(i.id))
        if (first) setActive(first.id)
      },
      // Franja superior de la ventana, bajo la barra de 56 px.
      { rootMargin: '-72px 0px -65% 0px' },
    )
    for (const el of els) io.observe(el)
    return () => io.disconnect()
  }, [items])

  return active
}

function List({ items, active }: { items: TocItem[]; active?: string }) {
  return (
    <ul className="flex flex-col">
      {items.map((i) => (
        <li key={i.id}>
          <a
            href={`#${i.id}`}
            aria-current={active === i.id ? 'location' : undefined}
            className={[
              'text-body-sm flex min-h-11 items-center border-l-2 py-1 xl:min-h-8',
              i.depth === 3 ? 'pl-6' : 'pl-3',
              active === i.id
                ? 'border-accent text-ink'
                : 'border-border text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {i.title}
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Índice plegable para menos de `xl`: va arriba del contenido. Se omite con menos de tres entradas. */
export function TocInline({ items }: { items: TocItem[] }) {
  if (items.length < 3) return null
  return (
    <div className="xl:hidden">
      <Collapsible title="En esta página">
        <nav aria-label="En esta página">
          <List items={items} />
        </nav>
      </Collapsible>
    </div>
  )
}

/** Índice fijo a la derecha desde `xl`, con el ítem visible resaltado. */
export function TocSide({ items }: { items: TocItem[] }) {
  const active = useActiveId(items)
  if (items.length < 3) return null
  return (
    <nav
      aria-label="En esta página"
      className="sticky top-20 hidden max-h-[calc(100svh-6rem)] overflow-y-auto xl:block"
    >
      <p className="text-eyebrow mb-3">En esta página</p>
      <List items={items} active={active} />
    </nav>
  )
}
