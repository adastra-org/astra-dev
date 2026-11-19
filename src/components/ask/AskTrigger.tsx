import { askStore } from '@/lib/ask/store'
import { useLang } from '@/lib/use-lang'
import { EtherOrb } from './EtherOrb'

/**
 * Entrada del chat en la barra superior. Bajo `md` es solo el icono (44 px); desde `md` lleva la
 * etiqueta. Visible para todos: quien no tiene acceso ve en el panel por qué.
 */
export function AskTrigger() {
  const { tr } = useLang()
  return (
    <button
      type="button"
      onClick={() => askStore.open()}
      aria-haspopup="dialog"
      aria-label={tr('ask.trigger')}
      className="text-ink-muted bg-surface-raised hover:bg-surface-overlay hover:text-ink rounded-pill flex size-11 shrink-0 items-center justify-center gap-2 md:w-auto md:px-4 lg:h-10"
    >
      <EtherOrb className="shrink-0" />
      <span className="text-body-sm hidden md:inline">{tr('ask.trigger')}</span>
    </button>
  )
}
