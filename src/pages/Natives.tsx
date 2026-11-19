import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/doc/PageHeader'
import { TranslationBadge } from '@/components/doc/TranslationBadge'
import { useLang } from '@/lib/use-lang'
import { loadPreparedNatives } from '@/lib/natives/data'
import { groups, total } from '@/lib/natives/groups'
import { type PreparedNative, searchNatives } from '@/lib/natives/query'
import { useTitle } from '@/lib/title'

type Loaded = { prepared: PreparedNative[] } | { error: true } | null

export default function Natives() {
  const { lang, tr } = useLang()
  useTitle(tr('natives.title'))
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState<Loaded>(null)

  useEffect(() => {
    let live = true
    loadPreparedNatives()
      .then((prepared) => live && setLoaded({ prepared }))
      .catch(() => live && setLoaded({ error: true }))
    return () => {
      live = false
    }
  }, [])

  const hits =
    loaded && 'prepared' in loaded
      ? searchNatives(loaded.prepared, query, 40)
      : []
  const searching = query.trim().length >= 2
  const gta = groups.filter((g) => g.source === 'gta')
  const cfx = groups.filter((g) => g.source === 'cfx')

  return (
    <>
      <PageHeader
        eyebrow={tr('natives.eyebrow')}
        title={tr('natives.title')}
        lead={tr('natives.lead', { total: total.toLocaleString(lang) })}
      />

      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <label htmlFor="natives-filter" className="sr-only">
            {tr('natives.filterLabel')}
          </label>
          <div className="relative max-w-prose">
            <Search
              className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="natives-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('natives.filterPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="bg-surface-sunken border-border-strong text-body text-ink placeholder:text-ink-subtle min-h-11 w-full rounded-md border pr-3 pl-10"
            />
          </div>
          <p className="text-body-sm text-ink-muted" role="status">
            {loaded && 'error' in loaded
              ? tr('natives.loadError')
              : !searching
                ? ''
                : !loaded
                  ? tr('natives.loading')
                  : hits.length === 0
                    ? tr('natives.empty', { query: query.trim() })
                    : tr('natives.count', { n: hits.length })}
          </p>
        </div>

        {searching && hits.length > 0 && (
          <ul className="flex max-w-3xl flex-col gap-1">
            {hits.map(({ row, hash }) => (
              <li key={row.slug}>
                <Link
                  to={`/natives/${row.slug}`}
                  className="hover:bg-surface-raised flex min-h-11 flex-col justify-center gap-0.5 rounded-md px-3 py-2"
                >
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-label text-accent">
                      {row.luaName}
                    </span>
                    <span className="text-data text-ink-subtle [overflow-wrap:anywhere]">
                      {hash ?? row.name}
                    </span>
                    {row.translated && (
                      <TranslationBadge translated={row.translated} />
                    )}
                  </span>
                  {row.summary && (
                    <span className="text-body-sm text-ink-muted line-clamp-1">
                      {row.summary}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {[
          {
            title: 'GTA V',
            list: gta,
            lead: tr('natives.gta'),
          },
          {
            title: 'CFX',
            list: cfx,
            lead: tr('natives.cfx'),
          },
        ].map(
          ({ title, list, lead }) =>
            list.length > 0 && (
              <section key={title} aria-labelledby={`g-${title}`}>
                <h2 id={`g-${title}`} className="text-h3 mb-1">
                  {title}
                </h2>
                <p className="text-body-sm text-ink-muted mb-4">{lead}</p>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((g) => (
                    <li key={g.id}>
                      <Link
                        to={`/natives/ns/${g.id}`}
                        className="bg-surface-raised border-border hover:border-border-strong flex min-h-11 items-center justify-between gap-3 rounded-md border px-4 py-3"
                      >
                        <span className="text-label">{g.label}</span>
                        <span className="text-data text-ink-subtle">
                          {g.count.toLocaleString(lang)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
      </div>
    </>
  )
}
