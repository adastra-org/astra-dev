// Forma de los datos de "Proyecto" tal como los devuelve `project` en GraphQL (server/src/project).

export type PlanState = 'done' | 'partial' | 'todo'

export interface PlanItem {
  state: PlanState
  text: string
}

export interface PlanGroup {
  label: string | null
  items: PlanItem[]
}

export interface PlanMilestone {
  id: string
  title: string
  version: string
  done: number
  partial: number
  total: number
  groups: PlanGroup[]
}

export interface GithubMilestone {
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
  name: string
  open: number
  total: number
  groups: ChecklistGroup[]
}

export interface Checklist {
  generatedAt: string
  stale: boolean
  plan: PlanMilestone[]
  milestones: GithubMilestone[]
  external: ExternalChecklist
}

export interface EvolutionDay {
  date: string
  opened: number
  closed: number
  commits: number
  open: number
}

export interface BurnPoint {
  date: string
  remaining: number
}

export interface Evolution {
  repo: string
  ref: string
  generatedAt: string
  stale: boolean
  truncated: boolean
  days: number
  totals: {
    openIssues: number
    closedIssues: number
    openPrs: number
    mergedPrs: number
    commits: number
  }
  daily: EvolutionDay[]
  burndown: {
    milestoneNumber: number | null
    milestoneTitle: string | null
    dueOn: string | null
    points: BurnPoint[]
    ideal: BurnPoint[] | null
  }
}

export interface ComplexityPoint {
  date: string
  sha: string
  files: number
  lines: number
  docLines: number
  churn: number
}

export interface Complexity {
  repo: string
  generatedAt: string
  stale: boolean
  series: ComplexityPoint[]
}

export interface ChecklistData {
  checklist: Checklist
  complexity: Complexity | null
}
