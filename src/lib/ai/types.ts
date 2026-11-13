// Forma de la respuesta de `aiUsage` (server/src/usage/report.ts). Solo el owner la recibe.

export interface AiTotals {
  requests: number
  cacheHits: number
  /** 0 a 1, sobre los requests que llegaron a responder. */
  cacheHitRate: number
  inputTokens: number
  outputTokens: number
  gpuMs: number
  /** Requests con tiempo de GPU medido (solo modelos locales). */
  gpuMeasured: number
  costUsdEst: number
  avgTtftMs: number | null
  avgGenTps: number | null
  rateLimited: number
  budgetExceeded: number
  errors: number
  fallbacks: number
  activeViewers: number
}

export interface AiDay {
  date: string
  requests: number
  inputTokens: number
  outputTokens: number
  gpuMs: number
  costUsdEst: number
}

export interface AiModel {
  provider: string
  model: string
  requests: number
  inputTokens: number
  outputTokens: number
  gpuMs: number
  costUsdEst: number
  avgTtftMs: number | null
  avgGenTps: number | null
  fallbacks: number
}

export interface AiViewer {
  viewerId: string
  handle: string | null
  role: string
  requests: number
  tokens: number
  gpuMs: number
}

export interface AiOutcome {
  outcome: string
  count: number
}

export interface AiUsage {
  days: number
  from: string
  to: string
  generatedAt: string
  lostRecords: number
  totals: AiTotals
  daily: AiDay[]
  models: AiModel[]
  viewers: AiViewer[]
  outcomes: AiOutcome[]
}
