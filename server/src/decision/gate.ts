// Context gate: which retrieved fragments are allowed into the prompt. The same small calibrated
// classifier as the follow-up decision (Liquid d1 on llama.cpp `/v1/systemone`) answers one yes/no
// per fragment: "is this needed to answer the question?". It can only REMOVE fragments, never add
// or rewrite them, so it can only shrink what the model gets to read. Any failure keeps everything
// (fail open), exactly like running without a gate.
import type { Hit } from '../index/search.ts'

export interface GateOptions {
  signal?: AbortSignal
  /**
   * What the conversation is about (names of the natives or docs the previous answer used). Given
   * on a follow-up: a vague question ("me mostrás un ejemplo?") cannot tell relevant from merely
   * similar fragments, the topic can. Then a fragment must be about the topic to stay.
   */
  topic?: string
}

export interface ContextGate {
  /** The subset of `hits` to keep, in the same order; `null` = could not decide (keep all). */
  select(
    question: string,
    hits: readonly Hit[],
    options?: GateOptions,
  ): Promise<Hit[] | null>
}

export interface D1GateOptions {
  url: string
  timeoutMs: number
  /** A fragment with at least this probability is kept. */
  threshold: number
  /** If nothing reaches `threshold`, the best fragment is still kept when it reaches this. Below
   * it, nothing is kept and the chat refuses without calling the model. */
  floor: number
  /** Characters of each fragment shown to the classifier. */
  maxFragmentChars: number
  fetch?: typeof fetch
}

const INSTRUCTIONS =
  'El fragmento contiene información que hace falta para responder la pregunta del usuario (no solo comparte palabras con ella).'
const TOPIC_INSTRUCTIONS =
  'El fragmento trata del tema de la conversación y hace falta para responder la pregunta del usuario (no basta con compartir palabras con ella).'

export class D1ContextGate implements ContextGate {
  readonly #o: D1GateOptions
  constructor(options: D1GateOptions) {
    this.#o = options
  }

  async select(
    question: string,
    hits: readonly Hit[],
    options: GateOptions = {},
  ): Promise<Hit[] | null> {
    if (!hits.length) return []
    const probs = await Promise.all(
      hits.map((h) => this.#probability(question, h, options)),
    )
    // One failed fragment makes the whole decision unreliable: keep everything.
    if (probs.some((p) => p === null)) return null
    const p = probs as number[]
    const kept = hits.filter((_, i) => p[i]! >= this.#o.threshold)
    if (kept.length) return kept
    let best = 0
    for (let i = 1; i < p.length; i++) if (p[i]! > p[best]!) best = i
    return p[best]! >= this.#o.floor ? [hits[best]!] : []
  }

  async #probability(
    question: string,
    hit: Hit,
    { signal, topic }: GateOptions,
  ): Promise<number | null> {
    const f = this.#o.fetch ?? fetch
    const timeout = AbortSignal.timeout(this.#o.timeoutMs)
    try {
      const res = await f(`${this.#o.url}/v1/systemone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          state: `${topic ? `Tema de la conversación: ${topic}\n` : ''}Pregunta del usuario: ${question}\n\nFragmento (${hit.title} / ${hit.heading ?? ''}):\n${hit.text.slice(0, this.#o.maxFragmentChars)}`,
          questions: {
            relevant: {
              type: 'noul',
              instructions: topic ? TOPIC_INSTRUCTIONS : INSTRUCTIONS,
            },
          },
        }),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
      if (!res.ok) return null
      const json = (await res.json()) as {
        answers?: { relevant?: { noul?: unknown } }
      }
      const v = json.answers?.relevant?.noul
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    } catch {
      return null
    }
  }
}
