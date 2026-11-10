import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

/** Resumen "qué es / cuándo usarlo", siempre arriba de una página de docs. */
export function Summary({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="resumen"
      className="bg-surface-raised border-border border-l-accent max-w-prose rounded-md border border-l-4 p-4"
    >
      <h2
        id="resumen"
        className="text-label text-ink mb-2 flex items-center gap-2"
      >
        <Info className="text-accent size-4" aria-hidden="true" />
        Resumen
      </h2>
      <div className="text-body text-ink-muted">{children}</div>
    </section>
  )
}
