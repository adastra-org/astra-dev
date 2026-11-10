import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BackToTop } from '@/components/doc/BackToTop'
import { DocHistory, DocRelations } from '@/components/doc/DocFooter'
import { DocSection } from '@/components/doc/DocSection'
import { PageHeader } from '@/components/doc/PageHeader'
import { Summary } from '@/components/doc/Summary'
import { TagList } from '@/components/doc/TagList'
import { TocInline, TocSide } from '@/components/doc/Toc'
import { docBySlug, docs, loadDocContent } from '@/lib/docs'
import type { DocContent, DocMeta } from '@/lib/docs/types'
import { resolveSlugs } from '@/lib/docs-query'
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
  useTitle('Documento no encontrado')
  return (
    <>
      <PageHeader
        eyebrow="Error 404"
        title="Documento no encontrado"
        lead={
          <>
            No hay un documento con la dirección{' '}
            <code className="text-code text-ink [overflow-wrap:anywhere]">
              {slug}
            </code>
            . Puede haberse renombrado o eliminado.
          </>
        }
      />
      <Link to="/docs" className="text-label text-accent">
        Ver todos los documentos
      </Link>
    </>
  )
}

type State = { content: DocContent } | { error: true } | null

function DocView({ meta }: { meta: DocMeta }) {
  const navigate = useNavigate()
  const [state, setState] = useState<State>(null)
  useTitle(meta.title)

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
  useRevealHash(content !== null)

  // Los enlaces del Markdown (`/docs/otro`) son `<a>` planos: se navegan sin recargar la página.
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as HTMLElement).closest('a')
    const href = a?.getAttribute('href')
    if (
      !a ||
      !href ||
      a.target ||
      !href.startsWith('/') ||
      href.startsWith('//')
    )
      return
    e.preventDefault()
    void navigate(href)
  }

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,44rem)_13rem] xl:gap-8">
      <article
        lang={meta.lang}
        className="flex min-w-0 flex-col gap-6"
        onClick={onClick}
      >
        <PageHeader eyebrow="Documento" title={meta.title}>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <TagList tags={meta.tags} />
            <span className="text-data text-ink-subtle uppercase">
              Desde v{meta.since}
            </span>
          </div>
        </PageHeader>

        <Summary>{meta.summary}</Summary>

        {content ? (
          <>
            <TocInline items={content.toc} />
            {content.sections.map((s) => (
              <DocSection key={s.id ?? 'intro'} section={s} />
            ))}
            <DocRelations
              related={resolveSlugs(docs, meta.related)}
              backlinks={resolveSlugs(docs, meta.backlinks)}
            />
            <DocHistory history={content.history} path={meta.path} />
          </>
        ) : state ? (
          <p className="text-body text-danger" role="alert">
            No se pudo cargar el documento. Recarga la página.
          </p>
        ) : (
          <p className="text-body-sm text-ink-muted" role="status">
            Cargando documento…
          </p>
        )}
      </article>
      {content && <TocSide items={content.toc} />}
      <BackToTop />
    </div>
  )
}
