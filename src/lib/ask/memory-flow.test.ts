// El bucle del chat con herramientas de memoria: llamada → propuesta en la tarjeta → decisión del
// usuario → resultado al modelo en la continuación. `fetch` simulado, `MemoryStore` propio.
import { describe, expect, test } from 'bun:test'
import { MemoryStore } from './memories'
import { AskStore } from './store'
import { createTools, runTool } from './tools'
import type { AskEvent } from './types'

class FakeStorage {
  data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}

const sseResponse = (events: AskEvent[]) =>
  new Response(
    events
      .map((e) => {
        const { type, ...data } = e
        return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
      })
      .join(''),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  )

const meta: AskEvent = {
  type: 'meta',
  requestId: 'r',
  mode: 'semantic',
  degraded: false,
}
const done = (stop?: 'tool_call'): AskEvent => ({
  type: 'done',
  cited: [],
  refused: false,
  truncated: false,
  usage: { inputTokens: 1, outputTokens: 1 },
  ...(stop ? { stop } : {}),
})
const call = (round: number, name: string, body: string): AskEvent => ({
  type: 'tool_call',
  round,
  name,
  body,
})

function scripted(responses: AskEvent[][]) {
  const bodies: any[] = []
  let i = 0
  const fetch = (async (_u: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return sseResponse(responses[Math.min(i++, responses.length - 1)]!)
  }) as unknown as typeof globalThis.fetch
  return { fetch, bodies }
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 300 && !cond(); i++)
    await new Promise((r) => setTimeout(r, 1))
}

function make(
  responses: AskEvent[][],
  seed: string[] = [],
  opts: { auto?: boolean } = {},
) {
  const mem = new MemoryStore({ storage: () => new FakeStorage() })
  for (const t of seed) mem.add(t)
  if (opts.auto) mem.setAuto(true)
  const registry = createTools(undefined, mem)
  const { fetch, bodies } = scripted(responses)
  const store = new AskStore({
    fetch,
    memories: () => mem.active(),
    memoryRefs: () => mem.activeRefs(),
    runTool: (name, body, signal, _r, memory) =>
      runTool(name, body, signal, registry, memory),
  })
  return { store, mem, bodies }
}

const turn = (s: AskStore) => s.getState().turns[0]!

describe('memory proposals in the chat loop', () => {
  test('the card waits for Guardar; the result goes back to the model', async () => {
    const { store, mem, bodies } = make([
      [
        meta,
        { type: 'delta', text: 'Anoto eso.\n' },
        call(1, 'guardar_memoria', 'Prefiero respuestas cortas'),
        done('tool_call'),
      ],
      [meta, { type: 'delta', text: 'Listo.' }, done()],
    ])
    const p = store.ask('respondé corto')
    await until(() => turn(store).tools[0]?.proposal != null)
    expect(turn(store).tools[0]!.proposal).toEqual({
      action: 'save',
      text: 'Prefiero respuestas cortas',
    })
    expect(turn(store).status).toBe('streaming')
    expect(mem.getState().items).toHaveLength(0)
    store.decideMemory(turn(store).id, 1, {
      ok: true,
      text: 'Prefiero respuestas cortas',
    })
    await p
    expect(turn(store).status).toBe('done')
    expect(turn(store).tools[0]!.proposal).toBeNull()
    expect(mem.getState().items[0]).toMatchObject({
      text: 'Prefiero respuestas cortas',
      source: 'model',
    })
    expect(bodies[1].steps[0]).toMatchObject({
      tool: 'guardar_memoria',
      body: 'Prefiero respuestas cortas',
      result: { ok: true, status: 'ok', stdout: '1 memories, 1 active' },
    })
  })

  test('Descartar: nothing is saved and the model reads "discarded"', async () => {
    const { store, mem, bodies } = make([
      [meta, call(1, 'guardar_memoria', 'algo'), done('tool_call')],
      [meta, { type: 'delta', text: 'ok' }, done()],
    ])
    const p = store.ask('x')
    await until(() => turn(store).tools[0]?.proposal != null)
    store.decideMemory(turn(store).id, 1, { ok: false })
    await p
    expect(mem.getState().items).toHaveLength(0)
    expect(bodies[1].steps[0].result).toMatchObject({
      ok: false,
      status: 'rejected',
      error: { message: 'discarded' },
    })
  })

  test('Stop while the card is open discards it and sends nothing else', async () => {
    const { store, mem, bodies } = make([
      [meta, call(1, 'guardar_memoria', 'algo'), done('tool_call')],
    ])
    const p = store.ask('x')
    await until(() => turn(store).tools[0]?.proposal != null)
    store.stop()
    await p
    expect(turn(store).status).toBe('stopped')
    expect(turn(store).tools[0]!.proposal).toBeNull()
    expect(mem.getState().items).toHaveLength(0)
    expect(bodies).toHaveLength(1)
  })

  test('the model points at a memory by the number it saw in this send', async () => {
    const { store, mem, bodies } = make(
      [
        [
          meta,
          call(1, 'editar_memoria', '2\nUso Windows 11'),
          done('tool_call'),
        ],
        [meta, { type: 'delta', text: 'ok' }, done()],
      ],
      ['Responde corto', 'Uso Windows'],
    )
    const p = store.ask('x')
    await until(() => turn(store).tools[0]?.proposal != null)
    expect(bodies[0].memories).toEqual(['Responde corto', 'Uso Windows'])
    expect(turn(store).tools[0]!.proposal).toEqual({
      action: 'edit',
      text: 'Uso Windows 11',
      before: 'Uso Windows',
    })
    store.decideMemory(turn(store).id, 1, { ok: true, text: 'Uso Windows 11' })
    await p
    expect(mem.getState().items.map((m) => m.text)).toEqual([
      'Responde corto',
      'Uso Windows 11',
    ])
  })

  test('with "remember without asking" there is no card to answer', async () => {
    const { store, mem } = make(
      [
        [meta, call(1, 'guardar_memoria', 'Uso Windows'), done('tool_call')],
        [meta, { type: 'delta', text: 'ok' }, done()],
      ],
      [],
      { auto: true },
    )
    await store.ask('x')
    expect(turn(store).status).toBe('done')
    expect(mem.getState().items[0]).toMatchObject({ source: 'model' })
  })

  test('the 4th write in one answer is refused without asking', async () => {
    const calls = [1, 2, 3, 4].map(
      (n) =>
        [
          meta,
          call(n, 'guardar_memoria', `memoria ${n}`),
          done('tool_call'),
        ] as AskEvent[],
    )
    const { store, mem, bodies } = make(
      [...calls, [meta, { type: 'delta', text: 'fin' }, done()]],
      [],
      { auto: true },
    )
    await store.ask('x')
    expect(mem.getState().items.map((m) => m.text)).toEqual([
      'memoria 1',
      'memoria 2',
      'memoria 3',
    ])
    const last = bodies.at(-1).steps.at(-1)
    expect(last.result.error.message).toBe('too_many_writes')
  })

  test('a non-memory tool never gets the memory context', async () => {
    let seen: unknown = 'unset'
    const mem = new MemoryStore({ storage: () => new FakeStorage() })
    const { fetch } = scripted([
      [meta, call(1, 'ejecutar', 'print(1)'), done('tool_call')],
      [meta, { type: 'delta', text: 'ok' }, done()],
    ])
    const store = new AskStore({
      fetch,
      memories: () => [],
      memoryRefs: () => mem.activeRefs(),
      runTool: async (name, _b, _s, _r, memory) => {
        seen = memory
        return {
          v: 1,
          tool: name,
          ok: true,
          status: 'ok',
          stdout: '',
          stdoutChars: 0,
          error: null,
          diagnostics: [],
          durationMs: 0,
          truncated: false,
        }
      },
    })
    await store.ask('x')
    expect(seen).toBeUndefined()
  })
})
