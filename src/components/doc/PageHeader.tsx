import type { ReactNode } from 'react'

interface Props {
  eyebrow: string
  title: string
  /** Resumen de una o dos líneas: va primero, antes de cualquier detalle. */
  lead?: ReactNode
  /** Datos secundarios bajo el título (tags, versión). */
  children?: ReactNode
}

export function PageHeader({ eyebrow, title, lead, children }: Props) {
  return (
    <header className="mb-8 max-w-prose">
      <p className="text-eyebrow mb-3">{eyebrow}</p>
      <h1 className="text-h1 mb-4 [overflow-wrap:anywhere]">{title}</h1>
      {lead && <p className="text-body-lg text-ink-muted">{lead}</p>}
      {children}
    </header>
  )
}
