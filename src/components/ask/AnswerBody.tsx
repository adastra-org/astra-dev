import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CodeBlock } from '@/components/doc/CodeBlock'
import { parseAnswer, type Block, type Inline } from '@/lib/ask/markdown'
import { isLinkable } from '@/lib/ask/sources'
import type { AskSource } from '@/lib/ask/types'

interface Props {
  text: string
  sources: readonly AskSource[]
  /** Se llamó a un enlace de cita: el panel se cierra y el foco va al contenido. */
  onNavigate: () => void
}

/**
 * Respuesta del modelo como nodos de React: sin HTML crudo, imágenes ni enlaces del modelo
 * (`lib/ask/markdown.ts`). Las citas `[n]` enlazan a las fuentes del server.
 */
export function AnswerBody({ text, sources, onNavigate }: Props) {
  const blocks = parseAnswer(text, sources.length)
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {blocks.map((b, i) => (
        <BlockView
          key={i}
          block={b}
          sources={sources}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

function BlockView({
  block,
  sources,
  onNavigate,
}: {
  block: Block
  sources: readonly AskSource[]
  onNavigate: () => void
}): ReactNode {
  switch (block.kind) {
    case 'p':
      return (
        <p className="text-body text-ink">
          <Inlines
            items={block.children}
            sources={sources}
            onNavigate={onNavigate}
          />
        </p>
      )
    case 'code':
      return <CodeBlock code={block.text} lang={block.lang || undefined} bare />
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag
          className={[
            'text-body text-ink flex flex-col gap-1 pl-5',
            block.ordered ? 'list-decimal' : 'list-disc',
          ].join(' ')}
        >
          {block.items.map((item, i) => (
            <li key={i} className="pl-1">
              {item.map((b, j) => (
                <Fragment key={j}>
                  {b.kind === 'p' ? (
                    <Inlines
                      items={b.children}
                      sources={sources}
                      onNavigate={onNavigate}
                    />
                  ) : (
                    <BlockView
                      block={b}
                      sources={sources}
                      onNavigate={onNavigate}
                    />
                  )}
                </Fragment>
              ))}
            </li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <div
          className="bg-surface-sunken max-w-full overflow-x-auto rounded-md"
          tabIndex={0}
        >
          <table className="text-body-sm w-full border-collapse text-left">
            <thead>
              <tr>
                {block.head.map((c, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="text-label text-ink px-3 py-2 align-top"
                  >
                    <Inlines
                      items={c}
                      sources={sources}
                      onNavigate={onNavigate}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="text-ink-muted px-3 py-2 align-top">
                      <Inlines
                        items={c}
                        sources={sources}
                        onNavigate={onNavigate}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'quote':
      return (
        <div className="bg-surface-sunken text-ink-muted flex flex-col gap-2 rounded-md px-4 py-2">
          {block.children.map((b, i) => (
            <BlockView
              key={i}
              block={b}
              sources={sources}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )
  }
}

function Inlines({
  items,
  sources,
  onNavigate,
}: {
  items: readonly Inline[]
  sources: readonly AskSource[]
  onNavigate: () => void
}) {
  return items.map((it, i) => {
    switch (it.kind) {
      case 'text':
        return <Fragment key={i}>{it.text}</Fragment>
      case 'code':
        return (
          <code
            key={i}
            className={[
              'text-code bg-surface-sunken rounded-sm px-1.5 py-0.5',
              // Solo un token largo y sin espacios puede partirse (DESIGN.md, "Wrapping").
              it.text.length > 36 && !/s/.test(it.text)
                ? '[overflow-wrap:anywhere]'
                : 'whitespace-nowrap',
            ].join(' ')}
          >
            {it.text}
          </code>
        )
      case 'strong':
        return (
          <strong key={i} className="font-semibold">
            <Inlines
              items={it.children}
              sources={sources}
              onNavigate={onNavigate}
            />
          </strong>
        )
      case 'em':
        return (
          <em key={i}>
            <Inlines
              items={it.children}
              sources={sources}
              onNavigate={onNavigate}
            />
          </em>
        )
      case 'br':
        return <br key={i} />
      case 'cite':
        return (
          <Cite
            key={i}
            source={sources[it.n - 1]}
            n={it.n}
            onNavigate={onNavigate}
          />
        )
    }
  })
}

const CITE =
  'text-data text-ink-muted bg-surface-sunken mx-0.5 inline-grid h-6 min-w-6 place-items-center rounded-sm px-1.5 align-baseline'

function Cite({
  source,
  n,
  onNavigate,
}: {
  source: AskSource | undefined
  n: number
  onNavigate: () => void
}) {
  if (!source) return <span className={CITE}>{n}</span>
  const label = `Fuente ${n}: ${source.title}`
  if (!isLinkable(source))
    return (
      <span className={CITE} title={label} role="img" aria-label={label}>
        {n}
      </span>
    )
  return (
    <Link
      to={source.path}
      onClick={onNavigate}
      aria-label={label}
      title={label}
      className={`${CITE} hover:bg-surface-overlay hover:text-ink`}
    >
      {n}
    </Link>
  )
}
