// Decision step: does the new question need the previous turn to be understood? Answered by a
// small calibrated classifier (Liquid d1, llama.cpp `/v1/systemone`): one forward pass, no tokens
// generated, no tools. Its output is one probability, used only to decide whether the retrieval
// query includes the previous user turn. Any failure returns null and the chat keeps its old
// behaviour (always include it), so this step can only ever narrow a query, never block a question.

export interface FollowUpInput {
  lastUser: string
  lastAssistant: string | null
  question: string
}

export interface FollowUpDecider {
  /** true = needs the history, false = standalone, null = could not decide (treat as true). */
  dependsOnHistory(
    input: FollowUpInput,
    signal?: AbortSignal,
  ): Promise<boolean | null>
}

export interface D1Options {
  /** Base URL of the llama.cpp server (loopback), without `/v1/systemone`. */
  url: string
  timeoutMs: number
  /** Probability from which the question counts as a follow-up. Low on purpose: losing context
   * costs more than carrying it. Measured: 0.2-0.3 separates the two classes best. */
  threshold: number
  fetch?: typeof fetch
}

const INSTRUCTIONS =
  'Hay historial y la pregunta nueva solo se entiende con él (por ejemplo usa "eso", "ese", "y si", "dame un ejemplo" refiriéndose a la respuesta anterior).'

export class D1FollowUpDecider implements FollowUpDecider {
  readonly #o: D1Options
  constructor(options: D1Options) {
    this.#o = options
  }

  async dependsOnHistory(
    input: FollowUpInput,
    signal?: AbortSignal,
  ): Promise<boolean | null> {
    const f = this.#o.fetch ?? fetch
    const timeout = AbortSignal.timeout(this.#o.timeoutMs)
    try {
      const res = await f(`${this.#o.url}/v1/systemone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state:
            `Historial:\nUsuario: ${input.lastUser}\n` +
            (input.lastAssistant ? `Asistente: ${input.lastAssistant}\n` : '') +
            `\nPregunta nueva: ${input.question}`,
          questions: {
            followup: { type: 'noul', instructions: INSTRUCTIONS },
          },
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
      if (!res.ok) return null
      const json = (await res.json()) as {
        answers?: { followup?: { noul?: unknown } }
      }
      const p = json.answers?.followup?.noul
      if (typeof p !== 'number' || !Number.isFinite(p)) return null
      return p >= this.#o.threshold
    } catch {
      return null
    }
  }
}
