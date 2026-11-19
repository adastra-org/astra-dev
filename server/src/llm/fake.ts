// Fake provider for tests and local dev. Records every request so tests can assert exactly what a
// model would have been shown, and replays a scripted answer in small deltas.
import { AppError } from '../errors.ts'
import type { LlmChunk, LlmProvider, LlmRequest } from './provider.ts'

export interface FakeOptions {
  /** Text to stream, or a function of the request. Default: cites source 1. */
  answer?: string | ((req: LlmRequest) => string)
  /** Delta size in characters. */
  chunkSize?: number
  /** Reasoning to stream before the answer, in `chunkSize` pieces. */
  thinking?: string
  /** Throw `llm_unavailable` instead of answering. */
  fail?: boolean
}

export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake'
  readonly requests: LlmRequest[] = []
  readonly #o: FakeOptions

  constructor(options: FakeOptions = {}) {
    this.#o = options
  }

  async *stream(req: LlmRequest): AsyncGenerator<LlmChunk> {
    this.requests.push(req)
    if (this.#o.fail)
      throw new AppError(
        'llm_unavailable',
        'The language model is not available.',
      )
    const a =
      this.#o.answer ?? 'Respuesta de prueba basada en la documentación [1].'
    const text = typeof a === 'function' ? a(req) : a
    const size = this.#o.chunkSize ?? 12
    const thought = this.#o.thinking ?? ''
    for (let i = 0; i < thought.length; i += size)
      yield { type: 'thinking', text: thought.slice(i, i + size) }
    for (let i = 0; i < text.length; i += size) {
      if (req.signal?.aborted) return
      yield { type: 'delta', text: text.slice(i, i + size) }
    }
    const input = req.messages.reduce((n, m) => n + m.content.length, 0)
    yield {
      type: 'usage',
      usage: {
        inputTokens: Math.ceil(input / 3),
        outputTokens: Math.ceil(text.length / 3),
      },
    }
  }
}
