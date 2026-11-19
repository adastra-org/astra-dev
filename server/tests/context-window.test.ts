// The context window of the model: where it comes from, how it is validated, and that the chat
// stream announces it in `meta` before any text, so the client can show the budget from the start.
import { describe, expect, test } from 'bun:test'
import { loadConfig } from '../src/config.ts'
import { ConfigError } from '../src/errors.ts'
import { encodeEvent } from '../src/chat/sse.ts'
import { harness, parseSse } from './helpers.ts'

describe('LLM_CONTEXT_WINDOW', () => {
  test('defaults to 65536 for deepseek and 8192 for a local model', () => {
    expect(loadConfig({ LLM_PROVIDER: 'deepseek' }).llm.contextWindow).toBe(
      65536,
    )
    expect(
      loadConfig({
        LLM_PROVIDER: 'local',
        LLM_BASE_URL: 'http://127.0.0.1:8080/v1',
      }).llm.contextWindow,
    ).toBe(8192)
  })

  test('takes the value from the environment', () => {
    expect(
      loadConfig({ LLM_PROVIDER: 'fake', LLM_CONTEXT_WINDOW: '32768' }).llm
        .contextWindow,
    ).toBe(32768)
  })

  test('out-of-range or malformed values fail the boot', () => {
    expect(() =>
      loadConfig({ LLM_PROVIDER: 'fake', LLM_CONTEXT_WINDOW: '512' }),
    ).toThrow(ConfigError)
    expect(() =>
      loadConfig({ LLM_PROVIDER: 'fake', LLM_CONTEXT_WINDOW: 'mucho' }),
    ).toThrow(ConfigError)
  })
})

describe('meta carries the context window', () => {
  test('the first event of a stream has contextWindow from the config', async () => {
    const h = await harness()
    const res = await h.call('/chat', {
      json: { question: 'como funciona el rollback del deploy' },
    })
    expect(res.status).toBe(200)
    const [meta] = parseSse(await res.text())
    expect(meta!.event).toBe('meta')
    expect(meta!.data.contextWindow).toBe(65536)
  })

  test('encodeEvent passes contextWindow through unchanged', () => {
    const out = encodeEvent({
      type: 'meta',
      requestId: 'r1',
      mode: 'semantic',
      degraded: false,
      contextWindow: 8192,
    })
    expect(out).toContain('"contextWindow":8192')
  })
})
