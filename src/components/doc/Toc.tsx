import { useEffect, useState } from 'react'
import type { TocItem } from '@/lib/docs/types'

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

/**
 * Lista del índice. Altura y estructura fijas: abrir una sección no agrega ni quita filas, solo
 * cambia el fondo y el color del ítem activo. Sin borde lateral (DESIGN.md, "Bordes").
 */
function List({ items, active }: { items: TocItem[]; active?: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((i) => (
        <li key={i.id}>
          <a
            href={`#${i.id}`}
            aria-current={active === i.id ? 'location' : undefined}
            className={[
              'text-body-sm flex min-h-8 items-center rounded-md px-3 py-1 transition-colors duration-(--duration-fast)',
              i.depth === 3 ? 'pl-6' : '',
              active === i.id
                ? 'bg-surface-raised text-ink'
                : 'text-ink-muted hover:text-ink',
            ].join(' ')}
          >
            {i.title}
          </a>
        </li>
      ))}
    </ul>
  )
}

/**
 * Índice para menos de `xl`: una fila de chips que se desplaza en horizontal, siempre de la
 * misma altura. Antes era un desplegable que crecía y empujaba el contenido al abrirlo.
 * Se omite con menos de tres entradas.
 */
export function TocInline({ items }: { items: TocItem[] }) {
  if (items.length < 3) return null
  return (
    <nav aria-label="En esta página" className="xl:hidden">
      <p className="text-eyebrow mb-2">En esta página</p>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] md:mx-0 md:px-0">
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              className="text-body-sm text-ink-muted bg-surface-raised hover:text-ink flex min-h-11 items-center rounded-md px-3 whitespace-nowrap"
            >
              {i.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Índice fijo a la derecha desde `xl`, con el ítem visible resaltado. */
export function TocSide({ items }: { items: TocItem[] }) {
  const active = useActiveId(items)
  if (items.length < 3) return null
  return (
    <nav
      aria-label="En esta página"
      className="sticky top-20 hidden max-h-[calc(100svh-6rem)] self-start overflow-y-auto xl:block"
    >
      <p className="text-eyebrow mb-3 px-3">En esta página</p>
      <List items={items} active={active} />
    </nav>
  )
}
