import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Collapsible } from '@/components/doc/Collapsible'
import { PageHeader } from '@/components/doc/PageHeader'
import { TagList } from '@/components/doc/TagList'
import { TranslationBadge } from '@/components/doc/TranslationBadge'
import { tagLabel } from '@/config/tags'
import { docs } from '@/lib/docs'
import { displayDoc, filterDocs, groupByTag } from '@/lib/docs-query'
import { useLang } from '@/lib/use-lang'
import { useTitle } from '@/lib/title'

export default function Docs() {
  const { lang, tr } = useLang()
  useTitle(tr('docs.title'))
  const [query, setQuery] = useState('')
  const shown = filterDocs(docs, query)
  // Los docs del equipo van en tarjetas; los de FiveM (cientos) en grupos plegados.
  const own = groupByTag(shown.filter((d) => !d.origin))
  const fivem = groupByTag(shown.filter((d) => d.origin))
  const filtering = query.trim() !== ''

  return (
    <>
      <PageHeader
        eyebrow={tr('docs.title')}
        title={tr('docs.title')}
        lead={tr('docs.lead')}
      />

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <label htmlFor="docs-filter" className="sr-only">
            {tr('docs.filterLabel')}
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
              placeholder={tr('docs.filterPlaceholder')}
              autoComplete="off"
              className="bg-surface-sunken border-border-strong text-body text-ink placeholder:text-ink-subtle min-h-11 w-full rounded-md border pr-3 pl-10"
            />
          </div>
          <p className="text-body-sm text-ink-muted" role="status">
            {query.trim()
              ? tr('docs.countFiltered', {
                  shown: shown.length,
                  total: docs.length,
                })
              : tr('docs.count', { n: docs.length })}
          </p>
        </div>

        {shown.length === 0 ? (
          <div className="flex max-w-prose flex-col items-start gap-3">
            <p className="text-body text-ink-muted">
              {tr('docs.empty', { query: query.trim() })}
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-label text-accent min-h-11 underline underline-offset-4 md:min-h-8"
            >
              {tr('docs.clear')}
            </button>
          </div>
        ) : (
          <>
            {own.map((g) => (
              <section key={g.tag} aria-labelledby={`tag-${g.tag}`}>
                <h2 id={`tag-${g.tag}`} className="text-h3 mb-4">
                  {tagLabel(g.tag, lang)}
                </h2>
                <ul className="grid gap-4 md:grid-cols-2">
                  {g.docs.map((d) => {
                    const t = displayDoc(d, lang)
                    return (
                      <li key={d.slug}>
                        <Link
                          to={`/docs/${d.slug}`}
                          className="bg-surface-raised border-border hover:border-border-strong flex h-full flex-col gap-3 rounded-md border p-4"
                        >
                          <span className="text-h4 [text-wrap:balance]">
                            {t.title}
                          </span>
                          <span className="text-body-sm text-ink-muted line-clamp-3">
                            {t.summary}
                          </span>
                          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
                            <TagList tags={d.tags} />
                            <span className="text-data text-ink-subtle uppercase">
                              v{d.since}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}

            {fivem.length > 0 && (
              <section aria-labelledby="fivem" className="flex flex-col gap-4">
                <div className="max-w-prose">
                  <h2 id="fivem" className="text-h3 mb-1">
                    {tr('docs.fivem')}
                  </h2>
                  <p className="text-body-sm text-ink-muted">
                    {tr('docs.fivemLead')}
                  </p>
                </div>
                {fivem.map((g) => (
                  // `key` con el filtro: al filtrar se abren los grupos con coincidencias.
                  <Collapsible
                    key={`${g.tag}:${filtering}`}
                    title={`${tagLabel(g.tag, lang)} (${g.docs.length})`}
                    defaultOpen={filtering}
                  >
                    <ul className="flex flex-col gap-1">
                      {g.docs.map((d) => {
                        const t = displayDoc(d, lang)
                        return (
                          <li key={d.slug}>
                            <Link
                              to={`/docs/${d.slug}`}
                              className="hover:bg-surface-overlay flex min-h-11 flex-col justify-center gap-0.5 rounded-md px-2 py-2"
                            >
                              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="text-label text-accent">
                                  {t.title}
                                </span>
                                {t.translated && (
                                  <TranslationBadge translated={t.translated} />
                                )}
                              </span>
                              <span className="text-body-sm text-ink-muted line-clamp-1">
                                {t.summary}
                              </span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </Collapsible>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </>
  )
}
