import { ExternalLink, Hash, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BackToTop } from '@/components/doc/BackToTop'
import { Collapsible } from '@/components/doc/Collapsible'
import { DocSection } from '@/components/doc/DocSection'
import { PageHeader } from '@/components/doc/PageHeader'
import { Summary } from '@/components/doc/Summary'
import { TocInline, TocSide } from '@/components/doc/Toc'
import { TranslationBadge } from '@/components/doc/TranslationBadge'
import { TranslationNote } from '@/components/doc/TranslationNote'
import { docBySlug } from '@/lib/docs'
import { displayDoc } from '@/lib/docs-query'
import { useInternalLinks } from '@/lib/internal-links'
import { wantedLang } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { usePublishNative } from '@/lib/natives/current'
import { loadNative } from '@/lib/natives/data'
import { groupById } from '@/lib/natives/groups'
import type { NativeContent } from '@/lib/natives/types'
import { usePublishHeadings } from '@/lib/palette/headings'
import { useRevealHash } from '@/lib/reveal'
import { useTitle } from '@/lib/title'

type State =
  | { native: NativeContent }
  | { missing: true }
  | { error: true }
  | null

export default function Native() {
  const { slug = '' } = useParams()
  // `key`: cada native arranca con estado limpio.
  return <NativeView key={slug} slug={slug} />
}

const linkClass =
  'text-label text-accent hover:text-ink inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-8'

function NativeView({ slug }: { slug: string }) {
  const [state, setState] = useState<State>(null)
  const [params] = useSearchParams()
  const { lang, tr } = useLang()
  const native = state && 'native' in state ? state.native : null
  const wantsEs = wantedLang(params.get('lang'), lang) === 'es'
  const showing = native?.variants.es && wantsEs ? 'es' : 'en'
  const variant = native
    ? showing === 'es' && native.variants.es
      ? native.variants.es
      : native.variants.en
    : null

  useTitle(native ? native.luaName : slug)
  usePublishNative(
    native
      ? { slug: native.slug, label: native.luaName, group: native.group }
      : null,
  )
  useRevealHash(native !== null)
  usePublishHeadings(variant ? variant.toc : null)

  useEffect(() => {
    let live = true
    loadNative(slug)
      .then((n) => live && setState(n ? { native: n } : { missing: true }))
      .catch(() => live && setState({ error: true }))
    return () => {
      live = false
    }
  }, [slug])

  const articleRef = useRef<HTMLElement>(null)
  useInternalLinks(articleRef)

  if (state && 'missing' in state)
    return (
      <>
        <PageHeader
          eyebrow={tr('notFound.eyebrow')}
          title={tr('natives.nativeNotFound')}
          lead={
            <>
              {tr('natives.nativeNotFoundLead')}{' '}
              <code className="text-code text-ink [overflow-wrap:anywhere]">
                {slug}
              </code>
              . {tr('natives.nativeNotFoundHint')}
            </>
          }
        />
        <Link to="/natives" className="text-label text-accent">
          {tr('natives.all')}
        </Link>
      </>
    )
  if (state && 'error' in state)
    return (
      <p className="text-body text-danger" role="alert">
        {tr('natives.nativeLoadError')}
      </p>
    )
  if (!native || !variant)
    return (
      <p className="text-body-sm text-ink-muted" role="status">
        {tr('natives.loadingNative')}
      </p>
    )

  const group = groupById(native.group)
  const mentions = native.mentionedIn.flatMap((s) => docBySlug(s) ?? [])

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,44rem)_13rem] xl:gap-8">
      <article
        ref={articleRef}
        lang={showing}
        className="flex min-w-0 flex-col gap-6"
      >
        <PageHeader
          eyebrow={`${tr('natives.nativeEyebrow')} · ${native.source === 'gta' ? 'GTA V' : 'CFX'} · ${group?.label ?? native.ns}`}
          title={native.luaName}
        >
          <p className="text-data text-ink-muted mt-1 [overflow-wrap:anywhere]">
            {native.name}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            {native.hashes.map((h) => (
              <span
                key={h}
                className="text-data text-ink-muted bg-surface-sunken inline-flex items-center gap-1 rounded-sm px-2 py-1 whitespace-nowrap"
              >
                <Hash className="size-3.5" aria-hidden="true" />
                {h}
              </span>
            ))}
            {native.hasAstraNotes && (
              <span className="text-data text-accent bg-surface-sunken inline-flex items-center gap-1 rounded-sm px-2 py-1 whitespace-nowrap uppercase">
                <Sparkles className="size-3.5" aria-hidden="true" />
                {tr('natives.astraNotes')}
              </span>
            )}
            {native.translated && showing === 'es' && (
              <TranslationBadge translated={native.translated} />
            )}
          </div>
        </PageHeader>

        {native.translated && (
          <TranslationNote
            showing={showing}
            translated={native.translated}
            to={`/natives/${native.slug}`}
          />
        )}

        <Summary>{variant.summary || tr('natives.noSummary')}</Summary>

        <TocInline items={variant.toc} />
        {variant.sections.map((s) => (
          <DocSection key={s.id ?? 'intro'} section={s} />
        ))}

        {(native.seeAlso.length > 0 || mentions.length > 0) && (
          <div className="flex max-w-prose flex-col gap-6">
            {native.seeAlso.length > 0 && (
              <section
                aria-labelledby="relacionados"
                className="flex flex-col gap-2"
              >
                <h2 id="relacionados" className="text-h4">
                  {tr('doc.related')}
                </h2>
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {native.seeAlso.map((r) => (
                    <li key={r.slug}>
                      <Link to={`/natives/${r.slug}`} className={linkClass}>
                        {r.luaName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {mentions.length > 0 && (
              <section
                aria-labelledby="mencionado-en"
                className="flex flex-col gap-2"
              >
                <h2 id="mencionado-en" className="text-h4">
                  {tr('natives.mentionedIn')}
                </h2>
                <ul className="flex flex-col gap-1">
                  {mentions.map((d) => (
                    <li key={d.slug}>
                      <Link to={`/docs/${d.slug}`} className={linkClass}>
                        {displayDoc(d, lang).title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <Collapsible title={tr('doc.source')}>
          <p className="text-body-sm">
            {tr('natives.sourceLead')}
            {native.hasAstraNotes ? tr('natives.sourceLeadNotes') : ''}
          </p>
          {native.originUrl && (
            <a
              href={native.originUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${linkClass} gap-2`}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {tr('natives.sourceFile')}
            </a>
          )}
        </Collapsible>
      </article>
      <TocSide items={variant.toc} />
      <BackToTop />
    </div>
  )
}
