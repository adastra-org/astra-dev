// Shared chats: who may create, read and revoke a link, what is kept, how long, and the limits.
import { describe, expect, test } from 'bun:test'
import { AppError } from '../src/errors.ts'
import { ShareStore } from '../src/share/store.ts'
import {
  ANONYMOUS,
  SUBSCRIBER_KIND,
  type Viewer,
  type ViewerPort,
} from '../src/viewer.ts'
import { harness } from './helpers.ts'

const T0 = Date.UTC(2026, 10, 19, 12, 0, 0)
const HOUR = 3_600_000

const person = (
  id: string,
  role: Viewer['role'],
  handle = id,
  signedIn = true,
): Viewer =>
  signedIn
    ? {
        id,
        handle,
        role,
        emailVerified: true,
        entitlements:
          role === 'subscriber'
            ? [{ kind: SUBSCRIBER_KIND, validUntil: null }]
            : [],
      }
    : ANONYMOUS

/** Who asks is chosen per request with the `x-as` header; `down` simulates accounts being offline. */
const WHO: Record<string, Viewer> = {
  anon: ANONYMOUS,
  // Signed in, no subscription: role `public` with an id.
  free: person('u-free', 'public'),
  ana: person('u-ana', 'subscriber', 'ana'),
  bruno: person('u-bruno', 'subscriber', 'bruno'),
  sol: person('u-sol', 'staff', 'sol'),
  faku: person('u-faku', 'owner', 'faku'),
}

class Viewers implements ViewerPort {
  resolves = 0
  resolve(request: Request): Promise<Viewer> {
    this.resolves++
    const as = request.headers.get('x-as') ?? 'anon'
    if (as === 'down')
      return Promise.reject(
        new AppError('viewer_unavailable', 'Accounts is down.'),
      )
    return Promise.resolve(WHO[as] ?? ANONYMOUS)
  }
}

const turn = (over: Record<string, unknown> = {}) => ({
  question: '¿Cómo hago rollback del deploy?',
  text: 'El rollback cambia el symlink al slot anterior [1].',
  refused: false,
  truncated: false,
  cited: [1],
  sources: [{ n: 1, slug: 'flujo-de-deploy', anchor: 'rollback' }],
  ...over,
})

type Gql = {
  data?: any
  errors?: { message: string; extensions?: { code?: string } }[]
}

async function setup(
  env: Record<string, string> = {},
  opts: { now?: () => number } = {},
) {
  const store = new ShareStore(':memory:')
  const viewers = new Viewers()
  const clock = { t: T0 }
  const h = await harness({
    viewers,
    share: store,
    env,
    now: opts.now ?? (() => clock.t),
  })
  const gql = async (
    as: string,
    query: string,
    variables: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ): Promise<Gql> => {
    const r = await h.call('/graphql', {
      json: { query, variables },
      headers: { 'x-as': as, ...headers },
    })
    return r.json()
  }
  const SHARE = `mutation($turns:[ShareTurnInput!]!,$audience:String!,$ttl:Int){
    shareChat(turns:$turns,audience:$audience,ttlHours:$ttl){ id token audience expiresAt } }`
  const share = (
    as: string,
    audience = 'staff',
    turns: unknown[] = [turn()],
    ttl?: number,
  ) => gql(as, SHARE, { turns, audience, ttl: ttl ?? null })
  const READ = `query($token:String!){ sharedChat(token:$token){
    audience sharedBy createdAt expiresAt
    turns{ question text refused truncated cited sources{ n kind slug title heading anchor path } } } }`
  const read = (as: string, token: string) => gql(as, READ, { token })
  const revoke = (as: string, id: string) =>
    gql(as, 'mutation($id:String!){ revokeShare(id:$id) }', { id })
  const mine = (as: string) =>
    gql(as, '{ myShares { id audience createdAt expiresAt turns views } }')
  const code = (r: Gql) => r.errors?.[0]?.extensions?.code
  return {
    h,
    store,
    viewers,
    clock,
    gql,
    share,
    read,
    revoke,
    mine,
    code,
  }
}

const created = async (
  s: Awaited<ReturnType<typeof setup>>,
  as = 'ana',
  audience = 'staff',
) => {
  const r = await s.share(as, audience)
  expect(r.errors).toBeUndefined()
  return r.data.shareChat as {
    id: string
    token: string
    audience: string
    expiresAt: string
  }
}

describe('feature off', () => {
  test('without a store every operation answers share_unavailable', async () => {
    const h = await harness({ role: 'owner' })
    const run = async (query: string) =>
      (await (await h.call('/graphql', { json: { query } })).json()) as Gql
    const r = await run(
      `mutation { shareChat(turns: [], audience: "staff") { id } }`,
    )
    expect(r.errors?.[0]?.extensions?.code).toBe('share_unavailable')
    expect(
      (await run('{ myShares { id } }')).errors?.[0]?.extensions?.code,
    ).toBe('share_unavailable')
    expect(
      (await run('{ sharedChat(token: "x") { audience } }')).errors?.[0]
        ?.extensions?.code,
    ).toBe('share_unavailable')
    const cfg = await run('{ shareConfig { enabled } }')
    expect(cfg.data.shareConfig.enabled).toBe(false)
  })

  test('shareConfig tells the client the limits when it is on', async () => {
    const s = await setup()
    const r = await s.gql(
      'anon',
      '{ shareConfig { enabled maxTurns defaultTtlHours maxTtlHours publicAllowed } }',
    )
    expect(r.data.shareConfig).toEqual({
      enabled: true,
      maxTurns: 20,
      defaultTtlHours: 168,
      maxTtlHours: 720,
      publicAllowed: false,
    })
  })

  test('publicAllowed: staff and owner only; accounts down is false', async () => {
    const s = await setup()
    const q = '{ shareConfig { publicAllowed } }'
    for (const [as, ok] of [
      ['anon', false],
      ['free', false],
      ['ana', false],
      ['down', false],
      ['sol', true],
      ['faku', true],
    ] as const)
      expect((await s.gql(as, q)).data.shareConfig.publicAllowed).toBe(ok)
  })
})

describe('creating', () => {
  test('anonymous: unauthenticated; signed in without subscription: subscription_required', async () => {
    const s = await setup()
    expect(s.code(await s.share('anon'))).toBe('unauthenticated')
    expect(s.code(await s.share('free'))).toBe('subscription_required')
    expect(s.store.query('SELECT * FROM shared_chats')).toHaveLength(0)
  })

  test('subscriber, staff and owner can', async () => {
    const s = await setup()
    for (const as of ['ana', 'sol', 'faku']) {
      const c = await created(s, as)
      expect(c.token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    }
  })

  test('a request from another origin is refused before it runs', async () => {
    const s = await setup()
    const r = await s.h.call('/graphql', {
      json: { query: '{ shareConfig { enabled } }' },
      headers: { origin: 'https://evil.example', 'x-as': 'ana' },
    })
    expect(r.status).toBe(403)
    expect(((await r.json()) as any).error.code).toBe('forbidden_origin')
  })

  test('accounts down: viewer_unavailable, nothing stored', async () => {
    const s = await setup()
    expect(s.code(await s.share('down'))).toBe('viewer_unavailable')
    expect(s.store.query('SELECT * FROM shared_chats')).toHaveLength(0)
  })

  test('public links: staff and owner only, for now', async () => {
    const s = await setup()
    expect(s.code(await s.share('ana', 'public'))).toBe('staff_required')
    expect(s.store.query('SELECT * FROM shared_chats')).toHaveLength(0)
    for (const as of ['sol', 'faku'])
      expect((await created(s, as, 'public')).token).toBeDefined()
  })

  test('audience and ttl are validated', async () => {
    const s = await setup()
    expect(s.code(await s.share('ana', 'everyone'))).toBe('bad_request')
    expect(s.code(await s.share('ana', 'staff', [turn()], 0))).toBe(
      'bad_request',
    )
    expect(s.code(await s.share('ana', 'staff', [turn()], 721))).toBe(
      'bad_request',
    )
    expect(s.code(await s.share('ana', 'staff', [], undefined))).toBe(
      'bad_request',
    )
  })

  test('the default ttl is 7 days; an explicit one is honoured', async () => {
    const s = await setup()
    const a = await created(s)
    expect(Date.parse(a.expiresAt)).toBe(T0 + 168 * HOUR)
    const r = await s.share('ana', 'staff', [turn()], 24)
    expect(Date.parse(r.data.shareChat.expiresAt)).toBe(T0 + 24 * HOUR)
  })

  test('the GraphQL input has no field for anything beyond the allow-list', async () => {
    const s = await setup()
    const r = await s.share('ana', 'staff', [
      turn({ thinking: 'secret', memories: ['x'] }),
    ])
    expect(r.errors).toBeDefined()
    expect(s.store.query('SELECT * FROM shared_chats')).toHaveLength(0)
  })
})

describe('reading a staff link', () => {
  test('anonymous: unauthenticated', async () => {
    const s = await setup()
    const { token } = await created(s)
    const r = await s.read('anon', token)
    expect(s.code(r)).toBe('unauthenticated')
    expect(r.data?.sharedChat ?? null).toBeNull()
  })

  test('signed in without staff role, and not the author: staff_required', async () => {
    const s = await setup()
    const { token } = await created(s, 'ana')
    for (const as of ['free', 'bruno']) {
      const r = await s.read(as, token)
      expect(s.code(r)).toBe('staff_required')
      expect(r.data?.sharedChat ?? null).toBeNull()
    }
  })

  test('staff, owner and the author open it', async () => {
    const s = await setup()
    const { token } = await created(s, 'ana')
    for (const as of ['sol', 'faku', 'ana']) {
      const r = await s.read(as, token)
      expect(r.errors).toBeUndefined()
      expect(r.data.sharedChat.audience).toBe('staff')
      expect(r.data.sharedChat.sharedBy).toBe('ana')
      expect(r.data.sharedChat.turns).toHaveLength(1)
    }
  })

  test('accounts down fails closed', async () => {
    const s = await setup()
    const { token } = await created(s)
    expect(s.code(await s.read('down', token))).toBe('viewer_unavailable')
  })
})

describe('reading a public link', () => {
  test('anonymous opens it and accounts is never asked', async () => {
    const s = await setup()
    const { token } = await created(s, 'sol', 'public')
    const before = s.viewers.resolves
    const r = await s.read('anon', token)
    expect(r.errors).toBeUndefined()
    expect(r.data.sharedChat.audience).toBe('public')
    expect(s.viewers.resolves).toBe(before)
  })

  test('accounts down does not stop a public link', async () => {
    const s = await setup()
    const { token } = await created(s, 'sol', 'public')
    const r = await s.read('down', token)
    expect(r.errors).toBeUndefined()
  })

  test('it never says who shared it, and the viewer id is stored but never returned', async () => {
    const s = await setup()
    const { token } = await created(s, 'sol', 'public')
    const r = await s.read('anon', token)
    expect(r.data.sharedChat.sharedBy).toBeNull()
    expect(JSON.stringify(r)).not.toContain('u-sol')
    expect(JSON.stringify(r)).not.toContain('sol"')
    const row = s.store.query<{ owner_handle: string | null }>(
      'SELECT owner_handle FROM shared_chats',
    )[0]!
    expect(row.owner_handle).toBeNull()
  })
})

describe('what is read back', () => {
  test('sources are rebuilt from the index, not taken from the client', async () => {
    const s = await setup()
    const { token } = await created(s)
    const t = (await s.read('sol', token)).data.sharedChat.turns[0]
    expect(t.sources).toHaveLength(1)
    expect(t.sources[0]).toMatchObject({
      n: 1,
      kind: 'doc',
      slug: 'flujo-de-deploy',
      title: 'Flujo de deploy',
    })
    expect(t.sources[0].path.startsWith('/docs/flujo-de-deploy')).toBe(true)
    expect(t.cited).toEqual([1])
  })

  test('an unknown slug is dropped; an unknown anchor points at the top of the page', async () => {
    const s = await setup()
    const r = await s.share('ana', 'staff', [
      turn({
        sources: [
          { n: 1, slug: 'no-existe', anchor: null },
          { n: 2, slug: 'flujo-de-deploy', anchor: 'inventada' },
          { n: 3, slug: 'x'.repeat(500), anchor: null },
        ],
        cited: [1, 2],
      }),
    ])
    const token = r.data.shareChat.token as string
    const t = (await s.read('sol', token)).data.sharedChat.turns[0]
    expect(t.sources).toHaveLength(1)
    expect(t.sources[0]).toMatchObject({ n: 2, anchor: null, heading: null })
    expect(t.sources[0].path).toBe('/docs/flujo-de-deploy')
  })

  test('text is cleaned of invisible and bidi characters', async () => {
    const s = await setup()
    const r = await s.share('ana', 'staff', [
      turn({
        question: 'hola‮​ mundo\u0007',
        text: 'a⁦b﻿c',
      }),
    ])
    const t = (await s.read('sol', r.data.shareChat.token)).data.sharedChat
      .turns[0]
    expect(t.question).toBe('hola mundo')
    expect(t.text).toBe('abc')
  })

  test('only the allow-listed fields reach the database', async () => {
    const s = await setup()
    // Straight at the service: a caller that skips GraphQL typing still stores nothing extra.
    const h = s.h.deps.share!
    h.create(WHO.ana!, 'ip', {
      audience: 'staff',
      turns: [
        {
          ...turn(),
          thinking: 'razonamiento interno',
          memories: ['mi nombre es X'],
          usage: { inputTokens: 5 },
          steps: [{ id: 'a' }],
          sources: [
            {
              n: 1,
              slug: 'flujo-de-deploy',
              anchor: 'rollback',
              title: 'Falso',
              path: 'https://evil.example',
            } as never,
          ],
        } as never,
      ],
    })
    const raw = s.store.query<{ payload: string }>(
      'SELECT payload FROM shared_chats',
    )[0]!.payload
    for (const leak of [
      'thinking',
      'razonamiento',
      'memories',
      'mi nombre',
      'usage',
      'steps',
      'Falso',
      'evil.example',
    ])
      expect(raw).not.toContain(leak)
    expect(Object.keys(JSON.parse(raw).turns[0]).sort()).toEqual([
      'cited',
      'question',
      'refused',
      'sources',
      'text',
      'truncated',
    ])
  })
})

describe('link secrecy', () => {
  test('the database holds the hash of the token, never the token', async () => {
    const s = await setup()
    const { token } = await created(s)
    const rows = JSON.stringify(s.store.query('SELECT * FROM shared_chats'))
    expect(rows).not.toContain(token)
  })

  test('logs carry ids and counts, never the token, the question or the answer', async () => {
    const s = await setup()
    const { token } = await created(s)
    await s.read('sol', token)
    await s.read('sol', 'x'.repeat(22))
    const all = s.h.logs.join('\n')
    expect(all).toContain('share_created')
    expect(all).toContain('share_read')
    expect(all).not.toContain(token)
    expect(all).not.toContain('rollback')
    expect(all).not.toContain('symlink')
  })

  test('unknown, malformed, expired and revoked all answer the same way', async () => {
    const s = await setup()
    const a = await created(s)
    const b = await created(s)
    await s.revoke('ana', b.id)
    s.clock.t = T0 + 169 * HOUR
    const results = await Promise.all([
      s.read('sol', 'A'.repeat(22)),
      s.read('sol', 'corto'),
      s.read('sol', a.token),
      s.read('sol', b.token),
    ])
    for (const r of results) {
      expect(s.code(r)).toBe('share_not_found')
      expect(r.errors![0]!.message).toBe(results[0]!.errors![0]!.message)
    }
  })
})

describe('expiry', () => {
  test('a link works until its time and then is gone, row included', async () => {
    const s = await setup()
    const { token } = await created(s)
    s.clock.t = T0 + 168 * HOUR - 1
    expect((await s.read('sol', token)).errors).toBeUndefined()
    s.clock.t = T0 + 168 * HOUR
    expect(s.code(await s.read('sol', token))).toBe('share_not_found')
    expect(s.store.query('SELECT * FROM shared_chats')).toHaveLength(0)
  })

  test('purge drops every expired row', async () => {
    const s = await setup()
    await created(s)
    await s.share('ana', 'staff', [turn()], 720)
    s.clock.t = T0 + 200 * HOUR
    expect(s.h.deps.share!.purge()).toBe(1)
    expect(s.store.query('SELECT * FROM shared_chats')).toHaveLength(1)
  })

  test('an expired link no longer counts against the cap nor shows in the list', async () => {
    const s = await setup({ SHARE_MAX_PER_VIEWER: '1' })
    await s.share('ana', 'staff', [turn()], 1)
    expect(s.code(await s.share('ana'))).toBe('share_limit')
    s.clock.t = T0 + 2 * HOUR
    expect((await s.mine('ana')).data.myShares).toEqual([])
    expect((await s.share('ana')).errors).toBeUndefined()
  })
})

describe('revoking', () => {
  test('the author revokes: the link dies and the text is deleted', async () => {
    const s = await setup()
    const { id, token } = await created(s)
    const r = await s.revoke('ana', id)
    expect(r.data.revokeShare).toBe(true)
    expect(s.code(await s.read('sol', token))).toBe('share_not_found')
    expect(s.store.query('SELECT * FROM shared_chats')).toHaveLength(0)
  })

  test('another subscriber cannot, and cannot tell the link exists', async () => {
    const s = await setup()
    const { id, token } = await created(s, 'ana')
    const r = await s.revoke('bruno', id)
    expect(s.code(r)).toBe('share_not_found')
    expect(s.code(await s.revoke('bruno', crypto.randomUUID()))).toBe(
      'share_not_found',
    )
    expect((await s.read('sol', token)).errors).toBeUndefined()
  })

  test('staff and owner can revoke anyone’s', async () => {
    const s = await setup()
    for (const as of ['sol', 'faku']) {
      const { id } = await created(s, 'ana')
      expect((await s.revoke(as, id)).data.revokeShare).toBe(true)
    }
  })

  test('anonymous: unauthenticated', async () => {
    const s = await setup()
    const { id } = await created(s)
    expect(s.code(await s.revoke('anon', id))).toBe('unauthenticated')
    expect(s.store.query('SELECT * FROM shared_chats')).toHaveLength(1)
  })
})

describe('listing', () => {
  test('returns only the caller’s links, without token or text', async () => {
    const s = await setup()
    const a = await created(s, 'ana')
    await created(s, 'bruno')
    const r = await s.mine('ana')
    expect(r.data.myShares).toHaveLength(1)
    expect(r.data.myShares[0]).toMatchObject({
      id: a.id,
      audience: 'staff',
      turns: 1,
      views: 0,
    })
    const raw = JSON.stringify(r)
    expect(raw).not.toContain(a.token)
    expect(raw).not.toContain('symlink')
  })

  test('views count opens, not failed attempts', async () => {
    const s = await setup()
    const { token } = await created(s, 'ana')
    await s.read('sol', token)
    await s.read('faku', token)
    await s.read('bruno', token)
    expect((await s.mine('ana')).data.myShares[0].views).toBe(2)
  })

  test('anonymous: unauthenticated; signed in without subscription: subscription_required', async () => {
    const s = await setup()
    expect(s.code(await s.mine('anon'))).toBe('unauthenticated')
    expect(s.code(await s.mine('free'))).toBe('subscription_required')
  })
})

describe('limits', () => {
  test('turns per chat', async () => {
    const s = await setup({ SHARE_MAX_TURNS: '2' })
    expect(
      s.code(await s.share('ana', 'staff', [turn(), turn(), turn()])),
    ).toBe('bad_request')
    expect(
      (await s.share('ana', 'staff', [turn(), turn()])).errors,
    ).toBeUndefined()
  })

  test('size: a long turn is refused, not truncated', async () => {
    const s = await setup()
    expect(
      s.code(
        await s.share('ana', 'staff', [turn({ text: 'a'.repeat(24_001) })]),
      ),
    ).toBe('payload_too_large')
    expect(
      s.code(
        await s.share('ana', 'staff', [turn({ question: 'q'.repeat(4001) })]),
      ),
    ).toBe('payload_too_large')
  })

  test('total payload bytes', async () => {
    const s = await setup({ SHARE_MAX_BYTES: '1500' })
    expect(
      s.code(await s.share('ana', 'staff', [turn({ text: 'a'.repeat(1800) })])),
    ).toBe('payload_too_large')
    expect((await s.share('ana')).errors).toBeUndefined()
  })

  test('active links per viewer and overall', async () => {
    const s = await setup({ SHARE_MAX_PER_VIEWER: '2', SHARE_MAX_ACTIVE: '3' })
    await created(s, 'ana')
    await created(s, 'ana')
    expect(s.code(await s.share('ana'))).toBe('share_limit')
    await created(s, 'bruno')
    expect(s.code(await s.share('sol'))).toBe('share_limit')
  })

  test('revoking frees a slot', async () => {
    const s = await setup({ SHARE_MAX_PER_VIEWER: '1' })
    const { id } = await created(s, 'ana')
    expect(s.code(await s.share('ana'))).toBe('share_limit')
    await s.revoke('ana', id)
    expect((await s.share('ana')).errors).toBeUndefined()
  })

  test('creating is rate limited per viewer; the owner is exempt', async () => {
    const s = await setup({ RATE_SHARE_CREATE_VIEWER_PER_HOUR: '2' })
    await created(s, 'ana')
    await created(s, 'ana')
    const r = await s.share('ana')
    expect(s.code(r)).toBe('rate_limited')
    expect(
      (r.errors![0]!.extensions as { retryAfter?: number }).retryAfter,
    ).toBeGreaterThan(0)
    // Another viewer is not affected, and the owner never hits the limit.
    await created(s, 'bruno')
    for (let i = 0; i < 4; i++) await created(s, 'faku')
  })

  test('guessing tokens is rate limited; a valid token still opens', async () => {
    const s = await setup({ RATE_SHARE_MISS_IP_PER_MIN: '3' })
    const { token } = await created(s)
    for (let i = 0; i < 3; i++)
      expect(s.code(await s.read('sol', 'B'.repeat(22)))).toBe(
        'share_not_found',
      )
    expect(s.code(await s.read('sol', 'B'.repeat(22)))).toBe('rate_limited')
    expect((await s.read('sol', token)).errors).toBeUndefined()
  })

  test('reads are rate limited per IP', async () => {
    const s = await setup({ RATE_SHARE_READ_IP_PER_MIN: '2' })
    const { token } = await created(s, 'sol', 'public')
    await s.read('anon', token)
    await s.read('anon', token)
    expect(s.code(await s.read('anon', token))).toBe('rate_limited')
  })

  test('/graphql refuses a huge body before executing it', async () => {
    const s = await setup()
    const r = await s.h.call('/graphql', {
      method: 'POST',
      body: JSON.stringify({ query: '{ shareConfig { enabled } }' }),
      headers: {
        'content-type': 'application/json',
        'content-length': String(200 * 1024),
      },
    })
    expect(r.status).toBe(413)
  })
})

describe('store', () => {
  test('two requests cannot both slip under the cap', () => {
    const store = new ShareStore(':memory:')
    const mk = (n: number) => ({
      id: `id${n}`,
      tokenHash: `h${n}`,
      ownerId: 'u',
      ownerHandle: null,
      audience: 'staff' as const,
      createdAt: T0,
      expiresAt: T0 + HOUR,
      turns: 1,
      payload: '{}',
    })
    const caps = { perViewer: 1, active: 10 }
    expect(store.create(mk(1), caps, T0)).toBe('ok')
    expect(store.create(mk(2), caps, T0)).toBe('viewer_limit')
  })
})
