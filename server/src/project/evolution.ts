// Pure computations over raw GitHub data: issues opened/closed per day, commits per day and the
// burndown. No I/O, so they are tested against fixtures. Days are UTC calendar dates.
import type {
  Burndown,
  BurnPoint,
  DayPoint,
  Evolution,
  GhMilestone,
} from './types.ts'

export interface RawIssue {
  number: number
  state: 'open' | 'closed'
  created_at: string
  closed_at: string | null
  /** Present when the "issue" is really a pull request. */
  pull_request?: unknown
  milestone: { number: number } | null
}

export interface RawPull {
  number: number
  state: 'open' | 'closed'
  merged_at: string | null
}

export interface RawCommit {
  commit: { author: { date: string } | null }
}

export interface RawMilestone {
  number: number
  title: string
  state: 'open' | 'closed'
  due_on: string | null
  open_issues: number
  closed_issues: number
  html_url: string
}

const DAY = 86_400_000

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const startOfDay = (ms: number) => Math.floor(ms / DAY) * DAY

/** The last `days` UTC dates ending at `now`'s date, oldest first. */
export function windowDays(now: number, days: number): string[] {
  const end = startOfDay(now)
  return Array.from({ length: days }, (_, i) =>
    dayOf(end - (days - 1 - i) * DAY),
  )
}

export function mapMilestones(raw: RawMilestone[]): GhMilestone[] {
  return raw.map((m) => ({
    number: m.number,
    title: m.title,
    state: m.state,
    dueOn: m.due_on,
    open: m.open_issues,
    closed: m.closed_issues,
    url: m.html_url,
  }))
}

/** Milestone the burndown follows when the caller does not pick one: nearest due open one. */
export function defaultMilestone(
  milestones: readonly GhMilestone[],
): GhMilestone | null {
  const open = milestones.filter((m) => m.state === 'open')
  const dated = open
    .filter((m) => m.dueOn)
    .sort((a, b) => Date.parse(a.dueOn!) - Date.parse(b.dueOn!))
  return dated[0] ?? null
}

export function computeBurndown(
  issues: readonly RawIssue[],
  milestone: GhMilestone | null,
  dates: readonly string[],
): Burndown {
  // Pull requests come in the same list as issues; they are not backlog.
  const real = issues.filter((i) => !i.pull_request)
  const scope = milestone
    ? real.filter((i) => i.milestone?.number === milestone.number)
    : real
  const points: BurnPoint[] = dates.map((date) => {
    const endOfDay = Date.parse(`${date}T23:59:59.999Z`)
    const remaining = scope.filter(
      (i) =>
        Date.parse(i.created_at) <= endOfDay &&
        (i.closed_at === null || Date.parse(i.closed_at) > endOfDay),
    ).length
    return { date, remaining }
  })

  let ideal: BurnPoint[] | null = null
  if (milestone?.dueOn && points.length > 0) {
    const start = points[0]!.remaining
    const t0 = Date.parse(`${points[0]!.date}T00:00:00Z`)
    const due = Date.parse(milestone.dueOn)
    // A due date before the window leaves nothing to project.
    if (due > t0) {
      ideal = points.map(({ date }) => {
        const t = Date.parse(`${date}T00:00:00Z`)
        const left = 1 - (t - t0) / (due - t0)
        return {
          date,
          remaining: Math.max(0, Math.round(start * left * 10) / 10),
        }
      })
    }
  }
  return {
    milestone: milestone
      ? {
          number: milestone.number,
          title: milestone.title,
          dueOn: milestone.dueOn,
        }
      : null,
    points,
    ideal,
  }
}

export interface EvolutionInput {
  repo: string
  ref: string
  now: number
  days: number
  /** Everything GitHub lists as issues, pull requests included. */
  issuesAndPrs: readonly RawIssue[]
  pulls: readonly RawPull[]
  commits: readonly RawCommit[]
  milestones: readonly GhMilestone[]
  milestoneNumber?: number | null
  truncated: boolean
}

export function computeEvolution(
  input: EvolutionInput,
): Omit<Evolution, 'generatedAt' | 'stale'> {
  const dates = windowDays(input.now, input.days)
  const issues = input.issuesAndPrs.filter((i) => !i.pull_request)

  const opened = new Map<string, number>()
  const closed = new Map<string, number>()
  const commits = new Map<string, number>()
  const bump = (m: Map<string, number>, iso: string | null | undefined) => {
    if (!iso) return
    const d = iso.slice(0, 10)
    m.set(d, (m.get(d) ?? 0) + 1)
  }
  for (const i of issues) {
    bump(opened, i.created_at)
    bump(closed, i.closed_at)
  }
  for (const c of input.commits) bump(commits, c.commit.author?.date)

  const chosen =
    input.milestoneNumber == null
      ? defaultMilestone(input.milestones)
      : (input.milestones.find((m) => m.number === input.milestoneNumber) ??
        null)

  const open = computeBurndown(issues, null, dates).points
  const daily: DayPoint[] = dates.map((date, i) => ({
    date,
    opened: opened.get(date) ?? 0,
    closed: closed.get(date) ?? 0,
    commits: commits.get(date) ?? 0,
    open: open[i]!.remaining,
  }))

  return {
    repo: input.repo,
    ref: input.ref,
    truncated: input.truncated,
    days: input.days,
    totals: {
      openIssues: issues.filter((i) => i.state === 'open').length,
      closedIssues: issues.filter((i) => i.state === 'closed').length,
      openPrs: input.pulls.filter((p) => p.state === 'open').length,
      mergedPrs: input.pulls.filter((p) => p.merged_at !== null).length,
      commits: daily.reduce((n, d) => n + d.commits, 0),
    },
    daily,
    burndown: computeBurndown(issues, chosen, dates),
  }
}
