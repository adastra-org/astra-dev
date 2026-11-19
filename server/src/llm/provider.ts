// LLM provider port. A plain completion: messages in, text out. There is deliberately NO `tools`,
// function-calling or any other capability in this interface, so a provider cannot be handed a way to
// act on the machine. The public chat must never be wired to anything agentic (Ether/Hermes has a
// shell on the VPS).

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  messages: LlmMessage[]
  maxOutputTokens: number
  signal?: AbortSignal
}

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
}

export type LlmChunk =
  | { type: 'delta'; text: string }
  /** The model's reasoning, when it exposes it (`reasoning_content`). Never part of the answer. */
  | { type: 'thinking'; text: string }
  | { type: 'usage'; usage: LlmUsage }

export interface LlmProvider {
  readonly name: string
  /** Streams the completion. Throws `AppError('llm_unavailable')` when the provider fails. */
  stream(request: LlmRequest): AsyncIterable<LlmChunk>
}
