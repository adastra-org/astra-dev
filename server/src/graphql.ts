// GraphQL (Yoga + Pothos). Public, read-only, tiny: who am I, and docs search. The chat itself is
// SSE (`POST /chat`), because a streamed answer is not a query.
import SchemaBuilder from '@pothos/core'
import { GraphQLError } from 'graphql'
import { createYoga } from 'graphql-yoga'
import type { AppDeps } from './context.ts'
import { chunkPath, type ChunkKind, type NativeMeta } from './docs/chunk.ts'
import { AppError } from './errors.ts'
import type { Hit } from './index/search.ts'
import { policyFor } from './policy.ts'
import { addProjectSchema } from './project/schema.ts'
import { addUsageSchema } from './usage/schema.ts'
import type { Entitlement, Viewer } from './viewer.ts'

export interface GqlContext {
  request: Request
  ip: string
}

const MAX_QUERY_CHARS = 200
const MAX_LIMIT = 10

function parseKind(v: string | null | undefined): ChunkKind | undefined {
  if (v === undefined || v === null || v === '') return undefined
  if (v === 'doc' || v === 'native') return v
  throw new AppError('bad_request', 'kind must be "doc" or "native".')
}

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
      kind: t.string({ resolve: (h) => h.kind }),
      slug: t.exposeString('slug'),
      title: t.exposeString('title'),
      heading: t.string({ nullable: true, resolve: (h) => h.heading }),
      anchor: t.string({ nullable: true, resolve: (h) => h.anchor }),
      path: t.string({ resolve: (h) => chunkPath(h) }),
      excerpt: t.exposeString('excerpt'),
      score: t.exposeFloat('score'),
    }),
  })

  // Identity and signature of a native, no description or examples: like search hits, the public
  // API exposes extracts, never the full text of the corpus.
  const NativeRef = builder
    .objectRef<{ meta: NativeMeta; slug: string }>('Native')
    .implement({
      fields: (t) => ({
        id: t.string({ resolve: (n) => n.meta.id }),
        name: t.string({ resolve: (n) => n.meta.name }),
        luaName: t.string({ resolve: (n) => n.meta.luaName }),
        ns: t.string({ resolve: (n) => n.meta.ns }),
        apiset: t.string({ nullable: true, resolve: (n) => n.meta.apiset }),
        source: t.string({ resolve: (n) => n.meta.source }),
        hashes: t.stringList({ resolve: (n) => n.meta.hashes }),
        signature: t.string({ resolve: (n) => n.meta.signature }),
        path: t.string({
          resolve: (n) =>
            chunkPath({ kind: 'native', slug: n.slug, anchor: null }),
        }),
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

  /** The per-IP search limit. An owner (known by cookie) is exempt; anyone else, or an accounts failure, is limited. */
  const searchLimit = async (ctx: GqlContext) => {
    if (ctx.request.headers.get('cookie')) {
      try {
        const viewer = await deps.viewers.resolve(ctx.request)
        if (!policyFor(viewer, deps.config).rateLimits) return
      } catch {
        // accounts down: fall through to the limit
      }
    }
    deps.limiters.searchIp.hit(ctx.ip)
  }

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
          /** `doc` or `native`; omitted = both. */
          kind: t.arg.string(),
        },
        resolve: async (_root, args, ctx) => {
          try {
            await searchLimit(ctx)
            if (!deps.retriever)
              throw new AppError(
                'index_unavailable',
                'The docs index is not loaded.',
              )
            const kind = parseKind(args.kind)
            const q = args.q.trim().slice(0, MAX_QUERY_CHARS)
            if (!q) return { mode: 'keyword', degraded: false, hits: [] }
            const limit = Math.min(Math.max(args.limit ?? 8, 1), MAX_LIMIT)
            return await deps.retriever.search(q, limit, kind ? { kind } : {})
          } catch (e) {
            throw asGraphQLError(e)
          }
        },
      }),
      // Exact lookup by name, Lua name or hash (`GetEntityCoords`, `0xBB75D38B`).
      native: t.field({
        type: [NativeRef],
        args: { q: t.arg.string({ required: true }) },
        resolve: async (_root, args, ctx) => {
          try {
            await searchLimit(ctx)
            if (!deps.retriever)
              throw new AppError(
                'index_unavailable',
                'The docs index is not loaded.',
              )
            return deps.retriever
              .findNatives(args.q.trim().slice(0, MAX_QUERY_CHARS))
              .flatMap((c) =>
                c.native ? [{ meta: c.native, slug: c.slug }] : [],
              )
          } catch (e) {
            throw asGraphQLError(e)
          }
        },
      }),
    }),
  })

  addProjectSchema(builder, deps)
  addUsageSchema(builder, deps)

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
