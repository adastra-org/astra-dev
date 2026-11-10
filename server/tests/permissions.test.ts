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

describe('parseViewer', () => {
  test('maps accounts roles onto public | subscriber | staff', () => {
    const v = (role: string, entitlements: string[] = []) =>
      parseViewer({ id: 'u1', handle: 'ana', role, entitlements }).role
    expect(v('staff')).toBe('staff')
    expect(v('admin')).toBe('staff')
    expect(v('subscriber')).toBe('subscriber')
    expect(v('member', ['subscriber'])).toBe('subscriber')
    expect(v('member')).toBe('public')
    expect(v('SUPERUSER')).toBe('public') // unknown roles fail closed
  })

  test('garbage and anonymous payloads are the anonymous viewer', () => {
    expect(parseViewer(null)).toEqual(ANONYMOUS)
    expect(parseViewer('x')).toEqual(ANONYMOUS)
    expect(parseViewer({ role: 'staff' })).toEqual(ANONYMOUS) // no id
    expect(parseViewer({ id: 7, role: 'staff' })).toEqual(ANONYMOUS)
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
        return Response.json({
          id: 'u1',
          handle: 'ana',
          role: 'subscriber',
          entitlements: ['tebex'],
        })
      }) as unknown as typeof fetch,
    })
    const v = await port.resolve(req('sid=abc'))
    expect(v).toMatchObject({ id: 'u1', role: 'subscriber' })
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
