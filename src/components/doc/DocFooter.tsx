import { GitCommitHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { REPO_URL } from '@/lib/docs'
import type { DocMeta, History } from '@/lib/docs/types'
import { Collapsible } from './Collapsible'

/** Lista de docs enlazados con su resumen. */
function DocLinks({ docs }: { docs: DocMeta[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {docs.map((d) => (
        <li key={d.slug}>
          <Link
            to={`/docs/${d.slug}`}
            className="text-label text-accent hover:text-ink inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-8"
          >
            {d.title}
          </Link>
          <p className="text-body-sm text-ink-muted">{d.summary}</p>
        </li>
      ))}
    </ul>
  )
}

/** Referencias cruzadas: `related` del frontmatter y backlinks calculados en el build. */
export function DocRelations({
  related,
  backlinks,
}: {
  related: DocMeta[]
  backlinks: DocMeta[]
}) {
  if (!related.length && !backlinks.length) return null
  return (
    <div className="flex max-w-prose flex-col gap-6">
      {related.length > 0 && (
        <section aria-labelledby="relacionados" className="flex flex-col gap-2">
          <h2 id="relacionados" className="text-h4">
            Relacionados
          </h2>
          <DocLinks docs={related} />
        </section>
      )}
      {backlinks.length > 0 && (
        <section aria-labelledby="usada-por" className="flex flex-col gap-2">
          <h2 id="usada-por" className="text-h4">
            Usada por
          </h2>
          <DocLinks docs={backlinks} />
        </section>
      )}
    </div>
  )
}

/** Historial de cambios del archivo (git log en el build). Plegado: es consulta, no lectura. */
export function DocHistory({
  history,
  path,
}: {
  history: History
  path: string
}) {
  const { available, entries } = history
  return (
    <Collapsible
      title={`Historial de cambios${entries.length ? ` (${entries.length})` : ''}`}
    >
      {!available ? (
        <p className="text-body-sm">
          El historial no está disponible en este build: no hay git o el clon es
          superficial.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-body-sm">Este archivo todavía no tiene commits.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.sha} className="flex flex-col gap-1">
              <span className="text-data text-ink-subtle flex flex-wrap items-center gap-x-3">
                <time dateTime={e.date}>{e.date}</time>
                <a
                  href={`${REPO_URL}/commit/${e.sha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-ink inline-flex items-center gap-1 underline underline-offset-4"
                >
                  <GitCommitHorizontal className="size-4" aria-hidden="true" />
                  {e.sha}
                </a>
              </span>
              <span className="text-body-sm text-ink [text-wrap:pretty]">
                {e.subject}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="text-body-sm">
        <a
          href={`${REPO_URL}/blob/main/${path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:text-ink underline underline-offset-4"
        >
          Ver el archivo en GitHub
        </a>
      </p>
    </Collapsible>
  )
}
