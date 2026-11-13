// Per-request usage records in SQLite (`bun:sqlite`, WAL). One file shared by the blue and green
// slots (the path lives outside the slot dirs), so the history survives a deploy. Only counts,
// times and ids are stored: never the question, the answer, a fragment, an IP or a secret.
// Recording must never break a request: every write is guarded and failures only bump a counter.
import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface UsageRecord {
  /** Epoch ms when the request started. */
  ts: number
  requestId: string
  route: string
  viewerId: string | null
  viewerHandle: string | null
  role: string
  provider: string | null
  model: string | null
  fallbackUsed: boolean
  inputTokens: number
  outputTokens: number
  ttftMs: number | null
  durationMs: number
  /** Output tokens per second while generating. */
  genTps: number | null
  outcome: string
  cacheHit: boolean
  /** Local model time summed over the request's local calls; null = not measured / not local. */
  gpuMs: number | null
  /** Hosted models only, from the configured price table. An estimate. */
  costUsdEst: number | null
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usage_events (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,
  day           TEXT    NOT NULL,
  request_id    TEXT    NOT NULL,
  route         TEXT    NOT NULL,
  viewer_id     TEXT,
  viewer_handle TEXT,
  role          TEXT    NOT NULL,
  provider      TEXT,
  model         TEXT,
  fallback_used INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  ttft_ms       INTEGER,
  duration_ms   INTEGER NOT NULL,
  gen_tps       REAL,
  outcome       TEXT    NOT NULL,
  cache_hit     INTEGER NOT NULL DEFAULT 0,
  gpu_ms        INTEGER,
  cost_usd_est  REAL
);
CREATE INDEX IF NOT EXISTS usage_day ON usage_events(day);
CREATE INDEX IF NOT EXISTS usage_viewer_day ON usage_events(viewer_id, day);
`

export interface UsageSink {
  record(r: UsageRecord): void
}

export class UsageStore implements UsageSink {
  readonly #db: Database
  readonly #insert
  /** Writes that failed since boot. Exposed for logs and tests. */
  writeErrors = 0

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.#db = new Database(path, { create: true })
    // Two processes (blue and green) can write the same file during a deploy.
    this.#db.run('PRAGMA journal_mode = WAL')
    this.#db.run('PRAGMA busy_timeout = 3000')
    this.#db.run('PRAGMA synchronous = NORMAL')
    this.#db.run(SCHEMA)
    this.#insert = this.#db.prepare(
      `INSERT INTO usage_events (ts, day, request_id, route, viewer_id, viewer_handle, role, provider,
        model, fallback_used, input_tokens, output_tokens, ttft_ms, duration_ms, gen_tps, outcome,
        cache_hit, gpu_ms, cost_usd_est)
       VALUES ($ts, $day, $requestId, $route, $viewerId, $viewerHandle, $role, $provider, $model,
        $fallbackUsed, $inputTokens, $outputTokens, $ttftMs, $durationMs, $genTps, $outcome,
        $cacheHit, $gpuMs, $costUsdEst)`,
    )
  }

  record(r: UsageRecord): void {
    try {
      this.#insert.run({
        $ts: r.ts,
        $day: new Date(r.ts).toISOString().slice(0, 10),
        $requestId: r.requestId,
        $route: r.route,
        $viewerId: r.viewerId,
        $viewerHandle: r.viewerHandle,
        $role: r.role,
        $provider: r.provider,
        $model: r.model,
        $fallbackUsed: r.fallbackUsed ? 1 : 0,
        $inputTokens: r.inputTokens,
        $outputTokens: r.outputTokens,
        $ttftMs: r.ttftMs,
        $durationMs: r.durationMs,
        $genTps: r.genTps,
        $outcome: r.outcome,
        $cacheHit: r.cacheHit ? 1 : 0,
        $gpuMs: r.gpuMs,
        $costUsdEst: r.costUsdEst,
      })
    } catch {
      this.writeErrors++
    }
  }

  /** Deletes records older than `retentionDays`. Returns how many were removed. */
  purge(retentionDays: number, now = Date.now()): number {
    try {
      const cutoff = now - retentionDays * 86_400_000
      return this.#db.run('DELETE FROM usage_events WHERE ts < ?', [cutoff])
        .changes
    } catch {
      this.writeErrors++
      return 0
    }
  }

  /** Read-only handle for tests and the dashboard queries (phase 0b). */
  query<T>(sql: string, ...params: (string | number | null)[]): T[] {
    return this.#db.query(sql).all(...params) as T[]
  }

  close() {
    this.#db.close()
  }
}
