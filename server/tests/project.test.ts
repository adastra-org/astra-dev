import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parseComplexity } from '../src/project/complexity.ts'
import {
  computeBurndown,
  computeEvolution,
  mapMilestones,
  windowDays,
  type RawIssue,
} from '../src/project/evolution.ts'
import { GithubClient, GithubError, nextLink } from '../src/project/github.ts'
import {
  DisabledChecklistSource,
  groupItems,
  MyChecklistSource,
} from '../src/project/mychecklist.ts'
import { parsePlan } from '../src/project/plan.ts'
import { ProjectService } from '../src/project/service.ts'
import { silentLogger } from '../src/log.ts'
import { harness } from './helpers.ts'

const NOW = Date.parse('2026-11-12T12:00:00Z')

describe('parsePlan', () => {
  const md = `# Plan

## Orden

| M5 | x | 0.10.0 |

## M3 — Ask Ether (0.4.0)

- [x] Búsqueda léxica **sin IA**: [cmdk](../cmdk/README.md), verificado.
- [ ] Índice de \`embeddings\`

Estado del server de Ask Ether (v0.4.0):

- [~] Índice: parcial
  continúa en otra línea
- [ ] Caché

## M5 — Proyecto: checklist y evolución (0.10.0)

- [ ] Integración

## Decisiones abiertas

- [ ] esto no es de un milestone
`

  test('milestones, estados y conteos', () => {
    const plan = parsePlan(md)
    expect(plan.map((m) => [m.id, m.version])).toEqual([
      ['M3', '0.4.0'],
      ['M5', '0.10.0'],
    ])
    const m3 = plan[0]!
    expect([m3.done, m3.partial, m3.total]).toEqual([1, 1, 4])
    expect(m3.groups).toHaveLength(2)
    expect(m3.groups[0]!.label).toBeNull()
    expect(m3.groups[1]!.label).toBe('Estado del server de Ask Ether (v0.4.0):')
    expect(m3.groups[0]!.items[0]).toEqual({
      state: 'done',
      text: 'Búsqueda léxica sin IA: cmdk, verificado.',
    })
    expect(m3.groups[1]!.items[0]).toEqual({
      state: 'partial',
      text: 'Índice: parcial continúa en otra línea',
    })
  })

  test('los checkboxes fuera de un milestone se ignoran', () => {
    expect(
      parsePlan(md)
        .flatMap((m) => m.groups)
        .flat(),
    ).toHaveLength(3)
    expect(parsePlan(md)[1]!.total).toBe(1)
  })

  test('el plan real del repo se lee completo', () => {
    const real = parsePlan(
      readFileSync(
        new URL('../../docs/plan/README.md', import.meta.url),
        'utf8',
      ),
    )
    expect(real.map((m) => m.id)).toEqual(['M0', 'M1', 'M2', 'M3', 'M4', 'M5'])
    for (const m of real) expect(m.total).toBeGreaterThan(0)
  })
})

describe('evolución', () => {
  const issues: RawIssue[] = [
    {
      number: 1,
      state: 'open',
      created_at: '2026-11-01T10:00:00Z',
      closed_at: null,
      milestone: { number: 7 },
    },
    {
      number: 2,
      state: 'closed',
      created_at: '2026-11-03T10:00:00Z',
      closed_at: '2026-11-10T09:00:00Z',
      milestone: { number: 7 },
    },
    {
      number: 3,
      state: 'open',
      created_at: '2026-11-05T10:00:00Z',
      closed_at: null,
      milestone: { number: 7 },
      pull_request: {},
    },
    {
      number: 4,
      state: 'closed',
      created_at: '2026-10-01T10:00:00Z',
      closed_at: '2026-11-11T23:59:00Z',
      milestone: null,
    },
    {
      number: 5,
      state: 'open',
      created_at: '2026-11-12T01:00:00Z',
      closed_at: null,
      milestone: { number: 7 },
    },
  ]
  const milestones = mapMilestones([
    {
      number: 7,
      title: 'M5',
      state: 'open',
      due_on: '2026-11-22T00:00:00Z',
      open_issues: 2,
      closed_issues: 1,
      html_url: 'https://x/7',
    },
  ])

  test('windowDays: fechas UTC, la más vieja primero', () => {
    expect(windowDays(NOW, 3)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ])
  })

  test('abiertos y cerrados por día, sin contar los pull requests', () => {
    const ev = computeEvolution({
      repo: 'o/r',
      ref: 'dev',
      now: NOW,
      days: 3,
      issuesAndPrs: issues,
      pulls: [
        { number: 3, state: 'open', merged_at: null },
        { number: 9, state: 'closed', merged_at: '2026-11-11T00:00:00Z' },
      ],
      commits: [
        { commit: { author: { date: '2026-11-11T08:00:00Z' } } },
        { commit: { author: { date: '2026-11-11T20:00:00Z' } } },
        { commit: { author: { date: '2026-11-12T08:00:00Z' } } },
        { commit: { author: null } },
      ],
      milestones,
      truncated: false,
    })
    expect(ev.daily).toEqual([
      { date: '2026-11-10', opened: 0, closed: 1, commits: 0, open: 2 },
      { date: '2026-11-11', opened: 0, closed: 1, commits: 2, open: 1 },
      { date: '2026-11-12', opened: 1, closed: 0, commits: 1, open: 2 },
    ])
    expect(ev.totals).toEqual({
      openIssues: 2,
      closedIssues: 2,
      openPrs: 1,
      mergedPrs: 1,
      commits: 3,
    })
  })

  test('burndown del milestone con su línea ideal hasta la fecha de entrega', () => {
    const dates = windowDays(NOW, 3)
    const b = computeBurndown(issues, milestones[0]!, dates)
    expect(b.milestone?.number).toBe(7)
    // #1 abierto, #2 cerrado el 10, #5 creado el 12 (el PR #3 no cuenta).
    expect(b.points).toEqual([
      { date: '2026-11-10', remaining: 1 },
      { date: '2026-11-11', remaining: 1 },
      { date: '2026-11-12', remaining: 2 },
    ])
    expect(b.ideal).not.toBeNull()
    expect(b.ideal![0]!.remaining).toBe(1)
    expect(b.ideal![2]!.remaining).toBeLessThan(b.ideal![0]!.remaining)
  })

  test('sin milestone con fecha: cuenta todo el repo y no hay línea ideal', () => {
    const b = computeBurndown(issues, null, ['2026-11-12'])
    expect(b.milestone).toBeNull()
    expect(b.ideal).toBeNull()
    expect(b.points[0]!.remaining).toBe(2)
  })

  test('una fecha de entrega anterior a la ventana no proyecta nada', () => {
    const past = { ...milestones[0]!, dueOn: '2026-10-01T00:00:00Z' }
    expect(computeBurndown(issues, past, ['2026-11-12']).ideal).toBeNull()
  })
})

describe('GithubClient', () => {
  const json = (body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { headers })

  test('envía el token solo en la cabecera y reusa el ETag (304)', async () => {
    const calls: { url: string; headers: Headers }[] = []
    const gh = new GithubClient({
      token: 'ghp_secret',
      fetch: (async (url: string, init: RequestInit) => {
        const headers = new Headers(init.headers)
        calls.push({ url, headers })
        if (headers.get('if-none-match') === '"v1"')
          return new Response(null, { status: 304 })
        return json([{ a: 1 }], { etag: '"v1"' })
      }) as unknown as typeof fetch,
    })
    const first = await gh.page<unknown[]>('/repos/o/r/issues')
    const second = await gh.page<unknown[]>('/repos/o/r/issues')
    expect(first?.data).toEqual([{ a: 1 }])
    expect(second?.data).toEqual([{ a: 1 }])
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer ghp_secret')
    expect(calls[0]!.url).not.toContain('ghp_secret')
    expect(calls[1]!.headers.get('if-none-match')).toBe('"v1"')
    expect(gh.stats).toEqual({ requests: 2, notModified: 1 })
  })

  test('pagina con rel="next" y avisa si cortó', async () => {
    const gh = new GithubClient({
      token: 't',
      fetch: (async (url: string) => {
        const n = Number(new URL(url).searchParams.get('page') ?? '1')
        return json([n], {
          link: `<https://api.github.com/x?page=${n + 1}>; rel="next"`,
        })
      }) as unknown as typeof fetch,
    })
    const r = await gh.paginate<number>('/x', 3)
    expect(r.items).toEqual([1, 2, 3])
    expect(r.truncated).toBe(true)
  })

  test('no sigue un enlace a otro host (no manda el token afuera)', async () => {
    let sent = 0
    const gh = new GithubClient({
      token: 't',
      fetch: (async () => {
        sent++
        return json([1], { link: '<https://evil.example/steal>; rel="next"' })
      }) as unknown as typeof fetch,
    })
    await expect(gh.paginate('/x', 5)).rejects.toBeInstanceOf(GithubError)
    expect(sent).toBe(1)
  })

  test('errores sin el token y 404 como null', async () => {
    const gh = new GithubClient({
      token: 'ghp_secret',
      fetch: (async (url: string) =>
        url.endsWith('/missing')
          ? new Response('no', { status: 404 })
          : new Response('{"message":"ghp_secret"}', {
              status: 403,
            })) as unknown as typeof fetch,
    })
    expect(await gh.page('/missing')).toBeNull()
    const err = await gh.page('/denied').catch((e: Error) => e)
    expect(err).toBeInstanceOf(GithubError)
    expect((err as GithubError).status).toBe(403)
    expect((err as Error).message).not.toContain('ghp_secret')
  })

  test('nextLink', () => {
    expect(nextLink(null)).toBeNull()
    expect(
      nextLink('<https://a/1>; rel="prev", <https://a/3>; rel="next"'),
    ).toBe('https://a/3')
  })
})

describe('MyChecklist', () => {
  const items = [
    {
      id: 'h1',
      shortId: 'AA-1',
      parentId: null,
      text: '**Bloqueantes**',
      done: false,
    },
    {
      id: 'i1',
      shortId: 'AA-2',
      parentId: 'h1',
      text: 'Encontrar los drafts',
      done: false,
    },
    {
      id: 'i2',
      shortId: 'AA-3',
      parentId: 'h1',
      text: 'Fórmula de vehículos',
      done: true,
    },
    {
      id: 'loose',
      shortId: 'AA-4',
      parentId: null,
      text: 'Suelto',
      done: false,
    },
    { bad: true },
  ]

  test('agrupa por item padre y cuenta abiertos', async () => {
    let body: { code: string } | null = null
    const src = new MyChecklistSource({
      baseUrl: 'https://checklist.example/',
      token: 'mck_secret',
      listName: 'Ad Astra',
      fetch: (async (url: string, init: RequestInit) => {
        expect(url).toBe('https://checklist.example/codemode/execute')
        expect(new Headers(init.headers).get('authorization')).toBe(
          'Bearer mck_secret',
        )
        body = JSON.parse(String(init.body))
        return Response.json({ ok: true, result: { name: 'Ad Astra', items } })
      }) as unknown as typeof fetch,
    })
    const r = await src.load()
    expect(r.status).toBe('ok')
    expect(r.groups.map((g) => g.title)).toEqual(['Bloqueantes', 'Sin grupo'])
    expect([r.open, r.total]).toEqual([2, 3])
    // El nombre de la lista entra como JSON, y el script solo lee.
    expect(body!.code).toContain('"Ad Astra"')
    expect(body!.code).not.toMatch(/\.(create|delete|updateText|setDone)\(/)
  })

  test('nombre con comillas no rompe el script', async () => {
    let code = ''
    const src = new MyChecklistSource({
      baseUrl: 'https://c.example',
      token: 'mck_x',
      listName: 'a"); codemode.checklist.lists.delete({id:"x"}); ("',
      fetch: (async (_u: string, init: RequestInit) => {
        code = JSON.parse(String(init.body)).code
        return Response.json({ ok: true, result: null })
      }) as unknown as typeof fetch,
    })
    expect((await src.load()).status).toBe('not_found')
    expect(code).toContain(
      JSON.stringify('a"); codemode.checklist.lists.delete({id:"x"}); ("'),
    )
  })

  test('errores y respuestas raras no lanzan', async () => {
    const mk = (f: () => Promise<Response>) =>
      new MyChecklistSource({
        baseUrl: 'https://c.example',
        token: 'mck_x',
        listName: 'L',
        fetch: f as unknown as typeof fetch,
      })
    expect(
      (await mk(async () => new Response('', { status: 401 })).load()).status,
    ).toBe('error')
    expect(
      (await mk(async () => Response.json({ ok: false })).load()).status,
    ).toBe('error')
    expect(
      (
        await mk(async () =>
          Response.json({ ok: true, result: { items: 5 } }),
        ).load()
      ).status,
    ).toBe('error')
    expect(
      (
        await mk(async () => {
          throw new TypeError('down')
        }).load()
      ).status,
    ).toBe('error')
  })

  test('sin token queda deshabilitado', async () => {
    expect((await new DisabledChecklistSource('L').load()).status).toBe(
      'disabled',
    )
  })

  test('groupItems sin padres', () => {
    expect(
      groupItems([
        { id: 'a', shortId: null, parentId: null, text: 'x', done: true },
      ]),
    ).toEqual([
      {
        title: null,
        items: [{ id: 'a', shortId: null, text: 'x', done: true }],
      },
    ])
  })
})

describe('parseComplexity', () => {
  test('valida y ordena; descarta lo mal formado', () => {
    const r = parseComplexity(
      JSON.stringify({
        repo: 'o/r',
        series: [
          {
            date: '2026-11-02',
            sha: 'b'.repeat(40),
            files: 10,
            lines: 100,
            docLines: 5,
            churn: 7,
          },
          {
            date: '2026-11-01',
            sha: 'a',
            files: 9,
            lines: 90,
            docLines: 4,
            churn: 3,
          },
          { date: 'ayer', sha: 'a', files: 1, lines: 1, docLines: 1, churn: 1 },
          {
            date: '2026-11-03',
            sha: 'a',
            files: -1,
            lines: 1,
            docLines: 1,
            churn: 1,
          },
          null,
        ],
      }),
    )
    expect(r?.series.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-02'])
    expect(r?.series[1]!.sha).toHaveLength(12)
  })
  test('JSON inválido o sin forma es null', () => {
    expect(parseComplexity('{')).toBeNull()
    expect(parseComplexity('[]')).toBeNull()
    expect(parseComplexity('{"repo":1}')).toBeNull()
  })
})

// ---- servicio, caché y permisos ----------------------------------------------------------------

function fakeGithub() {
  const hits: string[] = []
  const state = { fail: false }
  const fetchFn = (async (url: string) => {
    const u = new URL(url)
    hits.push(u.pathname)
    if (state.fail) return new Response('boom', { status: 500 })
    const p = u.pathname
    if (p.endsWith('/issues'))
      return Response.json([
        {
          number: 1,
          state: 'open',
          created_at: '2026-11-05T10:00:00Z',
          closed_at: null,
          milestone: { number: 7 },
        },
      ])
    if (p.endsWith('/pulls')) return Response.json([])
    if (p.endsWith('/commits'))
      return Response.json([
        { commit: { author: { date: '2026-11-11T10:00:00Z' } } },
      ])
    if (p.endsWith('/milestones'))
      return Response.json([
        {
          number: 7,
          title: 'M5',
          state: 'open',
          due_on: '2026-11-30T00:00:00Z',
          open_issues: 1,
          closed_issues: 0,
          html_url: 'https://x',
        },
      ])
    if (p.endsWith('/contents/docs/plan/README.md'))
      return new Response('## M5 — Proyecto (0.10.0)\n\n- [x] a\n- [ ] b\n')
    if (p.endsWith('/contents/docs/project/complexity.json'))
      return new Response(
        JSON.stringify({
          repo: 'o/r',
          series: [
            {
              date: '2026-11-01',
              sha: 'abc',
              files: 3,
              lines: 30,
              docLines: 3,
              churn: 1,
            },
          ],
        }),
      )
    return new Response('', { status: 404 })
  }) as unknown as typeof fetch
  return { hits, state, fetchFn }
}

function service(clock: { now: number }) {
  const g = fakeGithub()
  const svc = new ProjectService({
    github: new GithubClient({ token: 't', fetch: g.fetchFn }),
    repo: 'o/r',
    ref: 'dev',
    planPath: 'docs/plan/README.md',
    complexityPath: 'docs/project/complexity.json',
    checklist: new DisabledChecklistSource('Ad Astra'),
    ttlMs: 60_000,
    viewerPerMin: 3,
    logger: silentLogger,
    now: () => clock.now,
  })
  return { svc, ...g }
}

describe('ProjectService', () => {
  test('cachea dentro del TTL y recarga después', async () => {
    const clock = { now: NOW }
    const { svc, hits } = service(clock)
    await svc.evolution(30)
    const after = hits.length
    await svc.evolution(14, 7)
    expect(hits.length).toBe(after)
    clock.now += 61_000
    await svc.evolution(30)
    expect(hits.length).toBeGreaterThan(after)
  })

  test('cargas concurrentes comparten una sola ida a GitHub', async () => {
    const { svc, hits } = service({ now: NOW })
    await Promise.all([svc.evolution(30), svc.evolution(30), svc.evolution(7)])
    expect(hits.filter((p) => p.endsWith('/issues'))).toHaveLength(1)
  })

  test('si GitHub falla sirve la última copia marcada como vieja', async () => {
    const clock = { now: NOW }
    const { svc, state } = service(clock)
    expect((await svc.evolution(30)).stale).toBe(false)
    state.fail = true
    clock.now += 61_000
    const ev = await svc.evolution(30)
    expect(ev.stale).toBe(true)
    expect(ev.totals.openIssues).toBe(1)
  })

  test('sin copia previa y GitHub caído: project_unavailable', async () => {
    const { svc, state } = service({ now: NOW })
    state.fail = true
    await expect(svc.evolution(30)).rejects.toMatchObject({
      code: 'project_unavailable',
    })
  })

  test('checklist y complejidad', async () => {
    const { svc } = service({ now: NOW })
    const c = await svc.checklist()
    expect(c.plan[0]).toMatchObject({ id: 'M5', done: 1, total: 2 })
    expect(c.milestones[0]).toMatchObject({ number: 7, open: 1 })
    expect(c.external.status).toBe('disabled')
    expect((await svc.complexity())?.series).toHaveLength(1)
  })
})

describe('GraphQL project (permisos)', () => {
  const query = `{ project { evolution(days: 7) { repo daily { date } } checklist { plan { id } } complexity { series { files } } } }`
  const post = (h: Awaited<ReturnType<typeof harness>>) =>
    h.call('/graphql', {
      json: { query },
      headers: { origin: 'https://development.adastrarp.com' },
    })

  async function withProject(role: 'public' | 'subscriber' | 'staff') {
    const h = await harness({ role })
    h.deps.project = service({ now: NOW }).svc
    return h
  }

  test('staff lo ve completo', async () => {
    const res = await post(await withProject('staff'))
    const body = (await res.json()) as any
    expect(body.errors).toBeUndefined()
    expect(body.data.project.evolution.repo).toBe('o/r')
    expect(body.data.project.evolution.daily).toHaveLength(7)
    expect(body.data.project.checklist.plan[0].id).toBe('M5')
    expect(body.data.project.complexity.series[0].files).toBe(3)
  })

  test('anónimo: unauthenticated; suscriptor: staff_required', async () => {
    const anon = (await (await post(await withProject('public'))).json()) as any
    expect(anon.errors[0].extensions.code).toBe('unauthenticated')
    expect(anon.data.project).toBeNull()
    const sub = (await (
      await post(await withProject('subscriber'))
    ).json()) as any
    expect(sub.errors[0].extensions.code).toBe('staff_required')
    expect(sub.data.project).toBeNull()
  })

  test('sin token de GitHub configurado: project_unavailable', async () => {
    const h = await harness({ role: 'staff' })
    const body = (await (await post(h)).json()) as any
    expect(body.errors[0].extensions.code).toBe('project_unavailable')
  })

  test('rate limit por viewer', async () => {
    const h = await withProject('staff')
    const codes: string[] = []
    for (let i = 0; i < 5; i++) {
      const b = (await (await post(h)).json()) as any
      codes.push(b.errors?.[0]?.extensions?.code ?? 'ok')
    }
    expect(codes).toEqual(['ok', 'ok', 'ok', 'rate_limited', 'rate_limited'])
  })

  test('days fuera de rango es bad_request', async () => {
    const h = await withProject('staff')
    const res = await h.call('/graphql', {
      json: { query: '{ project { evolution(days: 500) { days } } }' },
    })
    const body = (await res.json()) as any
    expect(body.errors[0].extensions.code).toBe('bad_request')
  })
})
