// DeepSeek (OpenAI-compatible chat completions) behind `LlmProvider`. The key comes from the server
// env only. No tools are ever sent. The only network destination is `baseUrl`.
import { AppError } from '../errors.ts'
import type { LlmChunk, LlmProvider, LlmRequest } from './provider.ts'

export interface DeepSeekOptions {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
  fetch?: typeof fetch
}

const unavailable = () =>
  new AppError('llm_unavailable', 'The language model is not available.')

export class DeepSeekProvider implements LlmProvider {
  readonly name = 'deepseek'
  readonly #o: DeepSeekOptions

  constructor(options: DeepSeekOptions) {
    this.#o = options
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
          authorization: `Bearer ${this.#o.apiKey}`,
        },
        body: JSON.stringify({
          model: this.#o.model,
          messages: req.messages,
          max_tokens: req.maxOutputTokens,
          temperature: 0.2,
          stream: true,
          stream_options: { include_usage: true },
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
