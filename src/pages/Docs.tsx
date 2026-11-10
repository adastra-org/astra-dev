import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/doc/PageHeader'
import { TagList } from '@/components/doc/TagList'
import { tagLabel } from '@/config/tags'
import { docs } from '@/lib/docs'
import { filterDocs, groupByTag } from '@/lib/docs-query'
import { useTitle } from '@/lib/title'

export default function Docs() {
  useTitle('Documentación')
  const [query, setQuery] = useState('')
  const shown = filterDocs(docs, query)
  const groups = groupByTag(shown)

  return (
    <>
      <PageHeader
        eyebrow="Documentación"
        title="Documentación"
        lead="Guías y referencia del proyecto, en español. Cada página abre con un resumen, sigue con el ejemplo mínimo y deja el detalle plegado."
      />

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <label htmlFor="docs-filter" className="sr-only">
            Filtrar documentos por título o tag
          </label>
          <div className="relative max-w-prose">
            <Search
              className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="docs-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar por título o tag"
              autoComplete="off"
              className="bg-surface-sunken border-border-strong text-body text-ink placeholder:text-ink-subtle min-h-11 w-full rounded-md border pr-3 pl-10"
            />
          </div>
          <p className="text-body-sm text-ink-muted" role="status">
            {query.trim()
              ? `${shown.length} de ${docs.length} documentos`
              : `${docs.length} documentos`}
          </p>
        </div>

        {groups.length === 0 ? (
          <div className="flex max-w-prose flex-col items-start gap-3">
            <p className="text-body text-ink-muted">
              Ningún documento coincide con «{query.trim()}».
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-label text-accent min-h-11 underline underline-offset-4 md:min-h-8"
            >
              Borrar el filtro
            </button>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.tag} aria-labelledby={`tag-${g.tag}`}>
              <h2 id={`tag-${g.tag}`} className="text-h3 mb-4">
                {tagLabel(g.tag)}
              </h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {g.docs.map((d) => (
                  <li key={d.slug}>
                    <Link
                      to={`/docs/${d.slug}`}
                      className="bg-surface-raised border-border hover:border-border-strong flex h-full flex-col gap-3 rounded-md border p-4"
                    >
                      <span className="text-h4 [overflow-wrap:anywhere]">
                        {d.title}
                      </span>
                      <span className="text-body-sm text-ink-muted line-clamp-3">
                        {d.summary}
                      </span>
                      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
                        <TagList tags={d.tags} />
                        <span className="text-data text-ink-subtle uppercase">
                          v{d.since}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  )
}
