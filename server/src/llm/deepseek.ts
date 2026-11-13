// OpenAI-compatible chat completions behind `LlmProvider`: DeepSeek, or a local server (llama.cpp,
// Ollama, LM Studio) when `name` is 'local'. The key comes from the server env only; a local server
// needs none, so the header is sent only when there is one. No tools are ever sent. The only network
// destination is `baseUrl`.
import { AppError } from '../errors.ts'
import type { LlmChunk, LlmProvider, LlmRequest } from './provider.ts'

export interface DeepSeekOptions {
  /** Provider name reported in /health. Default 'deepseek'. */
  name?: 'deepseek' | 'local'
  /** Empty = no Authorization header (local server). */
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  fetch?: typeof fetch
}

const unavailable = () =>
  new AppError('llm_unavailable', 'The language model is not available.')

export class DeepSeekProvider implements LlmProvider {
  readonly name: string
  readonly #o: DeepSeekOptions

  constructor(options: DeepSeekOptions) {
    this.#o = options
    this.name = options.name ?? 'deepseek'
  }

  async *stream(req: LlmRequest): AsyncGenerator<LlmChunk> {
    const f = this.#o.fetch ?? fetch
    const signal = req.signal
      ? AbortSignal.any([req.signal, AbortSignal.timeout(this.#o.timeoutMs)])
      : AbortSignal.timeout(this.#o.timeoutMs)

    let res: Response
    try {
      res = await f(`${this.#o.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.#o.apiKey
            ? { authorization: `Bearer ${this.#o.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.#o.model,
          messages: req.messages,
          max_tokens: req.maxOutputTokens,
          temperature: 0.2,
          stream: true,
          stream_options: { include_usage: true },
          // Local reasoning models (Liquid LFM3, Qwen3) would spend the whole token budget thinking and
          // return an empty answer; llama.cpp honors this template flag, other servers ignore it.
          ...(this.name === 'local'
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
        }),
        signal,
      })
    } catch {
      throw unavailable()
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel().catch(() => {})
      throw unavailable()
    }

    const decoder = new TextDecoder()
    let buf = ''
    try {
      for await (const part of res.body) {
        buf += decoder.decode(part, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') return
          let json: {
            choices?: { delta?: { content?: unknown } }[]
            usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
          }
          try {
            json = JSON.parse(data)
          } catch {
            continue
          }
          const text = json.choices?.[0]?.delta?.content
          if (typeof text === 'string' && text) yield { type: 'delta', text }
          const u = json.usage
          if (
            u &&
            typeof u.prompt_tokens === 'number' &&
            typeof u.completion_tokens === 'number'
          )
            yield {
              type: 'usage',
              usage: {
                inputTokens: u.prompt_tokens,
                outputTokens: u.completion_tokens,
              },
            }
        }
      }
    } catch {
      if (req.signal?.aborted) return
      throw unavailable()
    }
  }
}
