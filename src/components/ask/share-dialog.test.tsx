// Render (SSR) del diálogo de compartir y de la lectura de una charla compartida. El flujo real
// (crear, copiar, revocar) se verifica en el navegador (docs/chat/README.md).
import { describe, expect, test } from 'bun:test'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describeError } from '@/lib/ask/errors'
import type { ShareConfig, SharedChat } from '@/lib/ask/share'
import { emptyTurn, type Turn } from '@/lib/ask/store'
import { MESSAGES, t, type UiLang } from '@/lib/i18n'
import { SharedChatView, SharedError } from '@/pages/SharedChat'
import { LangContext, type LangValue } from '@/lib/use-lang'
import { defaultSelection, ShareDialog } from './ShareDialog'

const value = (lang: UiLang): LangValue => ({
  lang,
  setLang: () => {},
  tr: (key, vars) => t(lang, key, vars),
})
const wrap = (node: ReactNode, lang: UiLang = 'es') =>
  renderToString(
    <MemoryRouter>
      <LangContext.Provider value={value(lang)}>{node}</LangContext.Provider>
    </MemoryRouter>,
  )

const config: ShareConfig = {
  enabled: true,
  maxTurns: 20,
  defaultTtlHours: 168,
  maxTtlHours: 720,
  publicAllowed: true,
}
const done = (id: number, over: Partial<Turn> = {}): Turn => ({
  ...emptyTurn(id, `pregunta ${id}`),
  status: 'done',
  text: `respuesta ${id}`,
  ...over,
})

describe('ShareDialog', () => {
  test('cerrado: <dialog> sin contenido enfocable', () => {
    const html = wrap(
      <ShareDialog
        open={false}
        onClose={() => {}}
        turns={[done(1)]}
        memories={[]}
        config={config}
      />,
    )
    expect(html).toContain('<dialog')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
  })

  test('abierto: turnos, vista previa, audiencia staff marcada y vencimientos', () => {
    const html = wrap(
      <ShareDialog
        open
        onClose={() => {}}
        turns={[done(1), done(2)]}
        memories={[]}
        config={config}
      />,
    )
    expect(html).toContain('Compartir esta charla')
    expect(html).toContain('Pregunta 1: pregunta 1')
    expect(html).toContain('Vista previa de lo que se envía')
    expect(html).toContain('Equipo de Ad Astra')
    expect(html).toContain('Cualquiera con el enlace')
    expect(html).toContain('7 días')
    // `public` pide confirmación: con `staff` elegido no aparece.
    expect(html).not.toContain('Entiendo que cualquiera')
    expect(html).toContain('Crear enlace')
  })

  test('sin publicAllowed (no staff): solo staff, sin opción pública', () => {
    const html = wrap(
      <ShareDialog
        open
        onClose={() => {}}
        turns={[done(1)]}
        memories={[]}
        config={{ ...config, publicAllowed: false }}
      />,
    )
    expect(html).toContain('Crear enlace')
    expect(html).not.toContain('Cualquiera con el enlace')
  })

  test('avisa del enmascarado y de memorias activas', () => {
    const html = wrap(
      <ShareDialog
        open
        onClose={() => {}}
        turns={[done(1, { text: 'uso Windows siempre', memoryTokens: 5 })]}
        memories={['uso Windows']}
        config={config}
      />,
    )
    expect(html).toContain('1 menciones literales')
    expect(html).toContain('[memoria] siempre')
    expect(html).toContain('generó con tus memorias activas')
  })

  test('en inglés', () => {
    const html = wrap(
      <ShareDialog
        open
        onClose={() => {}}
        turns={[done(1)]}
        memories={[]}
        config={config}
      />,
      'en',
    )
    expect(html).toContain('Share this chat')
    expect(html).toContain('Create link')
  })

  test('defaultSelection: los últimos N compartibles', () => {
    const turns = [done(1), done(2), done(3, { status: 'streaming' }), done(4)]
    expect([...defaultSelection(turns, 2)]).toEqual([2, 4])
  })
})

const chat: SharedChat = {
  audience: 'staff',
  sharedBy: 'ana',
  createdAt: '2026-11-19T10:00:00Z',
  expiresAt: '2026-11-26T10:00:00Z',
  turns: [
    {
      question: '¿Cómo hago un rollback?',
      text: 'Cambia el symlink [1].',
      refused: false,
      truncated: false,
      cited: [1],
      sources: [
        {
          n: 1,
          kind: 'doc',
          slug: 'flujo-de-deploy',
          title: 'Flujo de deploy',
          heading: 'Rollback',
          anchor: 'rollback',
          path: '/docs/flujo-de-deploy#rollback',
        },
      ],
    },
  ],
}

describe('SharedChatView', () => {
  test('banner de captura, autoría y fuente interna', () => {
    const html = wrap(<SharedChatView chat={chat} />)
    expect(html).toContain('role="note"')
    expect(html).toContain('no verifica que el texto sea el original')
    expect(html).toContain('Compartida por ana')
    expect(html).toContain('¿Cómo hago un rollback?')
    expect(html).toContain('Flujo de deploy')
    expect(html).toContain('href="/docs/flujo-de-deploy#rollback"')
    expect(html).not.toContain('href="http')
  })

  test('audiencia pública: sin handle', () => {
    const html = wrap(
      <SharedChatView chat={{ ...chat, audience: 'public', sharedBy: null }} />,
    )
    expect(html).toContain('Compartida por un miembro de Ad Astra')
  })

  test('el HTML del texto no se interpreta', () => {
    const evil: SharedChat = {
      ...chat,
      turns: [
        {
          ...chat.turns[0]!,
          text: '<img src=x onerror=alert(1)>',
          sources: [],
        },
      ],
    }
    const html = wrap(<SharedChatView chat={evil} />)
    expect(html).not.toContain('<img')
  })
})

describe('estados de error del enlace', () => {
  test('404, staff y sin sesión', () => {
    const nf = wrap(<SharedError view={describeError('share_not_found')} />)
    expect(nf).toContain('no existe o ya venció')
    expect(nf).toContain('role="alert"')
    const staff = wrap(<SharedError view={describeError('staff_required')} />)
    expect(staff).toContain('solo para el equipo')
    expect(staff).toContain('Iniciar sesión')
    const anon = wrap(<SharedError view={describeError('unauthenticated')} />)
    expect(anon).toContain('Iniciar sesión')
  })

  test('cada código nuevo tiene título e indicación en ES y EN', () => {
    for (const lang of ['es', 'en'] as const)
      for (const code of [
        'share_not_found',
        'staff_required',
        'share_limit',
        'share_unavailable',
      ]) {
        const v = describeError(code, undefined, (k, vars) => t(lang, k, vars))
        expect(v.title).toBeTruthy()
        expect(v.hint).toBeTruthy()
      }
    expect(Object.keys(MESSAGES.en).length).toBe(
      Object.keys(MESSAGES.es).length,
    )
  })
})
