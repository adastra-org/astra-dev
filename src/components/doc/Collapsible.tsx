import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}

/** Sección colapsable nativa (`details`): teclado y lector de pantalla sin código extra. */
export function Collapsible({ title, children, defaultOpen = false }: Props) {
  return (
    <details
      open={defaultOpen}
      className="group bg-surface-raised border-border max-w-prose rounded-md border"
    >
      <summary className="text-label flex min-h-11 list-none items-center justify-between gap-3 px-4 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          className="text-ink-subtle size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="border-border text-body text-ink-muted border-t px-4 py-4">
        {children}
      </div>
    </details>
  )
}
