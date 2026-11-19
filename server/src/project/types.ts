// Shapes of the "Proyecto" data (M5). Everything here is derived server-side from GitHub, the plan
// file and (optionally) MyChecklist, and is what the GraphQL layer exposes. No secrets, no raw
// GitHub payloads.

export type PlanItemState = 'done' | 'partial' | 'todo'

export interface PlanItem {
  state: PlanItemState
  text: string
}

export interface PlanGroup {
  /** Paragraph that introduces the list, or `null` for the milestone's main list. */
  label: string | null
  items: PlanItem[]
}

export interface PlanMilestone {
  /** `M5`. */
  id: string
  title: string
  version: string
  groups: PlanGroup[]
  done: number
  partial: number
  total: number
}

export interface GhMilestone {
  number: number
  title: string
  state: 'open' | 'closed'
  dueOn: string | null
  open: number
  closed: number
  url: string
}

export interface ChecklistItem {
  id: string
  shortId: string | null
  text: string
  done: boolean
}

export interface ChecklistGroup {
  title: string | null
  items: ChecklistItem[]
}

export type ExternalStatus = 'ok' | 'disabled' | 'error' | 'not_found'

export interface ExternalChecklist {
  status: ExternalStatus
  /** Name of the list in MyChecklist. */
  name: string
  groups: ChecklistGroup[]
  open: number
  total: number
}

export interface Checklist {
  generatedAt: string
  /** True when GitHub failed and this is the last good copy. */
  stale: boolean
  plan: PlanMilestone[]
  /** Open issues and milestones of the repo, linked by `Mx` prefix to the plan milestones. */
  milestones: GhMilestone[]
  external: ExternalChecklist
}

export interface DayPoint {
  /** UTC date, `YYYY-MM-DD`. */
  date: string
  opened: number
  closed: number
  commits: number
  /** Open issues at the end of that day. */
  open: number
}

export interface BurnPoint {
  date: string
  remaining: number
}

export interface Burndown {
  milestone: { number: number; title: string; dueOn: string | null } | null
  points: BurnPoint[]
  /** Straight line to zero at the due date; `null` without a milestone with a due date. */
  ideal: BurnPoint[] | null
}

export interface Evolution {
  repo: string
  ref: string
  generatedAt: string
  stale: boolean
  /** The repo has more issues or commits than the server reads: the oldest are missing. */
  truncated: boolean
  days: number
  totals: {
    openIssues: number
    closedIssues: number
    openPrs: number
    mergedPrs: number
    /** Commits inside the window. */
    commits: number
  }
  daily: DayPoint[]
  burndown: Burndown
}

export interface ComplexityPoint {
  date: string
  sha: string
  files: number
  /** Source lines (code, styles, scripts, config). */
  lines: number
  /** Markdown lines. */
  docLines: number
  /** Lines added + deleted in the 7 days up to `date`. */
  churn: number
}

export interface Complexity {
  repo: string
  generatedAt: string
  stale: boolean
  series: ComplexityPoint[]
}
