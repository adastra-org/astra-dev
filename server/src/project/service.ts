// "Proyecto" service: GitHub + plan + MyChecklist behind a server-side cache.
//
// Cache: each source is loaded at most once per TTL (concurrent callers share one load). When the
// TTL expires the reload sends `If-None-Match`, so unchanged data costs a free `304`. If a reload
// fails, the last good copy is served with `stale: true`; with nothing cached the call fails with
// `project_unavailable`. Nothing here is per viewer: it is the same repo data for every staff member.
import { AppError } from '../errors.ts'
import type { Logger } from '../log.ts'
import { RateLimiter } from '../limits.ts'
import type { Policy } from '../policy.ts'
import { atLeast, type Viewer } from '../viewer.ts'
import { parseComplexity } from './complexity.ts'
import {
  computeEvolution,
  mapMilestones,
  type RawCommit,
  type RawIssue,
  type RawMilestone,
  type RawPull,
} from './evolution.ts'
import { GithubClient, GithubError } from './github.ts'
import type { ChecklistSource } from './mychecklist.ts'
import { parsePlan } from './plan.ts'
import type {
  Checklist,
  Complexity,
  Evolution,
  ExternalChecklist,
  GhMilestone,
  PlanMilestone,
} from './types.ts'

/** Longest window offered and the commits read for it. */
export const MAX_DAYS = 90
const ISSUE_PAGES = 10
const PULL_PAGES = 5
const COMMIT_PAGES = 10

export interface ProjectOptions {
  github: GithubClient
  repo: string
  ref: string
  planPath: string
  complexityPath: string
  checklist: ChecklistSource
  ttlMs: number
  viewerPerMin: number
  logger: Logger
  now?: () => number
}

interface Entry<T> {
  value: T
  at: number
}

/** Staff only: the repo is private and the checklist is internal. 401 anonymous, 403 anyone else. */
export function requireProjectAccess(viewer: Viewer): void {
  if (viewer.id === null)
    throw new AppError('unauthenticated', 'Sign in to see the project.')
  if (!atLeast(viewer.role, 'staff'))
    throw new AppError('staff_required', 'The project page is for staff.')
}

class TtlSource<T> {
  #entry: Entry<T> | null = null
  #inflight: Promise<Entry<T>> | null = null
  readonly #load: () => Promise<T>
  readonly #ttl: number
  readonly #now: () => number
  readonly #onError: (e: unknown) => void

  constructor(
    load: () => Promise<T>,
    ttl: number,
    now: () => number,
    onError: (e: unknown) => void,
  ) {
    this.#load = load
    this.#ttl = ttl
    this.#now = now
    this.#onError = onError
  }

  async get(): Promise<{ value: T; at: number; stale: boolean }> {
    const e = this.#entry
    if (e && this.#now() - e.at < this.#ttl)
      return { value: e.value, at: e.at, stale: false }
    this.#inflight ??= this.#load()
      .then((value) => {
        this.#entry = { value, at: this.#now() }
        return this.#entry
      })
      .finally(() => {
        this.#inflight = null
      })
    try {
      const fresh = await this.#inflight
      return { value: fresh.value, at: fresh.at, stale: false }
    } catch (err) {
      this.#onError(err)
      if (e) return { value: e.value, at: e.at, stale: true }
      throw new AppError(
        'project_unavailable',
        'GitHub data is not available right now.',
      )
    }
  }
}

interface RawEvolution {
  issues: RawIssue[]
  pulls: RawPull[]
  commits: RawCommit[]
  milestones: RawMilestone[]
  truncated: boolean
}

export class ProjectService {
  readonly #o: ProjectOptions
  readonly #now: () => number
  readonly #limiter: RateLimiter
  readonly #raw: TtlSource<RawEvolution>
  readonly #plan: TtlSource<{
    plan: PlanMilestone[]
    milestones: RawMilestone[]
  }>
  readonly #complexity: TtlSource<ReturnType<typeof parseComplexity>>
  readonly #external: TtlSource<ExternalChecklist>

  constructor(opts: ProjectOptions) {
    this.#o = opts
    this.#now = opts.now ?? Date.now
    this.#limiter = new RateLimiter(opts.viewerPerMin)
    const onError = (source: string) => (e: unknown) =>
      opts.logger.warn('project_source_failed', {
        source,
        status: e instanceof GithubError ? e.status : 0,
      })
    const ttl = opts.ttlMs
    this.#raw = new TtlSource(
      () => this.#loadRaw(),
      ttl,
      this.#now,
      onError('github'),
    )
    this.#plan = new TtlSource(
      () => this.#loadPlan(),
      ttl,
      this.#now,
      onError('plan'),
    )
    this.#complexity = new TtlSource(
      () => this.#loadComplexity(),
      ttl,
      this.#now,
      onError('complexity'),
    )
    // MyChecklist never throws (it reports `status`), so a failure is a value, cached for one TTL.
    this.#external = new TtlSource(
      () => opts.checklist.load(),
      ttl,
      this.#now,
      onError('mychecklist'),
    )
  }

  /** Gate for every `project` query: staff only, then a per-viewer rate limit (owner is exempt). */
  authorize(
    viewer: Viewer,
    policy: Pick<Policy, 'rateLimits'> = { rateLimits: true },
  ): void {
    requireProjectAccess(viewer)
    if (policy.rateLimits) this.#limiter.hit(viewer.id!, this.#now())
  }

  async #loadRaw(): Promise<RawEvolution> {
    const { github, repo, ref } = this.#o
    const since = new Date(this.#now() - MAX_DAYS * 86_400_000).toISOString()
    const [issues, pulls, commits, milestones] = await Promise.all([
      github.paginate<RawIssue>(
        `/repos/${repo}/issues?state=all&per_page=100&sort=created&direction=desc`,
        ISSUE_PAGES,
      ),
      github.paginate<RawPull>(
        `/repos/${repo}/pulls?state=all&per_page=100&sort=created&direction=desc`,
        PULL_PAGES,
      ),
      github.paginate<RawCommit>(
        `/repos/${repo}/commits?sha=${encodeURIComponent(ref)}&since=${encodeURIComponent(since)}&per_page=100`,
        COMMIT_PAGES,
      ),
      github.paginate<RawMilestone>(
        `/repos/${repo}/milestones?state=all&per_page=100`,
        2,
      ),
    ])
    return {
      issues: issues.items,
      pulls: pulls.items,
      commits: commits.items,
      milestones: milestones.items,
      // Commits are bounded by the window on purpose; only issues and PRs can lose history.
      truncated: issues.truncated || pulls.truncated || commits.truncated,
    }
  }

  async #loadPlan() {
    const { github, repo, ref, planPath } = this.#o
    const [text, milestones] = await Promise.all([
      github.file(repo, planPath, ref),
      github.paginate<RawMilestone>(
        `/repos/${repo}/milestones?state=all&per_page=100`,
        2,
      ),
    ])
    if (text === null) throw new GithubError(404, 'Plan file not found.')
    return { plan: parsePlan(text), milestones: milestones.items }
  }

  async #loadComplexity() {
    const { github, repo, ref, complexityPath } = this.#o
    const text = await github.file(repo, complexityPath, ref)
    return text === null ? null : parseComplexity(text)
  }

  async evolution(days: number, milestone?: number | null): Promise<Evolution> {
    const d = Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS)
    const { value: raw, at, stale } = await this.#raw.get()
    const milestones = mapMilestones(raw.milestones)
    const ev = computeEvolution({
      repo: this.#o.repo,
      ref: this.#o.ref,
      now: this.#now(),
      days: d,
      issuesAndPrs: raw.issues,
      pulls: raw.pulls,
      commits: raw.commits,
      milestones,
      milestoneNumber: milestone ?? null,
      truncated: raw.truncated,
    })
    return { ...ev, generatedAt: new Date(at).toISOString(), stale }
  }

  async checklist(): Promise<Checklist> {
    const [{ value, at, stale }, external] = await Promise.all([
      this.#plan.get(),
      this.#external.get(),
    ])
    const milestones: GhMilestone[] = mapMilestones(value.milestones)
    return {
      generatedAt: new Date(at).toISOString(),
      stale,
      plan: value.plan,
      milestones,
      external: external.value,
    }
  }

  async complexity(): Promise<Complexity | null> {
    const { value, at, stale } = await this.#complexity.get()
    if (!value) return null
    return {
      repo: value.repo,
      generatedAt: new Date(at).toISOString(),
      stale,
      series: value.series,
    }
  }
}
