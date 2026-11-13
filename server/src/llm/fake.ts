// Fake provider for tests and local dev. Records every request so tests can assert exactly what a
// model would have been shown, and replays a scripted answer in small deltas.
import { AppError } from '../errors.ts'
import type { LlmChunk, LlmProvider, LlmRequest } from './provider.ts'

/**
 * Deterministic tool script for `bun dev --fake` and the manual checklist (docs/chat/tools-security.md).
 * Only when the chat has tools: a question carrying `[[ejecutar: CODE]]` or `[[check: CODE]]` makes the
 * fake "model" call that tool; once `<pasos>` is present it answers with the result EXACTLY as the
 * prompt shows it (escaped), so you can read what a real model would be given.
 */
const TOOL_QUESTION =
  /<pregunta>[\s\S]*?\[\[(ejecutar|check|repetir):([\s\S]*?)\]\][\s\S]*?<\/pregunta>/
const RESULT = /<resultado herramienta="[a-z_]+">([\s\S]*?)<\/resultado>/g
/** The prompt escaped `&` and `<`; the model's tag body is plain code. */
const unescape = (t: string) => t.replace(/&lt;/g, '<').replace(/&amp;/g, '&')

export function scriptedToolAnswer(req: LlmRequest): string | null {
  const system = req.messages[0]?.content ?? ''
  if (!system.includes('<herramienta nombre="NOMBRE">')) return null
  const user = req.messages.at(-1)?.content ?? ''
  const results = [...user.matchAll(RESULT)].map((m) => m[1]!)
  const m = TOOL_QUESTION.exec(user)
  // `[[repetir: code]]` calls `ejecutar` on every turn, whatever came back: the endless-rounds case.
  if (m?.[1] === 'repetir')
    return `Ronda ${results.length + 1}.\n<herramienta nombre="ejecutar">\n${unescape(m[2]!.trim())}\n</herramienta>`
  if (results.length)
    return `El modelo recibió ${results.length} resultado(s). El último, tal como lo ve: ${results.at(-1)}`
  if (!m) return null
  return `Voy a probar tu código [1].\n<herramienta nombre="${m[1]}">\n${unescape(m[2]!.trim())}\n</herramienta>\nTexto después de la etiqueta que no debe salir.`
}

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
      this.#o.answer ??
      scriptedToolAnswer(req) ??
      'Respuesta de prueba basada en la documentación [1].'
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
