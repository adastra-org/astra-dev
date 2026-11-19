// GraphQL for "Proyecto": one `project` field, staff only, with the checklist, the evolution panel
// and the complexity series as sub-fields. Access is checked once, in `project`; the sub-fields
// then load independently, so one failing source does not blank the page.
import type SchemaBuilder from '@pothos/core'
import { policyFor } from '../policy.ts'
import { GraphQLError } from 'graphql'
import type { AppDeps } from '../context.ts'
import { AppError } from '../errors.ts'
import type { GqlContext } from '../graphql.ts'
import type { ProjectService } from './service.ts'
import type {
  BurnPoint,
  Checklist,
  ChecklistGroup,
  ChecklistItem,
  Complexity,
  ComplexityPoint,
  DayPoint,
  Evolution,
  ExternalChecklist,
  GhMilestone,
  PlanGroup,
  PlanItem,
  PlanMilestone,
} from './types.ts'

type Builder = InstanceType<typeof SchemaBuilder<{ Context: GqlContext }>>

const asGraphQLError = (e: unknown): GraphQLError => {
  if (e instanceof AppError)
    return new GraphQLError(e.message, {
      extensions: {
        code: e.code,
        ...(e.retryAfter === undefined ? {} : { retryAfter: e.retryAfter }),
      },
    })
  return new GraphQLError('Internal error', {
    extensions: { code: 'internal' },
  })
}

const MAX_DAYS = 90

export function addProjectSchema(builder: Builder, deps: AppDeps) {
  const need = (): ProjectService => {
    if (!deps.project)
      throw new AppError(
        'project_unavailable',
        'The project page is not configured on this server.',
      )
    return deps.project
  }
  const guard = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      throw asGraphQLError(e)
    }
  }

  const PlanItemRef = builder.objectRef<PlanItem>('PlanItem').implement({
    fields: (t) => ({
      state: t.string({ resolve: (i) => i.state }),
      text: t.exposeString('text'),
    }),
  })
  const PlanGroupRef = builder.objectRef<PlanGroup>('PlanGroup').implement({
    fields: (t) => ({
      label: t.string({ nullable: true, resolve: (g) => g.label }),
      items: t.field({ type: [PlanItemRef], resolve: (g) => g.items }),
    }),
  })
  const GhMilestoneRef = builder
    .objectRef<GhMilestone>('GithubMilestone')
    .implement({
      fields: (t) => ({
        number: t.exposeInt('number'),
        title: t.exposeString('title'),
        state: t.string({ resolve: (m) => m.state }),
        dueOn: t.string({ nullable: true, resolve: (m) => m.dueOn }),
        open: t.exposeInt('open'),
        closed: t.exposeInt('closed'),
        url: t.exposeString('url'),
      }),
    })
  const PlanMilestoneRef = builder
    .objectRef<PlanMilestone>('PlanMilestone')
    .implement({
      fields: (t) => ({
        id: t.exposeString('id'),
        title: t.exposeString('title'),
        version: t.exposeString('version'),
        done: t.exposeInt('done'),
        partial: t.exposeInt('partial'),
        total: t.exposeInt('total'),
        groups: t.field({ type: [PlanGroupRef], resolve: (m) => m.groups }),
      }),
    })
  const ChecklistItemRef = builder
    .objectRef<ChecklistItem>('ChecklistItem')
    .implement({
      fields: (t) => ({
        id: t.exposeString('id'),
        shortId: t.string({ nullable: true, resolve: (i) => i.shortId }),
        text: t.exposeString('text'),
        done: t.exposeBoolean('done'),
      }),
    })
  const ChecklistGroupRef = builder
    .objectRef<ChecklistGroup>('ChecklistGroup')
    .implement({
      fields: (t) => ({
        title: t.string({ nullable: true, resolve: (g) => g.title }),
        items: t.field({ type: [ChecklistItemRef], resolve: (g) => g.items }),
      }),
    })
  const ExternalRef = builder
    .objectRef<ExternalChecklist>('ExternalChecklist')
    .implement({
      fields: (t) => ({
        status: t.string({ resolve: (e) => e.status }),
        name: t.exposeString('name'),
        open: t.exposeInt('open'),
        total: t.exposeInt('total'),
        groups: t.field({
          type: [ChecklistGroupRef],
          resolve: (e) => e.groups,
        }),
      }),
    })
  const ChecklistRef = builder
    .objectRef<Checklist>('ProjectChecklist')
    .implement({
      fields: (t) => ({
        generatedAt: t.exposeString('generatedAt'),
        stale: t.exposeBoolean('stale'),
        plan: t.field({ type: [PlanMilestoneRef], resolve: (c) => c.plan }),
        milestones: t.field({
          type: [GhMilestoneRef],
          resolve: (c) => c.milestones,
        }),
        external: t.field({ type: ExternalRef, resolve: (c) => c.external }),
      }),
    })

  const DayRef = builder.objectRef<DayPoint>('EvolutionDay').implement({
    fields: (t) => ({
      date: t.exposeString('date'),
      opened: t.exposeInt('opened'),
      closed: t.exposeInt('closed'),
      commits: t.exposeInt('commits'),
      open: t.exposeInt('open'),
    }),
  })
  const BurnPointRef = builder.objectRef<BurnPoint>('BurnPoint').implement({
    fields: (t) => ({
      date: t.exposeString('date'),
      remaining: t.exposeFloat('remaining'),
    }),
  })
  const BurndownRef = builder
    .objectRef<Evolution['burndown']>('Burndown')
    .implement({
      fields: (t) => ({
        milestoneNumber: t.int({
          nullable: true,
          resolve: (b) => b.milestone?.number ?? null,
        }),
        milestoneTitle: t.string({
          nullable: true,
          resolve: (b) => b.milestone?.title ?? null,
        }),
        dueOn: t.string({
          nullable: true,
          resolve: (b) => b.milestone?.dueOn ?? null,
        }),
        points: t.field({ type: [BurnPointRef], resolve: (b) => b.points }),
        ideal: t.field({
          type: [BurnPointRef],
          nullable: true,
          resolve: (b) => b.ideal,
        }),
      }),
    })
  const TotalsRef = builder
    .objectRef<Evolution['totals']>('EvolutionTotals')
    .implement({
      fields: (t) => ({
        openIssues: t.exposeInt('openIssues'),
        closedIssues: t.exposeInt('closedIssues'),
        openPrs: t.exposeInt('openPrs'),
        mergedPrs: t.exposeInt('mergedPrs'),
        commits: t.exposeInt('commits'),
      }),
    })
  const EvolutionRef = builder.objectRef<Evolution>('Evolution').implement({
    fields: (t) => ({
      repo: t.exposeString('repo'),
      ref: t.exposeString('ref'),
      generatedAt: t.exposeString('generatedAt'),
      stale: t.exposeBoolean('stale'),
      truncated: t.exposeBoolean('truncated'),
      days: t.exposeInt('days'),
      totals: t.field({ type: TotalsRef, resolve: (e) => e.totals }),
      daily: t.field({ type: [DayRef], resolve: (e) => e.daily }),
      burndown: t.field({ type: BurndownRef, resolve: (e) => e.burndown }),
    }),
  })

  const ComplexityPointRef = builder
    .objectRef<ComplexityPoint>('ComplexityPoint')
    .implement({
      fields: (t) => ({
        date: t.exposeString('date'),
        sha: t.exposeString('sha'),
        files: t.exposeInt('files'),
        lines: t.exposeInt('lines'),
        docLines: t.exposeInt('docLines'),
        churn: t.exposeInt('churn'),
      }),
    })
  const ComplexityRef = builder.objectRef<Complexity>('Complexity').implement({
    fields: (t) => ({
      repo: t.exposeString('repo'),
      generatedAt: t.exposeString('generatedAt'),
      stale: t.exposeBoolean('stale'),
      series: t.field({
        type: [ComplexityPointRef],
        resolve: (c) => c.series,
      }),
    }),
  })

  const ProjectRef = builder.objectRef<ProjectService>('Project').implement({
    fields: (t) => ({
      checklist: t.field({
        type: ChecklistRef,
        resolve: (p) => guard(() => p.checklist()),
      }),
      evolution: t.field({
        type: EvolutionRef,
        args: { days: t.arg.int(), milestone: t.arg.int() },
        resolve: (p, args) =>
          guard(() => {
            const days = args.days ?? 30
            if (days < 1 || days > MAX_DAYS)
              throw new AppError(
                'bad_request',
                `days must be between 1 and ${MAX_DAYS}.`,
              )
            return p.evolution(days, args.milestone)
          }),
      }),
      /** `null` when the repo has no series yet (`bun run complexity`). */
      complexity: t.field({
        type: ComplexityRef,
        nullable: true,
        resolve: (p) => guard(() => p.complexity()),
      }),
    }),
  })

  builder.queryField('project', (t) =>
    t.field({
      type: ProjectRef,
      resolve: async (_root, _args, ctx) =>
        guard(async () => {
          const svc = need()
          const viewer = await deps.viewers.resolve(ctx.request)
          svc.authorize(viewer, policyFor(viewer, deps.config))
          return svc
        }),
    }),
  )
}
