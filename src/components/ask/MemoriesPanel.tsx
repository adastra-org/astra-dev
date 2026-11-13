import { Pencil, Plus, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  MEMORIES_KEY,
  MEMORY_AUTO_KEY,
  MEMORIES_MAX_ITEMS,
  MEMORIES_MAX_TOTAL,
  MEMORY_MAX_CHARS,
  memoryStore,
  type Memory,
  type MemoryFailure,
  type MemoryResult,
} from '@/lib/ask/memories'
import { useLang } from '@/lib/use-lang'
import { useMemories } from './useMemories'

const BTN =
  'text-ink-muted hover:bg-surface-overlay hover:text-ink inline-flex size-11 shrink-0 items-center justify-center rounded-md md:size-8'

/**
 * Memorias del usuario: frases cortas que se mandan con cada pregunta. Viven solo en este
 * navegador (localStorage); si el navegador no deja guardar, siguen en memoria y se avisa.
 */
export function MemoriesPanel() {
  const { tr } = useLang()
  const { items, persisted, removed, auto } = useMemories()
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const newRef = useRef<HTMLInputElement>(null)
  const restore = useRef<string | null>(null)

  // Otra pestaña cambió las memorias.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === MEMORIES_KEY || e.key === MEMORY_AUTO_KEY)
        memoryStore.reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Devuelve el foco al botón Editar tras guardar o cancelar.
  useEffect(() => {
    if (editing === null && restore.current) {
      document
        .querySelector<HTMLElement>(`[data-edit="${restore.current}"]`)
        ?.focus()
      restore.current = null
    }
  }, [editing])

  const fail = (reason: MemoryFailure) => {
    setSaved(false)
    setError(
      tr(`ask.memories.err.${reason}`, {
        n:
          reason === 'too_long'
            ? MEMORY_MAX_CHARS
            : reason === 'max_items'
              ? MEMORIES_MAX_ITEMS
              : MEMORIES_MAX_TOTAL,
      }),
    )
  }
  const handle = (r: MemoryResult, onOk?: () => void) => {
    if (r.ok) {
      setError(null)
      onOk?.()
    } else fail(r.reason)
    return r.ok
  }

  const activeCount = items.filter((m) => m.enabled).length

  const startEdit = (m: Memory) => {
    setError(null)
    setSaved(false)
    setEditing(m.id)
    setEditText(m.text)
  }
  const finishEdit = (id: string) => {
    restore.current = id
    setEditing(null)
  }

  return (
    <section
      aria-labelledby="ask-memories-title"
      className="flex flex-col gap-2"
    >
      <h2 id="ask-memories-title" className="text-eyebrow">
        {tr('ask.memories.title')}
      </h2>
      <p className="text-body-sm text-ink-muted">{tr('ask.memories.lead')}</p>

      {!persisted && (
        <p role="status" className="text-body-sm flex gap-2">
          <TriangleAlert
            className="text-warning mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="text-ink">{tr('ask.memories.unsaved')}</span>
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-body-sm text-ink-muted">
          {tr('ask.memories.empty')}
        </p>
      ) : (
        <>
          <p className="text-caption text-ink-subtle tabular-nums">
            {tr('ask.memories.count', {
              active: activeCount,
              total: items.length,
            })}
          </p>
          <ul className="flex flex-col gap-1">
            {items.map((m) => (
              <li key={m.id} className="flex items-start gap-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={m.enabled}
                  aria-label={tr('ask.memories.toggle', { text: m.text })}
                  onClick={() => handle(memoryStore.toggle(m.id))}
                  className="inline-flex size-11 shrink-0 items-center justify-center md:size-8"
                >
                  <span
                    aria-hidden="true"
                    className={`${m.enabled ? 'bg-accent-fill' : 'bg-surface-sunken'} border-border relative block h-5 w-9 rounded-pill border`}
                  >
                    <span
                      className={`${m.enabled ? 'bg-on-accent translate-x-4' : 'bg-ink-subtle translate-x-0.5'} absolute top-0.5 block size-3.5 rounded-pill`}
                    />
                  </span>
                </button>

                {editing === m.id ? (
                  <form
                    className="flex min-w-0 flex-1 flex-col gap-1"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handle(memoryStore.edit(m.id, editText), () => {
                        setSaved(true)
                        finishEdit(m.id)
                      })
                    }}
                  >
                    <input
                      type="text"
                      autoFocus
                      value={editText}
                      maxLength={MEMORY_MAX_CHARS}
                      aria-label={tr('ask.memories.editLabel')}
                      aria-invalid={error !== null}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setError(null)
                          finishEdit(m.id)
                        }
                      }}
                      className="text-body text-ink bg-surface-sunken focus-visible:outline-focus min-h-11 w-full rounded-md px-2 outline-offset-0 focus-visible:outline-2 md:min-h-8"
                    />
                    <div className="flex gap-1">
                      <button
                        type="submit"
                        className="text-label bg-accent-fill text-on-accent hover:bg-accent-fill-hover min-h-11 rounded-md px-3 md:min-h-8"
                      >
                        {tr('ask.memories.save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null)
                          finishEdit(m.id)
                        }}
                        className="text-label text-ink-muted hover:bg-surface-overlay hover:text-ink min-h-11 rounded-md px-3 md:min-h-8"
                      >
                        {tr('ask.memories.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <p
                      className={`text-body-sm min-w-0 flex-1 py-2.5 break-words md:py-1.5 ${m.enabled ? 'text-ink' : 'text-ink-subtle'}`}
                    >
                      {m.text}
                      {m.source === 'model' && (
                        <span
                          title={tr('ask.memories.byEtherHint')}
                          aria-label={tr('ask.memories.byEtherHint')}
                          className="text-caption text-ink-subtle border-border rounded-pill ml-2 inline-block border px-1.5 align-middle"
                        >
                          {tr('ask.memories.byEther')}
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      data-edit={m.id}
                      aria-label={`${tr('ask.memories.edit')}: ${m.text}`}
                      onClick={() => startEdit(m)}
                      className={BTN}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={`${tr('ask.memories.delete')}: ${m.text}`}
                      onClick={() =>
                        handle(memoryStore.remove(m.id), () => {
                          setSaved(false)
                          newRef.current?.focus()
                        })
                      }
                      className={BTN}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <form
        className="flex flex-col gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          handle(memoryStore.add(draft), () => {
            setDraft('')
            setSaved(true)
            newRef.current?.focus()
          })
        }}
      >
        <div className="flex flex-col gap-1">
          <input
            ref={newRef}
            type="text"
            value={draft}
            maxLength={MEMORY_MAX_CHARS}
            aria-label={tr('ask.memories.newLabel')}
            aria-invalid={error !== null && editing === null}
            placeholder={tr('ask.memories.placeholder')}
            enterKeyHint="done"
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            className="text-body text-ink bg-surface-sunken placeholder:text-ink-subtle focus-visible:outline-focus min-h-11 w-full rounded-md px-2 outline-offset-0 focus-visible:outline-2 md:min-h-8"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="text-label text-ink bg-surface-raised hover:bg-surface-overlay inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-3 disabled:opacity-50 md:min-h-8"
          >
            <Plus className="size-4" aria-hidden="true" />
            {tr('ask.memories.add')}
          </button>
        </div>
        {draft.length > MEMORY_MAX_CHARS * 0.8 && (
          <p className="text-caption text-ink-subtle tabular-nums">
            {tr('ask.memories.chars', {
              n: draft.length,
              max: MEMORY_MAX_CHARS,
            })}
          </p>
        )}
      </form>

      <div className="flex items-start gap-1">
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          aria-labelledby="ask-memories-auto"
          aria-describedby="ask-memories-auto-hint"
          onClick={() => memoryStore.setAuto(!auto)}
          className="inline-flex size-11 shrink-0 items-center justify-center md:size-8"
        >
          <span
            aria-hidden="true"
            className={`${auto ? 'bg-accent-fill' : 'bg-surface-sunken'} border-border relative block h-5 w-9 rounded-pill border`}
          >
            <span
              className={`${auto ? 'bg-on-accent translate-x-4' : 'bg-ink-subtle translate-x-0.5'} absolute top-0.5 block size-3.5 rounded-pill`}
            />
          </span>
        </button>
        <div className="min-w-0 flex-1 py-2.5 md:py-1.5">
          <p id="ask-memories-auto" className="text-body-sm text-ink">
            {tr('ask.memories.auto')}
          </p>
          <p
            id="ask-memories-auto-hint"
            className="text-caption text-ink-subtle"
          >
            {tr('ask.memories.autoHint')}
          </p>
        </div>
      </div>

      <div role="status" className="flex flex-col gap-1">
        {error && (
          <p className="text-body-sm text-ink flex gap-2">
            <TriangleAlert
              className="text-danger mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </p>
        )}
        {!error && saved && (
          <p className="text-body-sm text-ink-muted">
            {tr('ask.memories.saved')}
          </p>
        )}
        {removed && (
          <p className="text-body-sm text-ink-muted flex flex-wrap items-center gap-2">
            {tr('ask.memories.deleted')}
            <button
              type="button"
              onClick={() => handle(memoryStore.undoRemove())}
              className="text-label text-ink hover:bg-surface-overlay inline-flex min-h-11 items-center gap-1 rounded-md px-2 md:min-h-8"
            >
              <Undo2 className="size-4" aria-hidden="true" />
              {tr('ask.memories.undo')}
            </button>
          </p>
        )}
      </div>
    </section>
  )
}
