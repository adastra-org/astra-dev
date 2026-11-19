// Collects the facts of one request and writes a single usage record when it ends. Built once per
// `/chat` call; the handler feeds it as things happen and calls `finish` in `finally`.
import type { Config } from '../config.ts'
import type { RunTelemetry } from '../chat/service.ts'
import type { UsageRecord, UsageSink } from './store.ts'

export interface Who {
  id: string | null
  handle: string | null
  role: string
}

export class UsageCollector {
  readonly #sink: UsageSink
  readonly #config: Pick<Config, 'llm' | 'usage'>
  readonly #requestId: string
  readonly #route: string
  readonly #ts: number
  who: Who | null = null
  outcome = 'ok'
  cacheHit = false
  tokens = { input: 0, output: 0 }
  telemetry: RunTelemetry | null = null

  constructor(
    sink: UsageSink,
    config: Pick<Config, 'llm' | 'usage'>,
    requestId: string,
    route: string,
    ts: number,
  ) {
    this.#sink = sink
    this.#config = config
    this.#requestId = requestId
    this.#route = route
    this.#ts = ts
  }

  /** Writes the record. Anonymous requests (no viewer id) are not recorded: they cost nothing and are unbounded. */
  finish(durationMs: number): void {
    const who = this.who
    if (!who || who.id === null) return
    const t = this.telemetry
    const { input, output } = this.tokens
    const modelCalled = t?.provider != null || input + output > 0
    const provider =
      t?.provider ?? (modelCalled ? this.#config.llm.provider : null)
    const model = t?.model ?? (modelCalled ? this.#config.llm.model : null)
    const hosted = provider === 'deepseek'
    const u = this.#config.usage
    const record: UsageRecord = {
      ts: this.#ts,
      requestId: this.#requestId,
      route: this.#route,
      viewerId: who.id,
      viewerHandle: who.handle,
      role: who.role,
      provider,
      model,
      fallbackUsed:
        provider === 'local' && this.#config.llm.provider === 'deepseek',
      inputTokens: input,
      outputTokens: output,
      ttftMs: t?.ttftMs ?? null,
      durationMs,
      genTps:
        t?.genMs && t.genMs > 0 && output > 0
          ? Math.round((output / (t.genMs / 1000)) * 10) / 10
          : null,
      outcome: this.outcome,
      cacheHit: this.cacheHit,
      gpuMs: provider === 'local' ? (t?.gpuMs ?? null) : null,
      costUsdEst: hosted
        ? (input * u.priceInPerMTok + output * u.priceOutPerMTok) / 1_000_000
        : null,
    }
    this.#sink.record(record)
  }
}
