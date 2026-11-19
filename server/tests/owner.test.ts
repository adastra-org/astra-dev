// The owner role: how it is granted, and what it is exempt from. Every exemption has a control that
// shows the same sequence still limits a staff member.
import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config.ts'
import { ConfigError } from '../src/errors.ts'
import { silentLogger } from '../src/log.ts'
import { policyFor } from '../src/policy.ts'
import { GithubClient } from '../src/project/github.ts'
import { DisabledChecklistSource } from '../src/project/mychecklist.ts'
import { ProjectService } from '../src/project/service.ts'
import {
  ANONYMOUS,
  OwnerOverlayViewerPort,
  atLeast,
  parseViewer,
  type Viewer,
  type ViewerPort,
} from '../src/viewer.ts'
import { harness, parseSse, testConfig } from './helpers.ts'

const staffPayload = (id = 'u-owner') => ({
  id,
  handle: 'faku',
  role: 'staff',
  emailVerified: true,
  entitlements: [],
})
const port = (payload: unknown): ViewerPort => ({
  resolve: () => Promise.resolve(parseViewer(payload)),
})
const req = new Request('http://localhost/chat')

describe('owner: how it is granted', () => {
  test('id in OWNER_IDS and staff in accounts: owner', async () => {
    const v = await new OwnerOverlayViewerPort(port(staffPayload()), [
      'u-owner',
    ]).resolve(req)
    expect(v.role).toBe('owner')
    expect(v.id).toBe('u-owner')
  })

  test('id in OWNER_IDS but accounts says member: not owner', async () => {
    const v = await new OwnerOverlayViewerPort(
      port({ ...staffPayload(), role: 'member' }),
      ['u-owner'],
    ).resolve(req)
    expect(v.role).toBe('public')
  })

  test('a subscriber in OWNER_IDS stays a subscriber', async () => {
    const v = await new OwnerOverlayViewerPort(
      port({
        ...staffPayload(),
        role: 'member',
        entitlements: [{ kind: 'tebex-subscriber', validUntil: null }],
      }),
      ['u-owner'],
    ).resolve(req)
    expect(v.role).toBe('subscriber')
  })

  test('staff not in OWNER_IDS stays staff', async () => {
    const v = await new OwnerOverlayViewerPort(port(staffPayload('u-other')), [
      'u-owner',
    ]).resolve(req)
    expect(v.role).toBe('staff')
  })

  test('empty OWNER_IDS: nobody is owner', () => {
    expect(testConfig().ownerIds).toEqual([])
    expect(testConfig({ OWNER_IDS: ' , ' }).ownerIds).toEqual([])
  })

  test('a malformed OWNER_IDS entry fails the boot', () => {
    expect(() =>
      loadConfig({ LLM_PROVIDER: 'fake', OWNER_IDS: 'ok, bad id!' }),
    ).toThrow(ConfigError)
  })

  test('the anonymous viewer is never promoted', async () => {
    const inner: ViewerPort = { resolve: () => Promise.resolve(ANONYMOUS) }
    const v = await new OwnerOverlayViewerPort(inner, ['']).resolve(req)
    expect(v.role).toBe('public')
  })

  test('owner implies staff, and nothing below does', () => {
    expect(atLeast('owner', 'staff')).toBe(true)
    expect(atLeast('staff', 'owner')).toBe(false)
    expect(atLeast('subscriber', 'staff')).toBe(false)
  })

  test('ASTRA_DEV_VIEWER=owner works in dev and is ignored in production', () => {
    expect(testConfig({ ASTRA_DEV_VIEWER: 'owner' }).devViewer).toBe('owner')
    expect(
      loadConfig({
        NODE_ENV: 'production',
        DEEPSEEK_API_KEY: 'k',
        ASTRA_DEV_VIEWER: 'owner',
      }).devViewer,
    ).toBeNull()
  })
})

describe('owner: what it skips', () => {
  type H = Awaited<ReturnType<typeof harness>>
  const chat = (h: H, q = 'deploy') =>
    h.call('/chat', { json: { question: q } })

  test('policy: owner skips quotas, others keep them', () => {
    const cfg = testConfig()
    expect(policyFor({ role: 'owner' }, cfg)).toMatchObject({
      rateLimits: false,
      viewerBudget: false,
      globalBudget: false,
      sizeCaps: false,
      maxRounds: cfg.limits.ownerMaxRounds,
    })
    for (const role of ['public', 'subscriber', 'staff'] as const)
      expect(policyFor({ role }, cfg)).toMatchObject({
        rateLimits: true,
        viewerBudget: true,
        globalBudget: true,
        sizeCaps: true,
      })
  })

  test('chat rate limits: owner never gets 429, staff does (same sequence)', async () => {
    const env = { RATE_CHAT_VIEWER_PER_MIN: '2', RATE_CHAT_IP_PER_MIN: '2' }
    const owner = await harness({ role: 'owner', env })
    for (let i = 0; i < 6; i++) {
      const r = await chat(owner)
      expect(r.status).toBe(200)
      await r.text()
    }
    const staff = await harness({ role: 'staff', env })
    const seen: number[] = []
    for (let i = 0; i < 6; i++) {
      const r = await chat(staff)
      seen.push(r.status)
      await r.text()
    }
    expect(seen).toContain(429)
  })

  test('daily budget (viewer and global): owner never gets budget_exceeded, staff does', async () => {
    const env = { DAILY_TOKENS_VIEWER: '1000', DAILY_TOKENS_GLOBAL: '1000' }
    const owner = await harness({ role: 'owner', env })
    for (let i = 0; i < 3; i++) {
      const r = await chat(owner, `deploy ${i}`)
      expect(r.status).toBe(200)
      await r.text()
    }
    const staff = await harness({ role: 'staff', env })
    const r = await chat(staff)
    expect(r.status).toBe(429)
    expect((await r.json()).error.code).toBe('budget_exceeded')
  })

  test('size caps: a long question is cut for staff, whole for owner', async () => {
    const long = `deploy ${'x'.repeat(400)}`
    const env = { CHAT_MAX_QUESTION_CHARS: '200' }
    const sent = async (role: 'staff' | 'owner') => {
      const h = await harness({ role, env })
      await (await chat(h, long)).text()
      return h.llm.requests[0]!.messages.map((m) => m.content).join('\n')
    }
    expect(await sent('staff')).not.toContain('x'.repeat(300))
    expect(await sent('owner')).toContain('x'.repeat(300))
  })

  test('the request body cap still applies to the owner', async () => {
    const h = await harness({
      role: 'owner',
      env: { CHAT_MAX_BODY_BYTES: '1024' },
    })
    const r = await chat(h, `deploy ${'x'.repeat(4000)}`)
    expect(r.status).toBe(413)
  })

  test('search rate limit: owner (cookie) is exempt, anonymous and staff are not', async () => {
    const q = { query: '{ searchDocs(q: "deploy") { hits { slug } } }' }
    const run = async (role: 'owner' | 'staff', cookie: boolean) => {
      const h = await harness({ role, env: { RATE_SEARCH_IP_PER_MIN: '1' } })
      const failed: boolean[] = []
      for (let i = 0; i < 3; i++) {
        const r = await h.call('/graphql', {
          json: q,
          headers: cookie ? { cookie: 'session=1' } : {},
        })
        failed.push(!!(await r.json()).errors)
      }
      return failed
    }
    expect(await run('owner', true)).toEqual([false, false, false])
    expect((await run('staff', true)).some(Boolean)).toBe(true)
    expect((await run('owner', false)).some(Boolean)).toBe(true)
  })

  test('project rate limit: owner exempt, staff limited', () => {
    const svc = new ProjectService({
      github: new GithubClient({
        token: 't',
        fetch: (async () =>
          new Response('', { status: 404 })) as unknown as typeof fetch,
      }),
      repo: 'o/r',
      ref: 'dev',
      planPath: 'docs/plan/README.md',
      complexityPath: 'docs/project/complexity.json',
      checklist: new DisabledChecklistSource('Ad Astra'),
      ttlMs: 60_000,
      viewerPerMin: 2,
      logger: silentLogger,
      now: () => 1_000,
    })
    const mk = (role: Viewer['role']): Viewer => ({
      id: `id-${role}`,
      handle: role,
      role,
      emailVerified: true,
      entitlements: [],
    })
    const cfg = testConfig()
    const owner = mk('owner')
    for (let i = 0; i < 10; i++) svc.authorize(owner, policyFor(owner, cfg))
    const staff = mk('staff')
    svc.authorize(staff, policyFor(staff, cfg))
    svc.authorize(staff, policyFor(staff, cfg))
    expect(() => svc.authorize(staff, policyFor(staff, cfg))).toThrow()
    expect(() => svc.authorize(mk('subscriber'))).toThrow()
  })

  test('owner can chat end to end', async () => {
    const h = await harness({ role: 'owner' })
    const events = parseSse(await (await chat(h)).text()).map((e) => e.event)
    expect(events).toContain('done')
  })
})
