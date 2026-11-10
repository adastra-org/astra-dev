import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

interface Props {
  code: string
  /** Lenguaje, solo como etiqueta (el resaltado llega con M1). */
  lang?: string
}

export function CodeBlock({ code, lang }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Sin permiso de portapapeles: el texto sigue seleccionable.
    }
  }

  return (
    <figure className="bg-surface-sunken border-border max-w-3xl overflow-hidden rounded-md border">
      <figcaption className="border-border flex min-h-11 items-center justify-between border-b px-4">
        <span className="text-data text-ink-subtle uppercase">
          {lang ?? 'texto'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="text-label text-ink-muted hover:bg-surface-raised hover:text-ink -mr-2 flex min-h-11 items-center gap-2 rounded-md px-3 md:min-h-8"
        >
          {copied ? (
            <Check className="text-success size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </figcaption>
      <pre className="text-code text-ink overflow-x-auto p-4" tabIndex={0}>
        <code>{code}</code>
      </pre>
      <span className="sr-only" role="status">
        {copied ? 'Código copiado al portapapeles' : ''}
      </span>
    </figure>
  )
}
