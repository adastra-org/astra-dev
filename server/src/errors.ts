// Typed errors. Every failure the API can return has a stable `code` the client can switch on.

export type ErrorCode =
  | 'bad_request'
  | 'payload_too_large'
  | 'forbidden_origin'
  | 'unauthenticated'
  | 'subscription_required'
  | 'staff_required'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'viewer_unavailable'
  | 'llm_unavailable'
  | 'index_unavailable'
  | 'project_unavailable'
  | 'not_found'
  | 'internal'

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  payload_too_large: 413,
  forbidden_origin: 403,
  unauthenticated: 401,
  subscription_required: 403,
  staff_required: 403,
  rate_limited: 429,
  budget_exceeded: 429,
  viewer_unavailable: 503,
  llm_unavailable: 502,
  index_unavailable: 503,
  project_unavailable: 503,
  not_found: 404,
  internal: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  /** Seconds the client should wait (rate_limited, budget_exceeded). */
  readonly retryAfter: number | undefined

  constructor(code: ErrorCode, message: string, retryAfter?: number) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = STATUS[code]
    this.retryAfter = retryAfter
  }

  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfter === undefined
          ? {}
          : { retryAfter: this.retryAfter }),
      },
    }
  }
}

/** Invalid environment at boot. Fails the process so a bad deploy never goes live. */
export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(
      `Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    )
    this.name = 'ConfigError'
  }
}

export const toAppError = (e: unknown): AppError =>
  e instanceof AppError ? e : new AppError('internal', 'Internal error')
