// GraphQL (Yoga + Pothos). Public, read-only, tiny: who am I, and docs search. The chat itself is
// SSE (`POST /chat`), because a streamed answer is not a query.
import SchemaBuilder from '@pothos/core'
import { GraphQLError } from 'graphql'
import { createYoga } from 'graphql-yoga'
import type { AppDeps } from './context.ts'
import { AppError } from './errors.ts'
import type { Hit } from './index/search.ts'
import type { Entitlement, Viewer } from './viewer.ts'

export interface GqlContext {
  request: Request
  ip: string
}

const MAX_QUERY_CHARS = 200
const MAX_LIMIT = 10

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

export function createSchema(deps: AppDeps) {
  const builder = new SchemaBuilder<{ Context: GqlContext }>({})

  const EntitlementRef = builder
    .objectRef<Entitlement>('Entitlement')
    .implement({
      fields: (t) => ({
        kind: t.exposeString('kind'),
        validUntil: t.string({ nullable: true, resolve: (e) => e.validUntil }),
      }),
    })

  const ViewerRef = builder.objectRef<Viewer>('Viewer').implement({
    fields: (t) => ({
      id: t.string({ nullable: true, resolve: (v) => v.id }),
      handle: t.string({ nullable: true, resolve: (v) => v.handle }),
      role: t.string({ resolve: (v) => v.role }),
      emailVerified: t.boolean({ resolve: (v) => v.emailVerified }),
      entitlements: t.field({
        type: [EntitlementRef],
        resolve: (v) => v.entitlements,
      }),
    }),
  })

  const HitRef = builder.objectRef<Hit>('SearchHit').implement({
    fields: (t) => ({
      slug: t.exposeString('slug'),
      title: t.exposeString('title'),
      heading: t.string({ nullable: true, resolve: (h) => h.heading }),
      anchor: t.string({ nullable: true, resolve: (h) => h.anchor }),
      path: t.string({
        resolve: (h) => `/docs/${h.slug}${h.anchor ? `#${h.anchor}` : ''}`,
      }),
      excerpt: t.exposeString('excerpt'),
      score: t.exposeFloat('score'),
    }),
  })

  const ResultRef = builder
    .objectRef<{ mode: string; degraded: boolean; hits: Hit[] }>('SearchResult')
    .implement({
      fields: (t) => ({
        mode: t.string({ resolve: (r) => r.mode }),
        degraded: t.boolean({ resolve: (r) => r.degraded }),
        hits: t.field({ type: [HitRef], resolve: (r) => r.hits }),
      }),
    })

  builder.queryType({
    fields: (t) => ({
      viewer: t.field({
        type: ViewerRef,
        resolve: async (_root, _args, ctx) => {
          try {
            return await deps.viewers.resolve(ctx.request)
          } catch (e) {
            throw asGraphQLError(e)
          }
        },
      }),
      searchDocs: t.field({
        type: ResultRef,
        args: {
          q: t.arg.string({ required: true }),
          limit: t.arg.int(),
        },
        resolve: async (_root, args, ctx) => {
          try {
            deps.limiters.searchIp.hit(ctx.ip)
            if (!deps.retriever)
              throw new AppError(
                'index_unavailable',
                'The docs index is not loaded.',
              )
            const q = args.q.trim().slice(0, MAX_QUERY_CHARS)
            if (!q) return { mode: 'keyword', degraded: false, hits: [] }
            const limit = Math.min(Math.max(args.limit ?? 8, 1), MAX_LIMIT)
            return await deps.retriever.search(q, limit)
          } catch (e) {
            throw asGraphQLError(e)
          }
        },
      }),
    }),
  })

  return builder.toSchema()
}

export function createGraphqlHandler(deps: AppDeps) {
  const yoga = createYoga<GqlContext>({
    schema: createSchema(deps),
    graphqlEndpoint: '/graphql',
    // No playground in production, no noise in logs, internal errors masked.
    graphiql: !deps.config.production,
    landingPage: false,
    logging: false,
    maskedErrors: true,
    // Yoga's default CORS reflects any Origin with credentials, which would let any website read
    // `viewer` with the visitor's cookie. The site calls /api/ same-origin, so no CORS at all.
    cors: false,
  })
  return (request: Request, ip: string) => yoga.fetch(request, { ip })
}
