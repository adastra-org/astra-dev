import { GitCommitHorizontal } from 'lucide-react'
import { Link } from 'react-router-dom'
import { REPO_URL } from '@/lib/docs'
import type { DocMeta, History } from '@/lib/docs/types'
import { displayDoc } from '@/lib/docs-query'
import { useLang } from '@/lib/use-lang'
import { Collapsible } from './Collapsible'

/** Lista de docs enlazados con su resumen. */
function DocLinks({ docs }: { docs: DocMeta[] }) {
  const { lang } = useLang()
  return (
    <ul className="flex flex-col gap-3">
      {docs.map((d) => {
        const shown = displayDoc(d, lang)
        return (
          <li key={d.slug}>
            <Link
              to={`/docs/${d.slug}`}
              className="text-label text-accent hover:text-ink inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-8"
            >
              {shown.title}
            </Link>
            <p className="text-body-sm text-ink-muted">{shown.summary}</p>
          </li>
        )
      })}
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
  const { tr } = useLang()
  if (!related.length && !backlinks.length) return null
  return (
    <div className="flex max-w-prose flex-col gap-6">
      {related.length > 0 && (
        <section aria-labelledby="relacionados" className="flex flex-col gap-2">
          <h2 id="relacionados" className="text-h4">
            {tr('doc.related')}
          </h2>
          <DocLinks docs={related} />
        </section>
      )}
      {backlinks.length > 0 && (
        <section aria-labelledby="usada-por" className="flex flex-col gap-2">
          <h2 id="usada-por" className="text-h4">
            {tr('doc.usedBy')}
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
  const { tr } = useLang()
  return (
    <Collapsible
      title={
        entries.length
          ? tr('doc.historyCount', { n: entries.length })
          : tr('doc.history')
      }
    >
      {!available ? (
        <p className="text-body-sm">{tr('doc.historyUnavailable')}</p>
      ) : entries.length === 0 ? (
        <p className="text-body-sm">{tr('doc.historyEmpty')}</p>
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
          {tr('doc.viewOnGithub')}
        </a>
      </p>
    </Collapsible>
  )
}
