import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Diagnostic } from '@/lib/sandbox/lint'
import type { RunResult } from '@/lib/sandbox/run'
import { SseParser } from './sse'
import {
  AskStore,
  MAX_TOOL_ROUNDS,
  STEP_TEXT_MAX,
  applyEvent,
  emptyTurn,
  stepsFor,
  type Turn,
} from './store'
import {
  UI_CAPS,
  WIRE_CAPS,
  fromLint,
  fromRun,
  rejected,
  toWire,
  type ToolResult,
} from './tool-result'
import {
  CLIENT_TOOLS,
  TOOL_NAMES,
  createTools,
  runTool,
  type SandboxDeps,
} from './tools'
import type { AskEvent } from './types'

// --- schema ---------------------------------------------------------------------------------

const finished = (
  outcome: Extract<RunResult, { status: 'finished' }>['outcome'],
  lines: string[] = [],
  ms = 12.4,
): RunResult => ({ status: 'finished', outcome, ms, lines })

describe('fromRun', () => {
  test('ok with output', () => {
    const r = fromRun('ejecutar', finished({ status: 'ok' }, ['2', 'hola']))
    expect(r).toMatchObject({
      v: 1,
      tool: 'ejecutar',
      ok: true,
      status: 'ok',
      stdout: '2\nhola',
      stdoutChars: 6,
      error: null,
      diagnostics: [],
      durationMs: 12,
      truncated: false,
    })
  })

  test('a runtime error keeps the line', () => {
    const r = fromRun(
      'ejecutar',
      finished({ status: 'error', message: 'snippet:3: boom', line: 3 }),
    )
    expect(r.ok).toBe(false)
    expect(r.status).toBe('error')
    expect(r.error).toEqual({
      type: 'runtime',
      message: 'snippet:3: boom',
      line: 3,
    })
  })

  test('the Lua traceback is dropped: the first lines say what and where', () => {
    const r = fromRun(
      'ejecutar',
      finished({
        status: 'error',
        message:
          "snippet:3: attempt to index a nil value (local 't')\nstack traceback:\n\tsnippet:3: in main chunk\n\t[C]: in ?",
        line: 3,
      }),
    )
    expect(r.error?.message).toBe(
      "snippet:3: attempt to index a nil value (local 't')",
    )
    expect(r.truncated).toBe(false)
  })

  test('a syntax error is told apart from a runtime one', () => {
    const r = fromRun(
      'ejecutar',
      finished({
        status: 'error',
        message: "snippet:1: unexpected symbol near '+'",
        line: 1,
      }),
    )
    expect(r.error?.type).toBe('syntax')
  })

  test('limits, timeout, cancel and crash each get their own status', () => {
    expect(
      fromRun(
        'ejecutar',
        finished({ status: 'limit', reason: 'instructions' }),
      ),
    ).toMatchObject({
      ok: false,
      status: 'limit',
      error: { type: 'limit', message: 'limit:instructions' },
    })
    expect(
      fromRun('ejecutar', { status: 'timeout', ms: 4000, lines: [] }),
    ).toMatchObject({ status: 'timeout', error: { type: 'timeout' } })
    expect(
      fromRun('ejecutar', { status: 'cancelled', ms: 5, lines: ['a'] }),
    ).toMatchObject({
      status: 'cancelled',
      ok: false,
      error: null,
      stdout: 'a',
    })
    expect(
      fromRun('ejecutar', {
        status: 'crash',
        message: 'x',
        reason: 'boot',
        ms: 0,
        lines: [],
      }),
    ).toMatchObject({
      status: 'crash',
      error: { type: 'crash', message: 'boot' },
    })
  })

  test('a huge output is cut for the UI and says so', () => {
    const big = 'x'.repeat(UI_CAPS.stdout + 500)
    const r = fromRun('ejecutar', finished({ status: 'ok' }, [big]))
    expect(r.stdout).toHaveLength(UI_CAPS.stdout)
    expect(r.stdoutChars).toBe(big.length)
    expect(r.truncated).toBe(true)
  })
})

describe('fromLint', () => {
  const d = (over: Partial<Diagnostic> = {}): Diagnostic => ({
    severity: 'warning',
    line: 2,
    column: 4,
    message: 'x',
    ...over,
  })

  test('warnings only is ok', () => {
    const r = fromLint('check', [d()], 3.2)
    expect(r).toMatchObject({
      ok: true,
      status: 'ok',
      error: null,
      durationMs: 3,
    })
    expect(r.diagnostics).toEqual([
      { severity: 'warning', line: 2, column: 4, message: 'x' },
    ])
  })

  test('an error diagnostic fails the check and becomes the error', () => {
    const r = fromLint(
      'check',
      [d(), d({ severity: 'error', line: 7, message: 'unexpected symbol' })],
      1,
    )
    expect(r.ok).toBe(false)
    expect(r.status).toBe('error')
    expect(r.error).toEqual({
      type: 'syntax',
      message: 'unexpected symbol',
      line: 7,
    })
  })

  test('too many diagnostics are cut and flagged', () => {
    const many = Array.from({ length: UI_CAPS.diagnostics + 5 }, () => d())
    const r = fromLint('check', many, 1)
    expect(r.diagnostics).toHaveLength(UI_CAPS.diagnostics)
    expect(r.truncated).toBe(true)
  })
})

describe('toWire', () => {
  test('caps everything the model will read and flags the cut', () => {
    const r: ToolResult = {
      ...rejected('ejecutar', 'm'),
      status: 'error',
      stdout: 'y'.repeat(WIRE_CAPS.stdout + 10),
      stdoutChars: WIRE_CAPS.stdout + 10,
      error: { type: 'runtime', message: 'e'.repeat(500), line: 2 },
      diagnostics: Array.from({ length: 12 }, () => ({
        severity: 'warning' as const,
        line: 1,
        column: 0,
        message: 'm'.repeat(200),
      })),
    }
    const w = toWire(r)
    expect(w.stdout).toHaveLength(WIRE_CAPS.stdout)
    expect(w.error?.message).toHaveLength(WIRE_CAPS.errorMessage)
    expect(w.diagnostics).toHaveLength(WIRE_CAPS.diagnostics)
    expect(w.diagnostics[0]!.message).toHaveLength(WIRE_CAPS.diagnosticMessage)
    expect(w.truncated).toBe(true)
    // The original is untouched: the UI keeps showing more.
    expect(r.stdout).toHaveLength(WIRE_CAPS.stdout + 10)
  })

  test('a small result is not flagged', () => {
    const r = fromRun('ejecutar', finished({ status: 'ok' }, ['1']))
    expect(toWire(r)).toEqual(r)
  })
})

describe('golden: the shape the server accepts', () => {
  // The same file is read by server/tests/tools.test.ts through `parseToolResult`.
  const path = join(
    import.meta.dir,
    '../../../docs/chat/tool-result.golden.json',
  )
  const cases: Record<string, ToolResult> = {
    ok: toWire(fromRun('ejecutar', finished({ status: 'ok' }, ['2', 'hola']))),
    runtimeError: toWire(
      fromRun(
        'ejecutar',
        finished({ status: 'error', message: 'snippet:3: boom', line: 3 }, [
          'a',
        ]),
      ),
    ),
    syntaxError: toWire(
      fromRun(
        'ejecutar',
        finished({
          status: 'error',
          message: "snippet:1: unexpected symbol near '+'",
          line: 1,
        }),
      ),
    ),
    limit: toWire(
      fromRun('ejecutar', finished({ status: 'limit', reason: 'time' })),
    ),
    timeout: toWire(
      fromRun('ejecutar', { status: 'timeout', ms: 4000, lines: [] }),
    ),
    cancelled: toWire(
      fromRun('ejecutar', { status: 'cancelled', ms: 3, lines: [] }),
    ),
    crash: toWire(
      fromRun('ejecutar', {
        status: 'crash',
        message: 'x',
        reason: 'worker',
        ms: 0,
        lines: [],
      }),
    ),
    truncatedOutput: toWire(
      fromRun('ejecutar', finished({ status: 'ok' }, ['z'.repeat(5000)])),
    ),
    rejected: rejected('ejecutar', 'body_too_long'),
    checkClean: toWire(fromLint('check', [], 2)),
    checkFindings: toWire(
      fromLint(
        'check',
        [
          {
            severity: 'error',
            line: 4,
            column: 1,
            message: 'unexpected symbol',
          },
          {
            severity: 'warning',
            line: 1,
            column: 6,
            message: 'local sin usar',
          },
        ],
        2,
      ),
    ),
  }

  test('matches docs/chat/tool-result.golden.json', () => {
    const text = `${JSON.stringify(cases, null, 2)}\n`
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(path))
      writeFileSync(path, text)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(cases)
  })
})

// --- registry -------------------------------------------------------------------------------

function fakeDeps(over: Partial<SandboxDeps> = {}) {
  const calls = { run: [] as string[], lint: [] as string[], cancelled: 0 }
  let resolveRun: (r: RunResult) => void = () => {}
  const deps: SandboxDeps = {
    async runLua(code) {
      calls.run.push(code)
      return {
        result: new Promise<RunResult>((res) => {
          resolveRun = res
        }),
        cancel: () => {
          calls.cancelled++
          resolveRun({ status: 'cancelled', ms: 1, lines: [] })
        },
      }
    },
    async lint(code) {
      calls.lint.push(code)
      return { ok: true, value: [] }
    },
    ...over,
  }
  return { deps, calls, finish: (r: RunResult) => resolveRun(r) }
}

describe('client registry', () => {
  test('offers exactly the tools the server knows', () => {
    expect([...TOOL_NAMES].sort()).toEqual([
      'borrar_memoria',
      'check',
      'editar_memoria',
      'ejecutar',
      'guardar_memoria',
    ])
  })

  test('ejecutar runs the body in the sandbox and maps the result', async () => {
    const f = fakeDeps()
    const tools = createTools(f.deps)
    const p = runTool(
      'ejecutar',
      'print(1)',
      new AbortController().signal,
      tools,
    )
    await Promise.resolve()
    await Promise.resolve()
    f.finish(finished({ status: 'ok' }, ['1']))
    const r = await p
    expect(f.calls.run).toEqual(['print(1)'])
    expect(r).toMatchObject({ ok: true, stdout: '1' })
  })

  test('ejecutar: aborting cancels the sandbox run', async () => {
    const f = fakeDeps()
    const tools = createTools(f.deps)
    const ctl = new AbortController()
    const p = runTool('ejecutar', 'while true do end', ctl.signal, tools)
    await new Promise((r) => setTimeout(r, 0))
    ctl.abort()
    const r = await p
    expect(f.calls.cancelled).toBe(1)
    expect(r.status).toBe('cancelled')
  })

  test('check lints and never runs the code', async () => {
    const f = fakeDeps()
    const tools = createTools(f.deps)
    const r = await runTool(
      'check',
      'local x = 1',
      new AbortController().signal,
      tools,
    )
    expect(f.calls.lint).toEqual(['local x = 1'])
    expect(f.calls.run).toEqual([])
    expect(r.tool).toBe('check')
  })

  test('check: a lint that fails is a crash result, not an exception', async () => {
    const f = fakeDeps({
      lint: async () => ({ ok: false, message: 'worker murió' }),
    })
    const r = await runTool(
      'check',
      'x',
      new AbortController().signal,
      createTools(f.deps),
    )
    expect(r).toMatchObject({ ok: false, status: 'crash' })
  })

  test.each([
    ['an unknown tool', 'rm', 'x'],
    ['a prototype name', 'constructor', 'x'],
    ['an empty body', 'ejecutar', '   '],
    ['a body over the cap', 'ejecutar', 'x'.repeat(4001)],
  ])('rejects %s without running anything', async (_n, name, body) => {
    const f = fakeDeps()
    const r = await runTool(
      name,
      body,
      new AbortController().signal,
      createTools(f.deps),
    )
    expect(r.status).toBe('rejected')
    expect(r.ok).toBe(false)
    expect(f.calls.run).toEqual([])
    expect(f.calls.lint).toEqual([])
  })

  test('a sandbox that cannot load is a rejected result', async () => {
    const f = fakeDeps({
      runLua: async () => {
        throw new Error('no wasm')
      },
    })
    const r = await runTool(
      'ejecutar',
      'print(1)',
      new AbortController().signal,
      createTools(f.deps),
    )
    expect(r).toMatchObject({
      status: 'rejected',
      error: { message: 'sandbox_unavailable' },
    })
  })

  test('the live registry has the same bodyMax as the server', () => {
    expect(CLIENT_TOOLS.ejecutar!.bodyMax).toBe(4000)
    expect(CLIENT_TOOLS.check!.bodyMax).toBe(4000)
  })
})

// --- events and the store's loop --------------------------------------------------------------

describe('SSE parser: the new events', () => {
  test('tool_call, confirm and done.stop arrive intact', () => {
    const text =
      'event: tool_call\ndata: {"round":1,"name":"ejecutar","body":"print(1)"}\n\n' +
      'event: confirm\ndata: {"reason":"max_rounds","rounds":8}\n\n' +
      'event: done\ndata: {"cited":[],"refused":false,"truncated":false,"usage":{"inputTokens":1,"outputTokens":1},"stop":"tool_call"}\n\n'
    const evs = new SseParser().push(text)
    expect(evs.map((e) => e.type)).toEqual(['tool_call', 'confirm', 'done'])
    expect(evs[0]).toEqual({
      type: 'tool_call',
      round: 1,
      name: 'ejecutar',
      body: 'print(1)',
    })
    expect(evs[2]).toMatchObject({ stop: 'tool_call' })
  })
})

describe('applyEvent with tools', () => {
  test('tool_call records where the answer was cut and what the round wrote', () => {
    let t = emptyTurn(1, 'q')
    t = applyEvent(t, { type: 'delta', text: 'Voy a probar:\n' })
    t = applyEvent(t, {
      type: 'tool_call',
      round: 1,
      name: 'ejecutar',
      body: 'print(1)',
    })
    expect(t.tools).toHaveLength(1)
    expect(t.tools[0]).toMatchObject({
      at: 14,
      text: 'Voy a probar:\n',
      status: 'running',
    })
    t = applyEvent(t, { type: 'delta', text: 'Salió 1.' })
    t = applyEvent(t, { type: 'tool_call', round: 2, name: 'check', body: 'x' })
    expect(t.tools[1]).toMatchObject({ at: 22, text: 'Salió 1.' })
  })

  test('a done that waits for the tool does not end the turn', () => {
    let t = applyEvent(emptyTurn(1, 'q'), { type: 'delta', text: 'a' })
    t = applyEvent(t, {
      type: 'done',
      cited: [],
      refused: false,
      truncated: false,
      usage: { inputTokens: 5, outputTokens: 2 },
      stop: 'tool_call',
    })
    expect(t.status).toBe('streaming')
  })

  test('later rounds keep the first round sources and steps', () => {
    let t = emptyTurn(1, 'q')
    t = applyEvent(t, { type: 'sources', sources: [] })
    t = applyEvent(t, { type: 'tool_call', round: 1, name: 'check', body: 'x' })
    const after = applyEvent(t, {
      type: 'step',
      step: { id: 'cache', ms: 1 },
    })
    expect(after.steps).toEqual([])
  })

  test('stepsFor sends finished rounds only, capped, with the wire result', () => {
    const t: Turn = {
      ...emptyTurn(1, 'q'),
      tools: [
        {
          round: 1,
          name: 'ejecutar',
          body: 'print(1)',
          at: 3,
          text: 'z'.repeat(STEP_TEXT_MAX + 50),
          status: 'done',
          result: fromRun(
            'ejecutar',
            finished({ status: 'ok' }, ['y'.repeat(5000)]),
          ),
        },
        {
          round: 2,
          name: 'ejecutar',
          body: 'x',
          at: 9,
          text: '',
          status: 'running',
          result: null,
        },
      ],
    }
    const steps = stepsFor(t)
    expect(steps).toHaveLength(1)
    expect(steps[0]!.text).toHaveLength(STEP_TEXT_MAX)
    expect(steps[0]!.result.stdout).toHaveLength(WIRE_CAPS.stdout)
    expect(steps[0]!.result.truncated).toBe(true)
  })
})

const sse = (events: AskEvent[]) =>
  events
    .map((e) => {
      const { type, ...data } = e
      return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
    })
    .join('')

const sseResponse = (events: AskEvent[]) =>
  new Response(sse(events), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })

const meta: AskEvent = {
  type: 'meta',
  requestId: 'r',
  mode: 'semantic',
  degraded: false,
}
const usage = { inputTokens: 10, outputTokens: 5 }
const doneStop = (stop?: 'tool_call' | 'confirm'): AskEvent => ({
  type: 'done',
  cited: [],
  refused: false,
  truncated: false,
  usage,
  ...(stop ? { stop } : {}),
})
const call = (
  round: number,
  name = 'ejecutar',
  body = 'print(1)',
): AskEvent => ({
  type: 'tool_call',
  round,
  name,
  body,
})

/** A fetch that answers with each scripted response in order and records the bodies. */
function scripted(responses: (() => Response)[]) {
  const bodies: any[] = []
  let i = 0
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    const make = responses[Math.min(i++, responses.length - 1)]!
    return make()
  }) as unknown as typeof globalThis.fetch
  return { fetch, bodies }
}

const okResult = (tool = 'ejecutar'): ToolResult =>
  fromRun(tool, finished({ status: 'ok' }, ['1']))

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++)
    await new Promise((r) => setTimeout(r, 1))
}

describe('AskStore: the tool loop', () => {
  test('call → run in the browser → continue with steps → final answer', async () => {
    const { fetch, bodies } = scripted([
      () =>
        sseResponse([
          meta,
          { type: 'sources', sources: [] },
          { type: 'delta', text: 'Voy a probar:\n' },
          call(1),
          doneStop('tool_call'),
        ]),
      () =>
        sseResponse([meta, { type: 'delta', text: 'Imprimió 1.' }, doneStop()]),
    ])
    const ran: string[] = []
    const store = new AskStore({
      fetch,
      memories: () => [],
      runTool: async (name, body) => {
        ran.push(`${name}:${body}`)
        return okResult(name)
      },
    })
    await store.ask('probá esto')
    const turn = store.getState().turns[0]!
    expect(ran).toEqual(['ejecutar:print(1)'])
    expect(turn.status).toBe('done')
    expect(turn.text).toBe('Voy a probar:\nImprimió 1.')
    expect(turn.tools).toHaveLength(1)
    expect(turn.tools[0]).toMatchObject({ status: 'done', at: 14 })
    expect(turn.tools[0]!.result?.ok).toBe(true)
    // First request: tools offered, no steps. Second: the step with the wire result.
    expect(bodies[0].tools).toEqual([...TOOL_NAMES])
    expect(bodies[0].steps).toBeUndefined()
    expect(bodies[1].steps).toHaveLength(1)
    expect(bodies[1].steps[0]).toMatchObject({
      text: 'Voy a probar:\n',
      tool: 'ejecutar',
      body: 'print(1)',
      result: { v: 1, ok: true, stdout: '1' },
    })
    expect(bodies[1].continued).toBeUndefined()
  })

  test('a sandbox failure goes back to the model as a result, not as an error', async () => {
    const { fetch, bodies } = scripted([
      () => sseResponse([meta, call(1), doneStop('tool_call')]),
      () => sseResponse([meta, { type: 'delta', text: 'ok' }, doneStop()]),
    ])
    const store = new AskStore({
      fetch,
      memories: () => [],
      runTool: async (name) => rejected(name, 'sandbox_unavailable'),
    })
    await store.ask('x')
    expect(store.getState().turns[0]!.status).toBe('done')
    expect(bodies[1].steps[0].result.status).toBe('rejected')
  })

  test('Stop during the run aborts the tool and sends nothing else', async () => {
    const { fetch, bodies } = scripted([
      () => sseResponse([meta, call(1), doneStop('tool_call')]),
    ])
    let signal: AbortSignal | undefined
    const store = new AskStore({
      fetch,
      memories: () => [],
      runTool: (_n, _b, s) => {
        signal = s
        // Like the real sandbox: an abort ends the run with a cancelled result.
        return new Promise<ToolResult>((res) =>
          s.addEventListener('abort', () =>
            res(rejected('ejecutar', 'cancelled')),
          ),
        )
      },
    })
    const p = store.ask('x')
    await until(() => signal !== undefined)
    store.stop()
    await p
    const turn = store.getState().turns[0]!
    expect(signal?.aborted).toBe(true)
    expect(turn.status).toBe('stopped')
    expect(turn.tools[0]!.status).toBe('stopped')
    expect(bodies).toHaveLength(1)
  })

  test('a server that never stops calling hits the client brake', async () => {
    const { fetch, bodies } = scripted([
      () => sseResponse([meta, call(1), doneStop('tool_call')]),
    ])
    const store = new AskStore({
      fetch,
      memories: () => [],
      runTool: async (name) => okResult(name),
    })
    await store.ask('x')
    const turn = store.getState().turns[0]!
    expect(turn.status).toBe('error')
    expect(turn.error?.code).toBe('too_many_rounds')
    expect(bodies.length).toBeLessThanOrEqual(MAX_TOOL_ROUNDS + 1)
  })

  test('owner: confirm ends the turn with a Continue; continueTurn resends with continued', async () => {
    const { fetch, bodies } = scripted([
      () => sseResponse([meta, call(1), doneStop('tool_call')]),
      () =>
        sseResponse([
          meta,
          { type: 'confirm', reason: 'max_rounds', rounds: 1 },
          doneStop('confirm'),
        ]),
      () => sseResponse([meta, { type: 'delta', text: 'Sigo.' }, doneStop()]),
    ])
    const store = new AskStore({
      fetch,
      memories: () => [],
      runTool: async (name) => okResult(name),
    })
    await store.ask('x')
    let turn = store.getState().turns[0]!
    expect(turn.status).toBe('done')
    expect(turn.confirm).toEqual({ rounds: 1 })
    store.continueTurn(turn.id)
    await until(
      () =>
        store.getState().turns[0]!.status === 'done' &&
        !store.getState().turns[0]!.confirm,
    )
    turn = store.getState().turns[0]!
    expect(turn.text).toBe('Sigo.')
    expect(turn.continued).toBe(1)
    expect(bodies[2].continued).toBe(1)
    expect(bodies[2].steps).toHaveLength(1)
  })

  test('continueTurn does nothing without a pending confirmation', async () => {
    const { fetch, bodies } = scripted([
      () => sseResponse([meta, { type: 'delta', text: 'a' }, doneStop()]),
    ])
    const store = new AskStore({ fetch, memories: () => [] })
    await store.ask('x')
    store.continueTurn(store.getState().turns[0]!.id)
    expect(bodies).toHaveLength(1)
  })

  test('a plain answer without tools in the request still works (old server)', async () => {
    const { fetch } = scripted([
      () => sseResponse([meta, { type: 'delta', text: 'hola' }, doneStop()]),
    ])
    const store = new AskStore({ fetch, memories: () => [], tools: [] })
    await store.ask('x')
    expect(store.getState().turns[0]!.text).toBe('hola')
  })
})
