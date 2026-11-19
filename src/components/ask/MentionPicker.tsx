// Menciones con `@` en el campo de /ask: opciones (sesiones, natives, issues), lista desplegable y
// chips. La lógica pura vive en `lib/ask/mentions.ts`; acá solo hay estado de pantalla.
import { Braces, CircleDot, MessagesSquare, X } from 'lucide-react'
import type { Mention, MentionKind } from '@/lib/ask/mentions'
import type { MessageKey } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { optionId } from './useMentionOptions'

const GROUPS: { kind: MentionKind; title: MessageKey }[] = [
  { kind: 'session', title: 'ask.mention.sessions' },
  { kind: 'native', title: 'ask.mention.natives' },
  { kind: 'issue', title: 'ask.mention.issues' },
]

const ICON = {
  session: MessagesSquare,
  native: Braces,
  issue: CircleDot,
} as const

/** Lista de opciones agrupada. Foco siempre en el campo: se navega con `aria-activedescendant`. */
export function MentionListbox({
  id,
  items,
  loading,
  empty,
  activeIndex,
  onPick,
}: {
  id: string
  items: readonly Mention[]
  loading: boolean
  empty: boolean
  activeIndex: number
  onPick: (m: Mention) => void
}) {
  const { tr } = useLang()
  return (
    <div className="bg-surface-overlay shadow-card absolute inset-x-0 bottom-full z-10 mb-2 max-h-72 overflow-y-auto rounded-lg p-1">
      <div id={id} role="listbox" aria-label={tr('ask.mention.listLabel')}>
        {GROUPS.map((g) => {
          const rows = items.filter((m) => m.kind === g.kind)
          if (!rows.length) return null
          return (
            <div key={g.kind} role="group" aria-label={tr(g.title)}>
              <p className="text-eyebrow px-3 pt-2 pb-1" aria-hidden="true">
                {tr(g.title)}
              </p>
              {rows.map((m) => {
                const Icon = ICON[m.kind]
                const selected = items[activeIndex]?.key === m.key
                return (
                  <div
                    key={m.key}
                    id={optionId(id, m.key)}
                    role="option"
                    aria-selected={selected}
                    // El campo no pierde el foco al tocar una opción.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPick(m)}
                    className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${
                      selected ? 'bg-surface-raised' : 'hover:bg-surface-raised'
                    }`}
                  >
                    <Icon
                      className={`size-4 shrink-0 ${selected ? 'text-accent' : 'text-ink-muted'}`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-label text-ink block truncate">
                        {m.kind === 'session' ? m.hint : m.label}
                      </span>
                      {m.kind !== 'session' && m.hint && (
                        <span className="text-caption text-ink-subtle block truncate">
                          {m.hint}
                        </span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      {!items.length && (
        <p
          className="text-caption text-ink-subtle px-3 py-3"
          role="status"
          aria-live="polite"
        >
          {loading
            ? tr('ask.mention.searching')
            : empty
              ? tr('ask.mention.empty')
              : ''}
        </p>
      )}
    </div>
  )
}

/** Lo adjunto a la próxima pregunta, con una X por chip. */
export function MentionChips({
  items,
  onRemove,
}: {
  items: readonly Mention[]
  onRemove: (key: string) => void
}) {
  const { tr } = useLang()
  if (!items.length) return null
  return (
    <ul
      aria-label={tr('ask.mention.attached')}
      className="flex flex-wrap gap-1 px-1 pt-1 pb-0.5"
    >
      {items.map((m) => {
        const Icon = ICON[m.kind]
        return (
          <li
            key={m.key}
            className="bg-surface-overlay text-label text-ink flex min-h-11 max-w-full items-center gap-2 rounded-md pl-3 md:min-h-8"
          >
            <Icon className="text-accent size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{m.label}</span>
            <button
              type="button"
              aria-label={tr('ask.mention.remove', { label: m.label })}
              onClick={() => onRemove(m.key)}
              className="text-ink-muted hover:text-ink grid size-11 shrink-0 place-items-center rounded-md md:size-8"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Lo que tenía adjunto una pregunta ya enviada: solo lectura. */
export function MentionTags({ items }: { items: readonly Mention[] }) {
  const { tr } = useLang()
  if (!items.length) return null
  return (
    <ul
      aria-label={tr('ask.mention.attached')}
      className="flex max-w-[85%] flex-wrap justify-end gap-1 self-end"
    >
      {items.map((m) => {
        const Icon = ICON[m.kind]
        return (
          <li
            key={m.key}
            className="bg-surface-sunken text-caption text-ink-muted flex min-h-6 max-w-full items-center gap-1.5 rounded-md px-2"
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{m.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
