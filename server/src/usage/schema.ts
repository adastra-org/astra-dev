// GraphQL for the owner dashboard: one `aiUsage(days)` field, owner only. Everything it returns is
// an aggregate over the usage records (ids and handles of viewers included, which is why the gate
// is `owner` and not `staff`).
import type SchemaBuilder from '@pothos/core'
import { GraphQLError } from 'graphql'
import type { AppDeps } from '../context.ts'
import { AppError } from '../errors.ts'
import type { GqlContext } from '../graphql.ts'
import type { Viewer } from '../viewer.ts'
import type {
  UsageDay,
  UsageModel,
  UsageOutcome,
  UsageReport,
  UsageTotals,
  UsageViewer,
} from './report.ts'

type Builder = InstanceType<typeof SchemaBuilder<{ Context: GqlContext }>>

const asGraphQLError = (e: unknown): GraphQLError =>
  e instanceof AppError
    ? new GraphQLError(e.message, { extensions: { code: e.code } })
    : new GraphQLError('Internal error', { extensions: { code: 'internal' } })

/** 401 anonymous, 403 anyone who is not the owner. */
export function requireOwner(viewer: Viewer): void {
  if (viewer.id === null)
    throw new AppError('unauthenticated', 'Sign in to see AI usage.')
  if (viewer.role !== 'owner')
    throw new AppError('owner_required', 'AI usage is for the owner.')
}

export function addUsageSchema(builder: Builder, deps: AppDeps) {
  const TotalsRef = builder.objectRef<UsageTotals>('AiTotals').implement({
    fields: (t) => ({
      requests: t.exposeInt('requests'),
      cacheHits: t.exposeInt('cacheHits'),
      cacheHitRate: t.exposeFloat('cacheHitRate'),
      inputTokens: t.exposeInt('inputTokens'),
      outputTokens: t.exposeInt('outputTokens'),
      gpuMs: t.exposeFloat('gpuMs'),
      gpuMeasured: t.exposeInt('gpuMeasured'),
      costUsdEst: t.exposeFloat('costUsdEst'),
      avgTtftMs: t.float({ nullable: true, resolve: (r) => r.avgTtftMs }),
      avgGenTps: t.float({ nullable: true, resolve: (r) => r.avgGenTps }),
      rateLimited: t.exposeInt('rateLimited'),
      budgetExceeded: t.exposeInt('budgetExceeded'),
      errors: t.exposeInt('errors'),
      fallbacks: t.exposeInt('fallbacks'),
      activeViewers: t.exposeInt('activeViewers'),
    }),
  })
  const DayRef = builder.objectRef<UsageDay>('AiDay').implement({
    fields: (t) => ({
      date: t.exposeString('date'),
      requests: t.exposeInt('requests'),
      inputTokens: t.exposeInt('inputTokens'),
      outputTokens: t.exposeInt('outputTokens'),
      gpuMs: t.exposeFloat('gpuMs'),
      costUsdEst: t.exposeFloat('costUsdEst'),
    }),
  })
  const ModelRef = builder.objectRef<UsageModel>('AiModel').implement({
    fields: (t) => ({
      provider: t.exposeString('provider'),
      model: t.exposeString('model'),
      requests: t.exposeInt('requests'),
      inputTokens: t.exposeInt('inputTokens'),
      outputTokens: t.exposeInt('outputTokens'),
      gpuMs: t.exposeFloat('gpuMs'),
      costUsdEst: t.exposeFloat('costUsdEst'),
      avgTtftMs: t.float({ nullable: true, resolve: (r) => r.avgTtftMs }),
      avgGenTps: t.float({ nullable: true, resolve: (r) => r.avgGenTps }),
      fallbacks: t.exposeInt('fallbacks'),
    }),
  })
  const ViewerRef = builder.objectRef<UsageViewer>('AiViewer').implement({
    fields: (t) => ({
      viewerId: t.exposeString('viewerId'),
      handle: t.string({ nullable: true, resolve: (r) => r.handle }),
      role: t.exposeString('role'),
      requests: t.exposeInt('requests'),
      tokens: t.exposeInt('tokens'),
      gpuMs: t.exposeFloat('gpuMs'),
    }),
  })
  const OutcomeRef = builder.objectRef<UsageOutcome>('AiOutcome').implement({
    fields: (t) => ({
      outcome: t.exposeString('outcome'),
      count: t.exposeInt('count'),
    }),
  })
  const ReportRef = builder.objectRef<UsageReport>('AiUsage').implement({
    fields: (t) => ({
      days: t.exposeInt('days'),
      from: t.exposeString('from'),
      to: t.exposeString('to'),
      generatedAt: t.exposeString('generatedAt'),
      lostRecords: t.exposeInt('lostRecords'),
      totals: t.field({ type: TotalsRef, resolve: (r) => r.totals }),
      daily: t.field({ type: [DayRef], resolve: (r) => r.daily }),
      models: t.field({ type: [ModelRef], resolve: (r) => r.models }),
      viewers: t.field({ type: [ViewerRef], resolve: (r) => r.viewers }),
      outcomes: t.field({ type: [OutcomeRef], resolve: (r) => r.outcomes }),
    }),
  })

  builder.queryField('aiUsage', (t) =>
    t.field({
      type: ReportRef,
      args: { days: t.arg.int() },
      resolve: async (_root, args, ctx) => {
        try {
          const viewer = await deps.viewers.resolve(ctx.request)
          requireOwner(viewer)
          if (!deps.usageReader)
            throw new AppError(
              'usage_unavailable',
              'Usage records are not enabled on this server (USAGE_DB_PATH).',
            )
          return deps.usageReader.report(args.days ?? 30)
        } catch (e) {
          throw asGraphQLError(e)
        }
      },
    }),
  )
}
