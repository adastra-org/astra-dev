// GraphQL for shared chats. Create and revoke are mutations; reading a link and listing yours are
// queries. Every operation answers `share_unavailable` while `SHARE_DB_PATH` is not set.
import type SchemaBuilder from '@pothos/core'
import { GraphQLError } from 'graphql'
import type { AppDeps } from '../context.ts'
import { AppError } from '../errors.ts'
import type { GqlContext } from '../graphql.ts'
import type { Created, ShareService, ShareSummary } from './service.ts'
import type { SharedChat, SharedSource, SharedTurn } from './service.ts'

type Builder = InstanceType<typeof SchemaBuilder<{ Context: GqlContext }>>

const asGraphQLError = (e: unknown): GraphQLError =>
  e instanceof AppError
    ? new GraphQLError(e.message, {
        extensions: {
          code: e.code,
          ...(e.retryAfter === undefined ? {} : { retryAfter: e.retryAfter }),
        },
      })
    : new GraphQLError('Internal error', { extensions: { code: 'internal' } })

const iso = (ms: number) => new Date(ms).toISOString()

export function addShareSchema(builder: Builder, deps: AppDeps) {
  const service = (): ShareService => {
    if (!deps.share)
      throw new AppError(
        'share_unavailable',
        'Sharing is not enabled on this server (SHARE_DB_PATH).',
      )
    return deps.share
  }

  const SourceInput = builder.inputType('ShareSourceInput', {
    fields: (t) => ({
      n: t.int({ required: true }),
      slug: t.string({ required: true }),
      anchor: t.string(),
    }),
  })
  const TurnInput = builder.inputType('ShareTurnInput', {
    fields: (t) => ({
      question: t.string({ required: true }),
      text: t.string({ required: true }),
      refused: t.boolean({ required: true }),
      truncated: t.boolean({ required: true }),
      cited: t.intList({ required: true }),
      sources: t.field({ type: [SourceInput], required: true }),
    }),
  })

  const CreatedRef = builder.objectRef<Created>('SharedChatCreated').implement({
    fields: (t) => ({
      id: t.exposeString('id'),
      token: t.exposeString('token'),
      audience: t.exposeString('audience'),
      expiresAt: t.string({ resolve: (c) => iso(c.expiresAt) }),
    }),
  })

  const SummaryRef = builder
    .objectRef<ShareSummary>('SharedChatSummary')
    .implement({
      fields: (t) => ({
        id: t.exposeString('id'),
        audience: t.exposeString('audience'),
        createdAt: t.string({ resolve: (s) => iso(s.createdAt) }),
        expiresAt: t.string({ resolve: (s) => iso(s.expiresAt) }),
        turns: t.exposeInt('turns'),
        views: t.exposeInt('views'),
      }),
    })

  const SharedSourceRef = builder
    .objectRef<SharedSource>('SharedSource')
    .implement({
      fields: (t) => ({
        n: t.exposeInt('n'),
        kind: t.string({ resolve: (s) => s.kind }),
        slug: t.exposeString('slug'),
        title: t.exposeString('title'),
        heading: t.string({ nullable: true, resolve: (s) => s.heading }),
        anchor: t.string({ nullable: true, resolve: (s) => s.anchor }),
        path: t.exposeString('path'),
      }),
    })

  const SharedTurnRef = builder.objectRef<SharedTurn>('SharedTurn').implement({
    fields: (t) => ({
      question: t.exposeString('question'),
      text: t.exposeString('text'),
      refused: t.exposeBoolean('refused'),
      truncated: t.exposeBoolean('truncated'),
      cited: t.exposeIntList('cited'),
      sources: t.field({ type: [SharedSourceRef], resolve: (s) => s.sources }),
    }),
  })

  const SharedChatRef = builder.objectRef<SharedChat>('SharedChat').implement({
    fields: (t) => ({
      audience: t.exposeString('audience'),
      sharedBy: t.string({ nullable: true, resolve: (c) => c.sharedBy }),
      createdAt: t.string({ resolve: (c) => iso(c.createdAt) }),
      expiresAt: t.string({ resolve: (c) => iso(c.expiresAt) }),
      turns: t.field({ type: [SharedTurnRef], resolve: (c) => c.turns }),
    }),
  })

  const ConfigRef = builder
    .objectRef<{
      enabled: boolean
      maxTurns: number
      defaultTtlHours: number
      maxTtlHours: number
    }>('ShareConfig')
    .implement({
      fields: (t) => ({
        enabled: t.exposeBoolean('enabled'),
        maxTurns: t.exposeInt('maxTurns'),
        defaultTtlHours: t.exposeInt('defaultTtlHours'),
        maxTtlHours: t.exposeInt('maxTtlHours'),
      }),
    })

  builder.mutationFields((t) => ({
    shareChat: t.field({
      type: CreatedRef,
      args: {
        turns: t.arg({ type: [TurnInput], required: true }),
        audience: t.arg.string({ required: true }),
        ttlHours: t.arg.int(),
      },
      resolve: async (_root, args, ctx) => {
        try {
          const svc = service()
          const viewer = await deps.viewers.resolve(ctx.request)
          return svc.create(viewer, ctx.ip, {
            turns: args.turns.map((x) => ({
              question: x.question,
              text: x.text,
              refused: x.refused,
              truncated: x.truncated,
              cited: x.cited,
              sources: x.sources.map((s) => ({
                n: s.n,
                slug: s.slug,
                anchor: s.anchor ?? null,
              })),
            })),
            audience: args.audience,
            ttlHours: args.ttlHours ?? null,
          })
        } catch (e) {
          throw asGraphQLError(e)
        }
      },
    }),
    revokeShare: t.boolean({
      args: { id: t.arg.string({ required: true }) },
      resolve: async (_root, args, ctx) => {
        try {
          const svc = service()
          const viewer = await deps.viewers.resolve(ctx.request)
          return svc.revoke(viewer, args.id)
        } catch (e) {
          throw asGraphQLError(e)
        }
      },
    }),
  }))

  builder.queryFields((t) => ({
    shareConfig: t.field({
      type: ConfigRef,
      resolve: () =>
        deps.share
          ? { enabled: true, ...deps.share.settings }
          : {
              enabled: false,
              maxTurns: 0,
              defaultTtlHours: 0,
              maxTtlHours: 0,
            },
    }),
    myShares: t.field({
      type: [SummaryRef],
      resolve: async (_root, _args, ctx) => {
        try {
          const svc = service()
          const viewer = await deps.viewers.resolve(ctx.request)
          return svc.list(viewer)
        } catch (e) {
          throw asGraphQLError(e)
        }
      },
    }),
    sharedChat: t.field({
      type: SharedChatRef,
      args: { token: t.arg.string({ required: true }) },
      resolve: async (_root, args, ctx) => {
        try {
          return await service().read(args.token, ctx.ip, () =>
            deps.viewers.resolve(ctx.request),
          )
        } catch (e) {
          throw asGraphQLError(e)
        }
      },
    }),
  }))
}
