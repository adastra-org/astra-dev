import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

interface Props {
  code: string
  /** Lenguaje, como etiqueta. */
  lang?: string
  /** HTML ya resaltado del interior de `<code>` (lo genera el build). Sin él, texto plano. */
  html?: string
  /** Sin borde propio: el bloque vive dentro de un contenedor que ya lo tiene (un borde por nivel). */
  bare?: boolean
}

export function CodeBlock({ code, lang, html, bare = false }: Props) {
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
    <figure
      className={[
        'code-fig bg-surface-sunken max-w-3xl min-w-0 overflow-hidden rounded-md',
        bare ? '' : 'border-border border',
      ].join(' ')}
    >
      <figcaption className="flex min-h-11 items-center justify-between px-4">
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
        {html === undefined ? (
          <code>{code}</code>
        ) : (
          <code dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </pre>
      <span className="sr-only" role="status">
        {copied ? 'Código copiado al portapapeles' : ''}
      </span>
    </figure>
  )
}
