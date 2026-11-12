import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/doc/PageHeader'
import { TranslationBadge } from '@/components/doc/TranslationBadge'
import { fold } from '@/lib/docs-query'
import { useLang } from '@/lib/use-lang'
import { loadNativeIndex } from '@/lib/natives/data'
import { groupById } from '@/lib/natives/groups'
import { rowsOfGroup } from '@/lib/natives/query'
import type { NativeRow } from '@/lib/natives/types'
import { useTitle } from '@/lib/title'

type Loaded = { rows: NativeRow[] } | { error: true } | null

export default function NativeGroup() {
  const { group = '' } = useParams()
  const info = groupById(group)
  const { lang, tr } = useLang()
  useTitle(
    info ? `${tr('natives.title')} ${info.label}` : tr('natives.nsNotFound'),
  )
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState<Loaded>(null)

  useEffect(() => {
    if (!info) return
    let live = true
    loadNativeIndex()
      .then((i) => live && setLoaded({ rows: rowsOfGroup(i.rows, group) }))
      .catch(() => live && setLoaded({ error: true }))
    return () => {
      live = false
    }
  }, [group, info])

  const words = fold(query).split(/\s+/).filter(Boolean)
  // El React Compiler memoiza esto; 7xx filas se filtran en < 1 ms.
  const rows = loaded && 'rows' in loaded ? loaded.rows : []
  const shown = !words.length
    ? rows
    : rows.filter((r) => {
        const hay = fold(
          `${r.name.replace(/_/g, ' ')} ${r.luaName} ${r.summary} ${r.hashes.join(' ')}`,
        )
        return words.every((w) => hay.includes(w))
      })

  if (!info)
    return (
      <>
        <PageHeader
          eyebrow={tr('notFound.eyebrow')}
          title={tr('natives.nsNotFound')}
          lead={
            <>
              {tr('natives.nsNotFoundLead')}{' '}
              <code className="text-code text-ink [overflow-wrap:anywhere]">
                {group}
              </code>
              .
            </>
          }
        />
        <Link to="/natives" className="text-label text-accent">
          {tr('natives.allGroups')}
        </Link>
      </>
    )

  return (
    <>
      <PageHeader
        eyebrow={`${tr('natives.title')} · ${info.source === 'gta' ? 'GTA V' : 'CFX'}`}
        title={info.label}
        lead={tr('natives.groupCount', { n: info.count.toLocaleString(lang) })}
      />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="group-filter" className="sr-only">
            {tr('natives.groupFilter', { group: info.label })}
          </label>
          <div className="relative max-w-prose">
            <Search
              className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="group-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('natives.groupPlaceholder')}
              autoComplete="off"
              spellCheck={false}
              className="bg-surface-sunken border-border-strong text-body text-ink placeholder:text-ink-subtle min-h-11 w-full rounded-md border pr-3 pl-10"
            />
          </div>
          <p className="text-body-sm text-ink-muted" role="status">
            {!loaded
              ? tr('natives.groupLoading')
              : 'error' in loaded
                ? tr('natives.loadError')
                : words.length
                  ? tr('natives.groupFiltered', {
                      shown: shown.length,
                      total: loaded.rows.length,
                    })
                  : tr('natives.groupTotal', { n: loaded.rows.length })}
          </p>
        </div>

        {loaded && 'rows' in loaded && (
          <ul className="flex max-w-3xl flex-col gap-1">
            {shown.map((r) => (
              <li key={r.slug}>
                <Link
                  to={`/natives/${r.slug}`}
                  className="hover:bg-surface-raised flex min-h-11 flex-col justify-center gap-0.5 rounded-md px-3 py-2"
                >
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-label text-accent">{r.luaName}</span>
                    <span className="text-data text-ink-subtle [overflow-wrap:anywhere]">
                      {r.name}
                    </span>
                    {r.translated && (
                      <TranslationBadge translated={r.translated} />
                    )}
                  </span>
                  {r.summary && (
                    <span className="text-body-sm text-ink-muted line-clamp-1">
                      {r.summary}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
