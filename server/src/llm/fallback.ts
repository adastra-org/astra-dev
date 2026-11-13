// Primary provider with a local fallback. If the primary fails BEFORE producing anything (network,
// HTTP error, timeout, no balance), the same request goes to the fallback. Once text started
// flowing there is no switch: a half answer from one model must not be continued by another.
import type { LlmChunk, LlmProvider, LlmRequest } from './provider.ts'

export class FallbackProvider implements LlmProvider {
  readonly name: string
  readonly #primary: LlmProvider
  readonly #fallback: LlmProvider
  readonly #onFallback?: (primary: string, fallback: string) => void

  constructor(
    primary: LlmProvider,
    fallback: LlmProvider,
    onFallback?: (primary: string, fallback: string) => void,
  ) {
    this.#primary = primary
    this.#fallback = fallback
    this.#onFallback = onFallback
    this.name = `${primary.name}+${fallback.name}`
  }

  async *stream(request: LlmRequest): AsyncGenerator<LlmChunk> {
    let started = false
    try {
      for await (const chunk of this.#primary.stream(request)) {
        started = true
        yield chunk
      }
      return
    } catch (e) {
      if (started || request.signal?.aborted) throw e
    }
    this.#onFallback?.(this.#primary.name, this.#fallback.name)
    yield* this.#fallback.stream(request)
  }
}
