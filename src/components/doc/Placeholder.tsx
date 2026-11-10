import { Construction } from 'lucide-react'
import type { ReactNode } from 'react'

/** Aviso de sección sin contenido todavía. Dice qué llega y en qué milestone. */
export function Placeholder({
  milestone,
  children,
}: {
  milestone: string
  children: ReactNode
}) {
  return (
    <div className="border-border-strong text-ink-muted flex max-w-prose items-start gap-3 rounded-md border border-dashed p-4">
      <Construction
        className="text-ink-subtle mt-0.5 size-5 shrink-0"
        aria-hidden="true"
      />
      <p className="text-body-sm">
        <span className="text-data text-ink-subtle mr-2 uppercase">
          {milestone}
        </span>
        {children}
      </p>
    </div>
  )
}
