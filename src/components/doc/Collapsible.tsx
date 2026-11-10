import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  /** Si se pasa, el título es un `h2` con este id (sección de un doc, enlazable desde el índice). */
  headingId?: string
}

/** Sección colapsable nativa (`details`): teclado y lector de pantalla sin código extra. */
export function Collapsible({
  title,
  children,
  defaultOpen = false,
  headingId,
}: Props) {
  return (
    <details
      open={defaultOpen}
      className="group bg-surface-raised border-border max-w-prose rounded-md border"
    >
      <summary className="text-label flex min-h-11 list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
        {headingId ? (
          <h2 id={headingId} className="text-h4 scroll-mt-20 py-2">
            {title}
          </h2>
        ) : (
          title
        )}
        <ChevronDown
          className="text-ink-subtle size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="border-border text-body text-ink-muted flex flex-col gap-4 border-t px-4 py-4">
        {children}
      </div>
    </details>
  )
}
