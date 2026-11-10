import type { Block, Section } from '@/lib/docs/types'
import { CodeBlock } from './CodeBlock'
import { Collapsible } from './Collapsible'

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((b, i) =>
    b.type === 'code' ? (
      <CodeBlock
        key={i}
        code={b.code}
        lang={b.lang || undefined}
        html={b.html}
      />
    ) : (
      // HTML generado en build desde Markdown del repo (HTML crudo escapado).
      <div
        key={i}
        className="doc-prose"
        dangerouslySetInnerHTML={{ __html: b.html }}
      />
    ),
  )
}

/**
 * Una sección del doc. La introducción va sin título; las secciones cortas, abiertas; las largas,
 * plegadas (`collapsible`, decidido en el build). "Ejemplo mínimo" nunca se pliega.
 */
export function DocSection({ section }: { section: Section }) {
  const { id, title, kind, collapsible, blocks } = section

  if (kind === 'intro' || !id || !title)
    return (
      <div className="flex flex-col gap-4">
        <Blocks blocks={blocks} />
      </div>
    )

  if (collapsible)
    return (
      <Collapsible title={title} headingId={id}>
        <Blocks blocks={blocks} />
      </Collapsible>
    )

  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-h3 scroll-mt-20 [overflow-wrap:anywhere]">
        {title}
        <a className="anchor" href={`#${id}`} aria-label={`Enlace a ${title}`}>
          #
        </a>
      </h2>
      <Blocks blocks={blocks} />
    </section>
  )
}
