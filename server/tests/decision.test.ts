import { describe, expect, test } from 'bun:test'
import { ConfigError } from '../src/errors.ts'
import {
  D1FollowUpDecider,
  type FollowUpDecider,
  type FollowUpInput,
} from '../src/decision/followup.ts'
import { harness, parseSse, testConfig } from './helpers.ts'

const reply = (noul: unknown, status = 200) =>
  (async () =>
    new Response(
      JSON.stringify({ answers: { followup: { type: 'noul', noul } } }),
      {
        status,
      },
    )) as unknown as typeof fetch

const make = (f: typeof fetch, threshold = 0.25) =>
  new D1FollowUpDecider({
    url: 'http://127.0.0.1:8081',
    timeoutMs: 1000,
    threshold,
    fetch: f,
  })

const input: FollowUpInput = {
  lastUser: 'como funciona el deploy',
  lastAssistant: 'un push a main dispara el workflow',
  question: 'y si falla?',
}

describe('D1FollowUpDecider', () => {
  test('compares the calibrated probability with the threshold', async () => {
    expect(await make(reply(0.3)).dependsOnHistory(input)).toBe(true)
    expect(await make(reply(0.2)).dependsOnHistory(input)).toBe(false)
    expect(await make(reply(0.2), 0.1).dependsOnHistory(input)).toBe(true)
  })

  test('sends only the question state to /v1/systemone, no auth, no tools', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const d = make((async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(
        JSON.stringify({ answers: { followup: { noul: 0.9 } } }),
      )
    }) as unknown as typeof fetch)
    await d.dependsOnHistory(input)
    expect(seen!.url).toBe('http://127.0.0.1:8081/v1/systemone')
    const body = JSON.parse(String(seen!.init.body))
    expect(body.state).toContain('y si falla?')
    expect(body.state).toContain('como funciona el deploy')
    expect(body.questions.followup.type).toBe('noul')
    expect(Object.keys(body)).toEqual(['state', 'questions'])
    expect(Object.keys(seen!.init.headers as object)).not.toContain(
      'authorization',
    )
  })

  test('any failure is null (the chat then keeps its old behaviour)', async () => {
    expect(await make(reply(0.9, 500)).dependsOnHistory(input)).toBeNull()
    expect(await make(reply('x')).dependsOnHistory(input)).toBeNull()
    expect(await make(reply(Number.NaN)).dependsOnHistory(input)).toBeNull()
    const dead = make((async () => {
      throw new TypeError('ECONNREFUSED')
    }) as unknown as typeof fetch)
    expect(await dead.dependsOnHistory(input)).toBeNull()
    const slow = new D1FollowUpDecider({
      url: 'http://127.0.0.1:8081',
      timeoutMs: 100,
      threshold: 0.25,
      fetch: ((_u: string, init: RequestInit) =>
        new Promise((_r, rej) =>
          init.signal?.addEventListener('abort', () =>
            rej(new Error('aborted')),
          ),
        )) as unknown as typeof fetch,
    })
    expect(await slow.dependsOnHistory(input)).toBeNull()
  })
})

describe('follow-up gate in the chat', () => {
  const history = [
    { role: 'user', content: 'como funciona el rollback del deploy' },
    { role: 'assistant', content: 'cambia el symlink al slot anterior' },
  ]
  const ask = async (
    decider: FollowUpDecider | undefined,
    question: string,
  ) => {
    const h = await harness({ decider })
    const res = await h.call('/chat', { json: { question, history } })
    return { h, events: parseSse(await res.text()) }
  }
  const decide = (v: boolean | null): FollowUpDecider => ({
    dependsOnHistory: async () => v,
  })

  test('standalone: the previous topic is not in the retrieval query', async () => {
    const d = await ask(decide(false), 'como dibujar texto en pantalla')
    const sources = (e: ReturnType<typeof parseSse>) =>
      e
        .find((x) => x.event === 'sources')!
        .data.sources.map((s: { slug: string }) => s.slug)
    expect(sources(d.events)[0]).toBe('dibujar-texto')
    const without = await ask(undefined, 'como dibujar texto en pantalla')
    // The old behaviour mixes the deploy topic in; the gate must rank the drawing doc no lower.
    expect(sources(without.events)).toContain('dibujar-texto')
    expect(sources(d.events).indexOf('dibujar-texto')).toBeLessThanOrEqual(
      sources(without.events).indexOf('dibujar-texto'),
    )
  })

  test('null or true keep the history in the query; the log says what happened', async () => {
    for (const v of [true, null]) {
      const { h } = await ask(decide(v), 'y si falla?')
      const line = h.logs
        .map((l) => JSON.parse(l))
        .find((l) => l.route === 'chat')
      if (v === null) expect(line.usedHistory).toBeUndefined()
      else expect(line.usedHistory).toBe(true)
    }
    const { h } = await ask(decide(false), 'como dibujar texto')
    const line = h.logs
      .map((l) => JSON.parse(l))
      .find((l) => l.route === 'chat')
    expect(line.usedHistory).toBe(false)
  })

  test('no history: the decider is never asked', async () => {
    let calls = 0
    const h = await harness({
      decider: {
        dependsOnHistory: async () => {
          calls++
          return false
        },
      },
    })
    await h.call('/chat', { json: { question: 'como dibujar texto' } })
    expect(calls).toBe(0)
  })
})

describe('decision config', () => {
  test('off by default; loopback only; threshold bounded', () => {
    expect(testConfig().decision.url).toBe('')
    expect(
      testConfig({ DECISION_URL: 'http://127.0.0.1:8081/' }).decision,
    ).toEqual({
      url: 'http://127.0.0.1:8081',
      timeoutMs: 1500,
      followUpThreshold: 0.25,
    })
    expect(() =>
      testConfig({ DECISION_URL: 'https://decide.example' }),
    ).toThrow(ConfigError)
    expect(() => testConfig({ DECISION_FOLLOWUP_THRESHOLD: '2' })).toThrow(
      ConfigError,
    )
  })
})
