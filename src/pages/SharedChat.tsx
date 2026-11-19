import { Info, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnswerBody } from '@/components/ask/AnswerBody'
import { SourceRow } from '@/components/ask/Conversation'
import { PageHeader } from '@/components/doc/PageHeader'
import { describeAskError, type ErrorView } from '@/lib/ask/errors'
import {
  readSharedChat,
  toAskSource,
  type SharedChat as SharedChatData,
} from '@/lib/ask/share'
import { AskError } from '@/lib/ask/types'
import { useTitle } from '@/lib/title'
import { useLang } from '@/lib/use-lang'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; view: ErrorView }
  | { kind: 'ready'; chat: SharedChatData }

/** Una charla compartida no se indexa ni manda el enlace (el token va en la ruta) como referer. */
function useNoIndex() {
  useEffect(() => {
    const metas = [
      ['robots', 'noindex, nofollow'],
      ['referrer', 'no-referrer'],
    ].map(([name, content]) => {
      const m = document.createElement('meta')
      m.name = name!
      m.content = content!
      document.head.appendChild(m)
      return m
    })
    return () => metas.forEach((m) => m.remove())
  }, [])
}

/**
 * Lectura de una charla compartida (`/ask/s/:token`, issue #34). Solo lectura: el contenido es una
 * captura que mandó quien compartió, así que el aviso va siempre arriba. Si el server rechaza el
 * enlace (vencido, revocado, sin permiso) se muestra el motivo y nada más.
 */
export default function SharedChat() {
  const { tr } = useLang()
  const { token = '' } = useParams()
  useTitle(tr('share.view.title'))
  useNoIndex()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const ctl = new AbortController()
    setState({ kind: 'loading' })
    readSharedChat(token, { signal: ctl.signal })
      .then((chat) => setState({ kind: 'ready', chat }))
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return
        setState({
          kind: 'error',
          view: describeAskError(
            e instanceof AskError ? e : new AskError('internal', String(e)),
            tr,
          ),
        })
      })
    return () => ctl.abort()
    // `tr` cambia con el idioma; recargar el enlace por eso gastaría una lectura de más.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={tr('ask.page.eyebrow')}
        title={tr('share.view.title')}
      />
      {state.kind === 'loading' && (
        <p role="status" className="text-body text-ink-muted">
          {tr('share.view.loading')}
        </p>
      )}
      {state.kind === 'error' && <SharedError view={state.view} />}
      {state.kind === 'ready' && <SharedChatView chat={state.chat} />}
    </div>
  )
}

export function SharedError({ view }: { view: ErrorView }) {
  const { tr } = useLang()
  return (
    <div role="alert" className="flex max-w-prose flex-col gap-3">
      <p className="text-body flex gap-2">
        <TriangleAlert
          className="text-warning mt-0.5 size-5 shrink-0"
          aria-hidden="true"
        />
        <span className="text-ink">{view.title}</span>
      </p>
      {view.hint && <p className="text-body-sm text-ink-muted">{view.hint}</p>}
      <div className="flex flex-wrap gap-2">
        {view.action && (
          <a
            href={view.action.href}
            target="_blank"
            rel="noreferrer"
            className="text-label bg-accent-fill text-on-accent hover:bg-accent-fill-hover inline-flex min-h-11 items-center rounded-md px-4 md:min-h-8"
          >
            {view.action.label}
          </a>
        )}
        <Link
          to="/ask"
          className="text-label text-ink bg-surface-raised hover:bg-surface-overlay inline-flex min-h-11 items-center rounded-md px-4 md:min-h-8"
        >
          {tr('share.view.back')}
        </Link>
      </div>
    </div>
  )
}

/** La charla ya leída. Aparte de la página para poder probarla sin red. */
export function SharedChatView({ chat }: { chat: SharedChatData }) {
  const { tr, lang } = useLang()
  const expires = new Date(chat.expiresAt).toLocaleDateString(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return (
    <>
      <p
        role="note"
        className="bg-surface-sunken text-body-sm text-ink flex max-w-prose gap-2 rounded-md p-3"
      >
        <Info
          className="text-accent mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        {tr('share.view.banner')}
      </p>
      <p className="text-caption text-ink-muted">
        {chat.sharedBy
          ? tr('share.view.by', { handle: chat.sharedBy })
          : tr('share.view.byPublic')}
        {' · '}
        {tr('share.view.expires', { date: expires })}
      </p>

      <section className="flex max-w-prose flex-col gap-8">
        {chat.turns.map((t, i) => {
          const sources = t.sources.map(toAskSource)
          return (
            <article key={i} className="flex flex-col gap-3">
              <p className="bg-surface-overlay text-body text-ink max-w-[85%] self-end rounded-lg px-4 py-2 break-words">
                <span className="sr-only">{tr('share.view.question')}: </span>
                {t.question}
              </p>
              <AnswerBody text={t.text} sources={sources} onNavigate={noop} />
              {sources.length > 0 && (
                <section
                  aria-label={tr('ask.sourcesCited')}
                  className="flex flex-col gap-1"
                >
                  <h3 className="text-eyebrow px-3">{tr('ask.sources')}</h3>
                  <ul className="flex flex-col">
                    {sources.map((s) => (
                      <SourceRow key={s.n} source={s} onNavigate={noop} />
                    ))}
                  </ul>
                </section>
              )}
            </article>
          )
        })}
      </section>
    </>
  )
}

const noop = () => {}
