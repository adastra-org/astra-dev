import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLang } from '@/lib/use-lang'

/** Resumen "qué es / cuándo usarlo", siempre arriba de una página de docs. */
export function Summary({ children }: { children: ReactNode }) {
  const { tr } = useLang()
  return (
    <section
      aria-labelledby="resumen"
      className="doc-summary bg-surface-raised border-accent max-w-prose rounded-md border p-4"
    >
      <h2
        id="resumen"
        className="text-label text-ink mb-2 flex items-center gap-2"
      >
        <Info className="text-accent size-4" aria-hidden="true" />
        {tr('summary.title')}
      </h2>
      <div className="text-body text-ink-muted [text-wrap:pretty]">
        {children}
      </div>
    </section>
  )
}
