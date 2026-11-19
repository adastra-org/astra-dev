// In-memory abuse limits. Process-local: a restart (or a deploy to the other slot) resets them and
// two slots do not share state. Good enough for one VPS; move to a shared store before scaling out.
import { AppError } from './errors.ts'

/** Sliding-window limiter: at most `limit` hits per `windowMs` per key. */
export class RateLimiter {
  readonly #limit: number
  readonly #windowMs: number
  readonly #hits = new Map<string, number[]>()

  constructor(limit: number, windowMs = 60_000) {
    this.#limit = limit
    this.#windowMs = windowMs
  }

  /** Records a hit. Throws `rate_limited` (with `retryAfter` seconds) when over the limit. */
  hit(key: string, now = Date.now()): void {
    const from = now - this.#windowMs
    const list = (this.#hits.get(key) ?? []).filter((t) => t > from)
    if (list.length >= this.#limit) {
      const retry = Math.max(
        1,
        Math.ceil(((list[0] ?? now) + this.#windowMs - now) / 1000),
      )
      this.#hits.set(key, list)
      throw new AppError('rate_limited', 'Too many requests.', retry)
    }
    list.push(now)
    this.#hits.set(key, list)
    if (this.#hits.size > 10_000) this.#prune(from)
  }

  #prune(from: number) {
    for (const [k, v] of this.#hits)
      if (!v.some((t) => t > from)) this.#hits.delete(k)
  }
}

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const secondsToUtcMidnight = (ms: number) => {
  const d = new Date(ms)
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  return Math.max(1, Math.ceil((next - ms) / 1000))
}

/** Rough token estimate (Spanish and code average ~3 chars per token). Deliberately pessimistic. */
export const estimateTokens = (chars: number) => Math.ceil(chars / 3)

/**
 * Daily token budget per viewer and global, resetting at 00:00 UTC.
 * `reserve` before calling the provider, `settle` after with the real usage.
 */
export class TokenBudget {
  readonly #perViewer: number
  readonly #global: number
  #day = ''
  #globalUsed = 0
  readonly #used = new Map<string, number>()

  constructor(perViewer: number, global: number) {
    this.#perViewer = perViewer
    this.#global = global
  }

  #roll(now: number) {
    const d = dayOf(now)
    if (d !== this.#day) {
      this.#day = d
      this.#globalUsed = 0
      this.#used.clear()
    }
  }

  reserve(viewer: string, tokens: number, now = Date.now()): void {
    this.#roll(now)
    const used = this.#used.get(viewer) ?? 0
    if (used + tokens > this.#perViewer)
      throw new AppError(
        'budget_exceeded',
        'Daily Ask Ether budget reached. It resets at 00:00 UTC.',
        secondsToUtcMidnight(now),
      )
    if (this.#globalUsed + tokens > this.#global)
      throw new AppError(
        'budget_exceeded',
        'Ask Ether is at its daily capacity. Try again tomorrow.',
        secondsToUtcMidnight(now),
      )
    this.#used.set(viewer, used + tokens)
    this.#globalUsed += tokens
  }

  /** Replace the reserved amount with what was really used (never below zero). */
  settle(viewer: string, reserved: number, actual: number, now = Date.now()) {
    this.#roll(now)
    const delta = actual - reserved
    this.#used.set(viewer, Math.max(0, (this.#used.get(viewer) ?? 0) + delta))
    this.#globalUsed = Math.max(0, this.#globalUsed + delta)
  }

  usage(viewer: string) {
    return { viewer: this.#used.get(viewer) ?? 0, global: this.#globalUsed }
  }
}
