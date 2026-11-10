import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config.ts'
import { ConfigError } from '../src/errors.ts'
import {
  ANONYMOUS,
  DevStubViewerPort,
  HttpViewerPort,
  createViewerPort,
  parseViewer,
  requireChatAccess,
} from '../src/viewer.ts'
import { harness } from './helpers.ts'

// Payload shape of GET /api/auth/viewer (adastra-site docs/accounts/README.md).
const NOW = Date.parse('2026-11-10T12:00:00Z')
const payload = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  handle: 'ana',
  role: 'member',
  emailVerified: true,
  entitlements: [],
  ...over,
})
const tebex = (validUntil: string | null) => ({
  kind: 'tebex-subscriber',
  validUntil,
})

describe('parseViewer (real accounts payload)', () => {
  test('member without entitlements is public', () => {
    expect(parseViewer(payload(), NOW)).toEqual({
      id: 'u1',
      handle: 'ana',
      role: 'public',
      emailVerified: true,
      entitlements: [],
    })
  })

  test('member with an active tebex-subscriber is subscriber (dated or open-ended)', () => {
    const dated = parseViewer(
      payload({ entitlements: [tebex('2026-12-10T00:00:00.000Z')] }),
      NOW,
    )
    expect(dated.role).toBe('subscriber')
    expect(dated.entitlements).toEqual([tebex('2026-12-10T00:00:00.000Z')])
    expect(
      parseViewer(payload({ entitlements: [tebex(null)] }), NOW).role,
    ).toBe('subscriber')
  })

  test('an expired tebex-subscriber is ignored even if accounts listed it', () => {
    const v = parseViewer(
      payload({ entitlements: [tebex('2026-11-10T11:59:59Z')] }),
      NOW,
    )
    expect(v.role).toBe('public')
    expect(v.entitlements).toEqual([])
    // Exactly now counts as expired.
    expect(
      parseViewer(
        payload({ entitlements: [tebex('2026-11-10T12:00:00Z')] }),
        NOW,
      ).role,
    ).toBe('public')
  })

  test('role staff is staff, with or without entitlements', () => {
    expect(parseViewer(payload({ role: 'staff' }), NOW).role).toBe('staff')
    expect(
      parseViewer(payload({ role: 'staff', entitlements: [tebex(null)] }), NOW)
        .role,
    ).toBe('staff')
  })

  test('other entitlement kinds and other roles never grant access', () => {
    expect(
      parseViewer(
        payload({ entitlements: [{ kind: 'beta', validUntil: null }] }),
        NOW,
      ).role,
    ).toBe('public')
    for (const role of ['admin', 'owner', 'subscriber', 'STAFF', '', null, 7])
      expect(parseViewer(payload({ role }), NOW).role).toBe('public')
  })

  test('malformed payloads fail closed', () => {
    for (const bad of [
      null,
      'x',
      42,
      [],
      {},
      { role: 'staff' },
      { id: 7, role: 'staff' },
    ])
      expect(parseViewer(bad, NOW)).toEqual(ANONYMOUS)
    // Legacy string entitlements and junk entries do not count.
    for (const entitlements of [
      ['subscriber'],
      ['tebex-subscriber'],
      'tebex-subscriber',
      [null, 7, {}, { kind: 7 }, { kind: 'tebex-subscriber', validUntil: 12 }],
      [{ kind: 'tebex-subscriber', validUntil: 'not a date' }],
      { kind: 'tebex-subscriber', validUntil: null },
    ])
      expect(parseViewer(payload({ entitlements }), NOW).role).toBe('public')
  })

  test('emailVerified is true only for a literal true', () => {
    expect(
      parseViewer(payload({ emailVerified: true }), NOW).emailVerified,
    ).toBe(true)
    for (const emailVerified of ['true', 1, null, undefined])
      expect(parseViewer(payload({ emailVerified }), NOW).emailVerified).toBe(
        false,
      )
  })
})

describe('HttpViewerPort', () => {
  const req = (cookie?: string) =>
    new Request('http://x/chat', cookie ? { headers: { cookie } } : {})

  test('forwards the cookie to the accounts viewer endpoint and parses the answer', async () => {
    let seen: { url: string; cookie: string | null } | undefined
    const port = new HttpViewerPort({
      baseUrl: 'https://accounts.example',
      path: '/api/auth/viewer',
      timeoutMs: 1000,
      fetch: (async (url: string, init: RequestInit) => {
        seen = { url, cookie: new Headers(init.headers).get('cookie') }
        return Response.json(
          payload({ entitlements: [tebex('2099-01-01T00:00:00Z')] }),
        )
      }) as unknown as typeof fetch,
    })
    const v = await port.resolve(req('sid=abc'))
    expect(v).toMatchObject({
      id: 'u1',
      role: 'subscriber',
      emailVerified: true,
    })
    expect(seen).toEqual({
      url: 'https://accounts.example/api/auth/viewer',
      cookie: 'sid=abc',
    })
  })

  test('no cookie: anonymous, accounts is not called', async () => {
    let calls = 0
    const port = new HttpViewerPort({
      baseUrl: 'https://a',
      path: '/v',
      timeoutMs: 1000,
      fetch: (async () => {
        calls++
        return Response.json({})
      }) as unknown as typeof fetch,
    })
    expect(await port.resolve(req())).toEqual(ANONYMOUS)
    expect(calls).toBe(0)
  })

  test('401 from accounts is anonymous; 5xx and network errors are viewer_unavailable (fail closed)', async () => {
    const mk = (f: () => Promise<Response>) =>
      new HttpViewerPort({
        baseUrl: 'https://a',
        path: '/v',
        timeoutMs: 1000,
        fetch: f as unknown as typeof fetch,
      })
    expect(
      await mk(async () => new Response('', { status: 401 })).resolve(
        req('s=1'),
      ),
    ).toEqual(ANONYMOUS)
    expect(
      mk(async () => new Response('', { status: 500 })).resolve(req('s=1')),
    ).rejects.toMatchObject({ code: 'viewer_unavailable' })
    expect(
      mk(async () => {
        throw new TypeError('down')
      }).resolve(req('s=1')),
    ).rejects.toMatchObject({ code: 'viewer_unavailable' })
  })

  test('caches per cookie for a short time', async () => {
    let calls = 0
    let t = 0
    const port = new HttpViewerPort({
      baseUrl: 'https://a',
      path: '/v',
      timeoutMs: 1000,
      cacheMs: 1000,
      now: () => t,
      fetch: (async () => {
        calls++
        return Response.json({ id: 'u', role: 'staff' })
      }) as unknown as typeof fetch,
    })
    await port.resolve(req('s=1'))
    await port.resolve(req('s=1'))
    expect(calls).toBe(1)
    await port.resolve(req('s=2'))
    expect(calls).toBe(2)
    t = 1500
    await port.resolve(req('s=1'))
    expect(calls).toBe(3)
  })
})

describe('dev stub is ignored in production', () => {
  test('config drops ASTRA_DEV_VIEWER when NODE_ENV=production', () => {
    const prod = loadConfig({
      NODE_ENV: 'production',
      DEEPSEEK_API_KEY: 'k',
      ASTRA_DEV_VIEWER: 'staff',
    })
    expect(prod.devViewer).toBeNull()
    expect(createViewerPort(prod)).toBeInstanceOf(HttpViewerPort)
  })

  test('createViewerPort never builds the stub in production even with a hand-made config', () => {
    const prod = loadConfig({ NODE_ENV: 'production', DEEPSEEK_API_KEY: 'k' })
    expect(createViewerPort({ ...prod, devViewer: 'staff' })).toBeInstanceOf(
      HttpViewerPort,
    )
  })

  test('outside production the flag selects the stub', () => {
    const dev = loadConfig({ LLM_PROVIDER: 'fake', ASTRA_DEV_VIEWER: 'staff' })
    expect(createViewerPort(dev)).toBeInstanceOf(DevStubViewerPort)
  })

  test('production refuses to boot without the API key or with the fake provider', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(ConfigError)
    expect(() =>
      loadConfig({ NODE_ENV: 'production', LLM_PROVIDER: 'fake' }),
    ).toThrow('not allowed in production')
  })
})

describe('chat permission gating', () => {
  test('anonymous: 401 unauthenticated', () => {
    expect(() => requireChatAccess(ANONYMOUS)).toThrow('Sign in')
  })

  test('HTTP: anonymous 401, signed-in public 403, subscriber and staff 200', async () => {
    const anon = await harness({ role: 'public' })
    const r1 = await anon.call('/chat', { json: { question: 'hola' } })
    expect(r1.status).toBe(401)
    expect((await r1.json()).error.code).toBe('unauthenticated')

    const free = await harness({
      viewers: {
        resolve: async () => ({
          id: 'u9',
          handle: 'x',
          role: 'public',
          emailVerified: true,
          entitlements: [],
        }),
      },
    })
    const r2 = await free.call('/chat', { json: { question: 'hola' } })
    expect(r2.status).toBe(403)
    expect((await r2.json()).error.code).toBe('subscription_required')

    for (const role of ['subscriber', 'staff'] as const) {
      const h = await harness({ role })
      const r = await h.call('/chat', {
        json: { question: 'como hago un deploy' },
      })
      expect(r.status).toBe(200)
      await r.text()
    }
  })

  test('accounts down: 503 viewer_unavailable, the model is never called', async () => {
    const h = await harness({
      viewers: {
        resolve: async () => {
          const { AppError } = await import('../src/errors.ts')
          throw new AppError('viewer_unavailable', 'down')
        },
      },
    })
    const r = await h.call('/chat', { json: { question: 'hola' } })
    expect(r.status).toBe(503)
    expect(h.llm.requests).toHaveLength(0)
  })

  test('cross-site Origin is refused before anything else', async () => {
    const h = await harness({ role: 'staff' })
    const r = await h.call('/chat', {
      json: { question: 'hola' },
      headers: { origin: 'https://evil.example' },
    })
    expect(r.status).toBe(403)
    expect((await r.json()).error.code).toBe('forbidden_origin')
    const ok = await h.call('/chat', {
      json: { question: 'deploy' },
      headers: { origin: 'https://development.adastrarp.com' },
    })
    expect(ok.status).toBe(200)
    await ok.text()
  })
})

describe('graphql is same-origin only', () => {
  const q = {
    query:
      '{ viewer { id handle role emailVerified entitlements { kind validUntil } } }',
  }

  test('a request from another site is refused and carries no CORS headers', async () => {
    const h = await harness({ role: 'subscriber' })
    const r = await h.call('/graphql', {
      json: q,
      headers: { origin: 'https://evil.example', cookie: 's=1' },
    })
    expect(r.status).toBe(403)
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
    expect(r.headers.get('access-control-allow-credentials')).toBeNull()
    expect(await r.text()).not.toContain('dev-subscriber')
  })

  test('preflight from another site gets no permission', async () => {
    const h = await harness()
    const r = await h.call('/graphql', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
      },
    })
    expect(r.headers.get('access-control-allow-origin')).toBeNull()
  })

  test('the site origin works, and so does a request without Origin', async () => {
    const h = await harness({ role: 'subscriber' })
    const ok = await h.call('/graphql', {
      json: q,
      headers: { origin: 'https://development.adastrarp.com' },
    })
    expect((await ok.json()).data.viewer.role).toBe('subscriber')
    const none = await h.call('/graphql', { json: q })
    expect(none.status).toBe(200)
  })
})

describe('chat access with the real accounts payload end to end', () => {
  const viaAccounts = (body: unknown, status = 200) =>
    new HttpViewerPort({
      baseUrl: 'https://accounts.example',
      path: '/api/auth/viewer',
      timeoutMs: 1000,
      fetch: (async () =>
        Response.json(body, { status })) as unknown as typeof fetch,
    })
  const chat = async (port: HttpViewerPort) => {
    const h = await harness({ viewers: port })
    const r = await h.call('/chat', {
      json: { question: 'como hago un deploy' },
      headers: { cookie: 'sid=abc' },
    })
    await r.text()
    return r.status
  }

  test('member + active tebex-subscriber chats; plain member gets 403; expired gets 403; staff chats', async () => {
    expect(
      await chat(
        viaAccounts(payload({ entitlements: [tebex('2099-01-01T00:00:00Z')] })),
      ),
    ).toBe(200)
    expect(await chat(viaAccounts(payload()))).toBe(403)
    expect(
      await chat(
        viaAccounts(payload({ entitlements: [tebex('2020-01-01T00:00:00Z')] })),
      ),
    ).toBe(403)
    expect(await chat(viaAccounts(payload({ role: 'staff' })))).toBe(200)
  })

  test('401 from accounts is 401 here; a malformed payload is 401, not access', async () => {
    expect(await chat(viaAccounts({ error: 'no session' }, 401))).toBe(401)
    expect(await chat(viaAccounts({ nope: true }))).toBe(401)
  })
})
