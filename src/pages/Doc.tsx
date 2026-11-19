import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BackToTop } from '@/components/doc/BackToTop'
import { DocHistory, DocRelations } from '@/components/doc/DocFooter'
import { DocSection } from '@/components/doc/DocSection'
import { DocSource } from '@/components/doc/DocSource'
import { PageHeader } from '@/components/doc/PageHeader'
import { Summary } from '@/components/doc/Summary'
import { TagList } from '@/components/doc/TagList'
import { TocInline, TocSide } from '@/components/doc/Toc'
import {
  OnlySpanishNote,
  TranslationNote,
} from '@/components/doc/TranslationNote'
import { docBySlug, docs, loadDocContent } from '@/lib/docs'
import type { DocContent, DocMeta } from '@/lib/docs/types'
import { displayDoc, resolveSlugs } from '@/lib/docs-query'
import { useInternalLinks } from '@/lib/internal-links'
import { wantedLang } from '@/lib/i18n'
import { useLang } from '@/lib/use-lang'
import { usePublishHeadings } from '@/lib/palette/headings'
import { useRevealHash } from '@/lib/reveal'
import { useTitle } from '@/lib/title'

export default function Doc() {
  const { slug = '' } = useParams()
  const meta = docBySlug(slug)
  // `key`: cada documento arranca con estado limpio (carga, scroll del índice).
  return meta ? (
    <DocView key={meta.slug} meta={meta} />
  ) : (
    <DocNotFound slug={slug} />
  )
}

function DocNotFound({ slug }: { slug: string }) {
  const { tr } = useLang()
  useTitle(tr('doc.notFound.title'))
  return (
    <>
      <PageHeader
        eyebrow={tr('notFound.eyebrow')}
        title={tr('doc.notFound.title')}
        lead={
          <>
            {tr('doc.notFound.lead')}{' '}
            <code className="text-code text-ink [overflow-wrap:anywhere]">
              {slug}
            </code>
            . {tr('doc.notFound.hint')}
          </>
        }
      />
      <Link to="/docs" className="text-label text-accent">
        {tr('doc.all')}
      </Link>
    </>
  )
}

type State = { content: DocContent } | { error: true } | null

function DocView({ meta }: { meta: DocMeta }) {
  const [state, setState] = useState<State>(null)
  const [params] = useSearchParams()
  const { lang, tr } = useLang()
  // Se muestra el idioma de la interfaz si hay traducción; `?lang=en|es` manda sobre el selector
  // (ver DESIGN, "Idioma").
  const wanted = wantedLang(params.get('lang'), lang)
  const shown = displayDoc(meta, wanted)
  const translation = meta.translations?.es
  useTitle(shown.title)

  useEffect(() => {
    let live = true
    loadDocContent(meta.slug)
      .then((content) => live && setState({ content }))
      .catch(() => live && setState({ error: true }))
    return () => {
      live = false
    }
  }, [meta.slug])

  const content = state && 'content' in state ? state.content : null
  // Cuerpo en el idioma mostrado: la traducción trae el suyo (secciones e índice).
  const body =
    content && shown.lang !== meta.lang && content.es ? content.es : content
  useRevealHash(content !== null)
  usePublishHeadings(body ? body.toc : null)

  const articleRef = useRef<HTMLElement>(null)
  useInternalLinks(articleRef)

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,44rem)_13rem] xl:gap-8">
      <article
        ref={articleRef}
        lang={shown.lang}
        className="flex min-w-0 flex-col gap-6"
      >
        <PageHeader
          eyebrow={meta.origin ? tr('doc.eyebrowFivem') : tr('doc.eyebrow')}
          title={shown.title}
        >
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <TagList tags={meta.tags} />
            <span className="text-data text-ink-subtle uppercase">
              {tr('doc.since', { version: meta.since })}
            </span>
          </div>
        </PageHeader>

        {translation ? (
          <TranslationNote
            showing={shown.lang === meta.lang ? 'en' : 'es'}
            translated={translation.translated}
            to={`/docs/${meta.slug}`}
          />
        ) : (
          wanted === 'en' && meta.lang === 'es' && <OnlySpanishNote />
        )}

        <Summary>{shown.summary}</Summary>

        {body && content ? (
          <>
            <TocInline items={body.toc} />
            {body.sections.map((s) => (
              <DocSection key={s.id ?? 'intro'} section={s} />
            ))}
            <DocRelations
              related={resolveSlugs(docs, meta.related)}
              backlinks={resolveSlugs(docs, meta.backlinks)}
            />
            {meta.origin ? (
              <DocSource origin={meta.origin} />
            ) : (
              <DocHistory history={content.history} path={meta.path} />
            )}
          </>
        ) : state ? (
          <p className="text-body text-danger" role="alert">
            {tr('doc.loadError')}
          </p>
        ) : (
          <p className="text-body-sm text-ink-muted" role="status">
            {tr('doc.loading')}
          </p>
        )}
      </article>
      {body && <TocSide items={body.toc} />}
      <BackToTop />
    </div>
  )
}
