import {
  BookOpen,
  CornerDownLeft,
  FileText,
  Hash,
  History,
  House,
  Milestone,
  Search,
  Sparkles,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tagLabel } from '@/config/tags'
import { docs } from '@/lib/docs'
import { usePageHeadings } from '@/lib/palette/headings'
import { registerPublicProviders } from '@/lib/palette/providers'
import { loadRecents, pushRecent, saveRecents } from '@/lib/palette/recent'
import {
  buildSections,
  getPaletteAccess,
  listPaletteProviders,
  runProviders,
} from '@/lib/palette/registry'
import type { PaletteIcon, PaletteItem } from '@/lib/palette/types'
import { Shortcut } from './Kbd'

registerPublicProviders()

const ICONS: Record<PaletteIcon, LucideIcon> = {
  home: House,
  docs: BookOpen,
  tools: Wrench,
  roadmap: Milestone,
  doc: FileText,
  heading: Hash,
  recent: History,
  sparkles: Sparkles,
}

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Modal sobre `<dialog>` nativo: foco atrapado, página de fondo inerte, Esc cierra y el foco
 * vuelve a quien lo abrió. El contenido se monta solo mientras está abierto (estado limpio).
 */
export function CommandPalette({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  // Tras elegir un destino el foco va al contenido; con Esc o el botón, vuelve a quien abrió.
  const toContent = useRef(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      toContent.current = false
      d.showModal()
    } else if (!open && d.open) {
      d.close() // el navegador devuelve el foco al elemento que tenía antes de abrir
      if (toContent.current)
        document.getElementById('main')?.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      data-palette=""
      aria-label="Buscar en Astra Dev"
      // Esc: se cierra por estado, no por el navegador, para que `open` siga siendo la verdad.
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // Esc repetido o cierre del navegador sin `cancel`.
      onClose={() => open && onClose()}
      // Un clic en el fondo cae sobre el propio `<dialog>` (el panel lo ocupa entero).
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="palette-dialog bg-surface-raised text-ink border-border shadow-card backdrop:bg-brand-dark/70 mx-auto mt-[10dvh] mb-auto max-h-[min(34rem,calc(100dvh-10dvh-1rem))] w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden rounded-lg border p-0 open:flex"
    >
      {open && (
        <Body onClose={onClose} onNavigate={() => (toContent.current = true)} />
      )}
    </dialog>
  )
}

interface View {
  /** Consulta a la que pertenecen los resultados. */
  query: string
  results: Map<string, PaletteItem[]>
  done: boolean
}

function Body({
  onClose,
  onNavigate,
}: {
  onClose: () => void
  onNavigate: () => void
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const headings = usePageHeadings()
  const listId = useId()
  const [recents] = useState(loadRecents)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [view, setView] = useState<View>({
    query: '',
    results: new Map(),
    done: false,
  })
  const [announced, setAnnounced] = useState('')

  useEffect(() => {
    const ctl = new AbortController()
    const results = new Map<string, PaletteItem[]>()
    void runProviders({
      providers: listPaletteProviders(),
      query,
      ctx: { docs, headings, pathname, recents },
      access: getPaletteAccess(),
      signal: ctl.signal,
      onResult: (id, items) => {
        results.set(id, items)
        setView({ query, results: new Map(results), done: false })
      },
    }).then(() => {
      if (!ctl.signal.aborted)
        setView({ query, results: new Map(results), done: true })
    })
    return () => ctl.abort()
  }, [query, headings, pathname, recents])

  const settled = view.done && view.query === query
  const sections = buildSections(listPaletteProviders(), view.results)
  const flat = sections.flatMap((s) => s.items)
  const current = Math.min(active, Math.max(flat.length - 1, 0))
  const optId = (i: number) => `${listId}-opt-${i}`

  // Mantiene visible la opción activa al moverse con el teclado.
  useEffect(() => {
    document.getElementById(`${listId}-opt-${current}`)?.scrollIntoView({
      block: 'nearest',
    })
  }, [current, listId, view])

  // Anuncia la cantidad de resultados con retraso, para no hablar en cada tecla.
  const message = !settled
    ? ''
    : flat.length === 0
      ? 'Sin resultados'
      : `${flat.length} ${flat.length === 1 ? 'resultado' : 'resultados'}`
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(message), 300)
    return () => clearTimeout(t)
  }, [message])

  const choose = (item: PaletteItem) => {
    if (item.to) saveRecents(pushRecent(recents, item))
    onClose()
    if (item.run) {
      item.run()
    } else if (item.to) {
      const [path, hash] = item.to.split('#')
      // Mismo documento: cambiar el hash dispara `hashchange` y abre la sección plegada (reveal.ts).
      if (hash && path === pathname) window.location.assign(`#${hash}`)
      else void navigate(item.to)
      onNavigate()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = flat.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(current >= last ? 0 : current + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(current <= 0 ? last : current - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(Math.max(last, 0))
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const item = flat[current]
      if (item) choose(item)
    }
  }

  const starts = sections.map((_, n) =>
    sections.slice(0, n).reduce((sum, x) => sum + x.items.length, 0),
  )
  return (
    <>
      <div className="flex shrink-0 items-center gap-1 p-2">
        {/* El anillo de foco rodea lupa y campo juntos, no solo el texto. */}
        <div className="has-[:focus-visible]:outline-focus flex min-w-0 flex-1 items-center gap-2 rounded-md pl-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2">
          <Search
            className="text-ink-subtle size-5 shrink-0"
            aria-hidden="true"
          />
          <input
            autoFocus
            type="text"
            role="combobox"
            aria-label="Buscar"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? optId(current) : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Busca documentos, secciones y páginas"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            className="text-body placeholder:text-ink-subtle text-ink h-12 min-w-0 flex-1 bg-transparent outline-none"
          />
        </div>
        <button
          type="button"
          aria-label="Cerrar búsqueda"
          onClick={onClose}
          className="text-ink-muted hover:bg-surface-overlay hover:text-ink grid size-11 shrink-0 place-items-center rounded-md"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {sections.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Resultados"
            className="flex flex-col gap-2"
          >
            {sections.map((s, n) => (
              <li key={s.id} role="presentation">
                <ul role="group" aria-labelledby={`${listId}-${s.id}`}>
                  <li
                    role="presentation"
                    id={`${listId}-${s.id}`}
                    className="text-eyebrow px-3 pt-2 pb-1"
                  >
                    {s.label}
                  </li>
                  {s.items.map((item, k) => {
                    const i = (starts[n] ?? 0) + k
                    return (
                      <Option
                        key={item.id}
                        id={optId(i)}
                        item={item}
                        selected={i === current}
                        onHover={() => i !== current && setActive(i)}
                        onChoose={() => choose(item)}
                      />
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {settled && flat.length === 0 && (
          <div className="px-3 py-8 text-center">
            <p className="text-body text-ink">
              Sin resultados para «{query.trim()}».
            </p>
            <p className="text-body-sm text-ink-muted mt-1">
              Prueba con otro término o con una parte del nombre.
            </p>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announced}
      </p>

      <div className="text-body-sm text-ink-muted hidden shrink-0 items-center gap-4 px-4 py-2 pointer-fine:flex">
        <span className="inline-flex items-center gap-2">
          <Shortcut keys={['↑', '↓']} label="Flechas arriba y abajo" /> navegar
        </span>
        <span className="inline-flex items-center gap-2">
          <Shortcut keys={['Inicio', 'Fin']} label="Inicio y Fin" /> extremos
        </span>
        <span className="inline-flex items-center gap-2">
          <CornerDownLeft className="size-4" aria-hidden="true" />
          <span className="sr-only">Intro</span> abrir
        </span>
        <span className="inline-flex items-center gap-2">
          <Shortcut keys={['Esc']} label="Esc" /> cerrar
        </span>
      </div>
    </>
  )
}

function Option({
  id,
  item,
  selected,
  onHover,
  onChoose,
}: {
  id: string
  item: PaletteItem
  selected: boolean
  onHover: () => void
  onChoose: () => void
}) {
  const Icon = ICONS[item.icon]
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      onPointerMove={onHover}
      // `mousedown` no mueve el foco del campo: el combobox mantiene el foco mientras se elige.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onChoose}
      className={[
        'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2',
        selected ? 'bg-surface-overlay text-ink' : 'text-ink-muted',
      ].join(' ')}
    >
      <Icon
        className={['size-5 shrink-0', selected ? 'text-accent' : ''].join(' ')}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="text-label text-ink block truncate">{item.title}</span>
        {item.subtitle && (
          <span className="text-body-sm text-ink-muted block truncate">
            {item.subtitle}
          </span>
        )}
      </span>
      {item.tags && item.tags.length > 0 && (
        <span className="flex shrink-0 gap-1" role="group" aria-label="Tags">
          {item.tags.map((t) => (
            <span
              key={t}
              className="text-data text-ink-muted bg-surface-sunken rounded-sm px-2 py-1 whitespace-nowrap uppercase"
            >
              {tagLabel(t)}
            </span>
          ))}
        </span>
      )}
    </li>
  )
}
