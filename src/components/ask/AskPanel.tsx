import { Maximize2, SquarePen, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { orbState } from '@/lib/ask/orb-state'
import { askStore } from '@/lib/ask/store'
import { useLang } from '@/lib/use-lang'
import { Composer, Transcript } from './Conversation'
import { isTurnBusy, turnStatusText } from '@/lib/ask/status'
import { EtherOrb } from './EtherOrb'
import { useAsk } from './useAsk'
import { useAskPrefs } from './useAskPrefs'

/**
 * Panel del chat: `<dialog>` modal anclado a la derecha (foco atrapado, fondo inerte, Esc cierra).
 * La conversación vive en `askStore`, así que cerrarlo no la pierde ni corta una respuesta en curso.
 */
export function AskPanel() {
  const { open } = useAsk()
  const { prefs } = useAskPrefs()
  const { tr } = useLang()
  const ref = useRef<HTMLDialogElement>(null)
  // Tras seguir una cita el foco va al contenido; con Esc o el botón, vuelve a quien abrió.
  const toContent = useRef(false)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      toContent.current = false
      d.showModal()
    } else if (!open && d.open) {
      d.close()
      if (toContent.current)
        document.getElementById('main')?.focus({ preventScroll: true })
    }
  }, [open])

  // Clic en el fondo: cae sobre el propio `<dialog>` (el panel ocupa todo el elemento).
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === d) askStore.close()
    }
    d.addEventListener('click', onBackdrop)
    return () => d.removeEventListener('click', onBackdrop)
  }, [])

  return (
    <dialog
      ref={ref}
      data-palette=""
      data-chat-accent={prefs.accent}
      aria-label={tr('ask.name')}
      onCancel={(e) => {
        e.preventDefault()
        askStore.close()
      }}
      onClose={() => askStore.close()}
      className="ask-dialog bg-surface-raised text-ink border-border shadow-card backdrop:bg-brand-dark/70 mt-2 mr-2 mb-2 ml-auto h-[calc(100dvh-1rem)] max-h-none w-[calc(100%-1rem)] max-w-md flex-col overflow-hidden rounded-lg border p-0 open:flex"
    >
      {open && <Body onNavigate={() => (toContent.current = true)} />}
    </dialog>
  )
}

function Body({ onNavigate }: { onNavigate: () => void }) {
  const { turns, viewerRole } = useAsk()
  const { tr } = useLang()
  const busy = isTurnBusy(turns)
  const last = turns.at(-1)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Sigue el final del chat mientras llega texto, salvo que la persona haya subido a leer.
  const stick = useRef(true)

  useEffect(() => {
    inputRef.current?.focus()
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const tail = `${turns.length}:${last?.text.length ?? 0}:${last?.status ?? ''}`
  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [tail])

  return (
    <>
      <header className="flex shrink-0 items-center gap-1 p-2 pl-4">
        <EtherOrb className="shrink-0" state={orbState(last?.status)} />
        <h2 className="text-label min-w-0 flex-1 truncate">{tr('ask.name')}</h2>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              askStore.reset()
              inputRef.current?.focus()
            }}
            aria-label={tr('ask.newChat')}
            title={tr('ask.newChat')}
            className="text-ink-muted hover:bg-surface-overlay hover:text-ink grid size-11 shrink-0 place-items-center rounded-md"
          >
            <SquarePen className="size-5" aria-hidden="true" />
          </button>
        )}
        <Link
          to="/ask"
          onClick={() => {
            onNavigate()
            askStore.close()
          }}
          aria-label={tr('ask.page.open')}
          title={tr('ask.page.open')}
          className="text-ink-muted hover:bg-surface-overlay hover:text-ink grid size-11 shrink-0 place-items-center rounded-md"
        >
          <Maximize2 className="size-5" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={() => askStore.close()}
          aria-label={tr('ask.close')}
          className="text-ink-muted hover:bg-surface-overlay hover:text-ink grid size-11 shrink-0 place-items-center rounded-md"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
        aria-busy={busy}
      >
        <Transcript
          turns={turns}
          viewerRole={viewerRole}
          onNavigate={() => {
            onNavigate()
            askStore.close()
          }}
        />
      </div>

      <p role="status" className="sr-only">
        {turnStatusText(last, tr)}
      </p>

      <div className="shrink-0 p-3">
        <Composer
          inputRef={inputRef}
          onSubmit={() => {
            stick.current = true
          }}
        />
      </div>
    </>
  )
}
