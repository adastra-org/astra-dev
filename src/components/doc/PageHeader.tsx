import type { ReactNode } from 'react'

interface Props {
  eyebrow: string
  title: string
  /** Resumen de una o dos líneas: va primero, antes de cualquier detalle. */
  lead: ReactNode
}

export function PageHeader({ eyebrow, title, lead }: Props) {
  return (
    <header className="mb-8 max-w-prose">
      <p className="text-eyebrow mb-3">{eyebrow}</p>
      <h1 className="text-h1 mb-4">{title}</h1>
      <p className="text-body-lg text-ink-muted">{lead}</p>
    </header>
  )
}
