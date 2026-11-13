// HTTP shell (Elysia). Behind nginx the public paths are `/api/*`; nginx strips the prefix, so the
// routes here are `/health`, `/ready`, `/graphql` and `/chat`.
import { createHash } from 'node:crypto'
import { Elysia } from 'elysia'
import { parseLang } from './chat/environment.ts'
import { citedLog } from './chat/log.ts'
import { sseResponse } from './chat/sse.ts'
import type { AppDeps } from './context.ts'
import { AppError, toAppError } from './errors.ts'
import { createGraphqlHandler } from './graphql.ts'
import { requireChatAccess } from './viewer.ts'

type ServerLike = { requestIP(req: Request): { address: string } | null } | null

const IP_RE = /^[0-9a-fA-F:.]{3,45}$/

export function clientIp(
  request: Request,
  server: ServerLike,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    // nginx sets X-Real-IP to $remote_addr, overwriting whatever the client sent.
    const real = request.headers.get('x-real-ip')?.trim()
    if (real && IP_RE.test(real)) return real
  }
  return server?.requestIP(request)?.address ?? 'unknown'
}

const ipHash = (ip: string) =>
  createHash('sha256').update(ip).digest('hex').slice(0, 12)

const jsonError = (e: AppError, requestId?: string) =>
  new Response(JSON.stringify(e.toBody()), {
    status: e.status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(e.retryAfter === undefined
        ? {}
        : { 'retry-after': String(e.retryAfter) }),
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
  })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

/** Reject cross-site browser requests: a cookie-authenticated POST must come from our own origin. */
function checkOrigin(request: Request, allowed: readonly string[]) {
  const origin = request.headers.get('origin')
  if (origin !== null && !allowed.includes(origin))
    throw new AppError('forbidden_origin', 'Origin not allowed.')
}

async function readChatBody(request: Request, maxBytes: number) {
  const type = request.headers.get('content-type') ?? ''
  if (!type.toLowerCase().startsWith('application/json'))
    throw new AppError('bad_request', 'Content-Type must be application/json.')
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > maxBytes)
    throw new AppError('payload_too_large', 'Request body is too large.')
  const buf = await request.arrayBuffer()
  if (buf.byteLength > maxBytes)
    throw new AppError('payload_too_large', 'Request body is too large.')
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(buf))
  } catch {
    throw new AppError('bad_request', 'Body is not valid JSON.')
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    throw new AppError('bad_request', 'Body must be a JSON object.')
  const { question, history, lang } = body as {
    question?: unknown
    history?: unknown
    lang?: unknown
  }
  if (typeof question !== 'string')
    throw new AppError('bad_request', '`question` must be a string.')
  return { question, history, lang: parseLang(lang) }
}

export function createApp(deps: AppDeps) {
  const { config, logger } = deps
  const graphql = createGraphqlHandler(deps)
  const now = deps.now ?? Date.now

  return new Elysia()
    .get('/health', () => json({ ok: true }))
    .get('/ready', () => {
      const r = deps.retriever
      const body = {
        ok: r !== null,
        app: 'astra-dev-server',
        sha: deps.build.sha,
        version: deps.build.version,
        slot: deps.build.slot,
        index: r?.info ?? null,
        llm: config.llm.provider,
      }
      return json(body, r ? 200 : 503)
    })
    .all('/graphql', ({ request, server }) => {
      // Same rule as /chat: a browser request from another site is refused before it is executed.
      try {
        checkOrigin(request, config.allowedOrigins)
      } catch (e) {
        return jsonError(toAppError(e))
      }
      return graphql(request, clientIp(request, server, config.trustProxy))
    })
    .post('/chat', async ({ request, server }) => {
      const started = now()
      const requestId = crypto.randomUUID()
      const ip = clientIp(request, server, config.trustProxy)
      const log: Record<string, unknown> = {
        requestId,
        route: 'chat',
        ip: ipHash(ip),
      }
      try {
        checkOrigin(request, config.allowedOrigins)
        const viewer = await deps.viewers.resolve(request)
        log.viewer = viewer.id
        log.role = viewer.role
        requireChatAccess(viewer)

        deps.limiters.chatIp.hit(ip)
        deps.limiters.chatViewer.hit(viewer.id!)

        if (!deps.chat)
          throw new AppError(
            'index_unavailable',
            'The docs index is not loaded.',
          )
        const { question, history, lang } = await readChatBody(
          request,
          config.chat.maxBodyBytes,
        )

        const run = await deps.chat.prepare({
          requestId,
          viewerKey: viewer.id!,
          role: viewer.role,
          question,
          history,
          lang,
          user: { handle: viewer.handle },
          showThinking: viewer.role === 'staff',
        })
        log.mode = run.mode
        log.degraded = run.degraded
        log.sources = run.sources.length
        log.cache = run.cacheHit ? 'hit' : 'miss'
        if (run.usedHistory != null) log.usedHistory = run.usedHistory
        if (run.gate) log.gate = `${run.gate.kept}/${run.gate.total}`

        return sseResponse(
          async function* (signal) {
            let outcome = 'ok'
            let tokens = 0
            try {
              for await (const ev of run.events(signal)) {
                if (ev.type === 'error') outcome = ev.code
                if (ev.type === 'done') {
                  tokens = ev.usage.inputTokens + ev.usage.outputTokens
                  Object.assign(log, citedLog(ev))
                }
                yield ev
              }
            } finally {
              logger.info('request', {
                ...log,
                status: 200,
                outcome,
                tokens,
                ms: now() - started,
              })
            }
          },
          { 'x-request-id': requestId },
        )
      } catch (e) {
        const err = toAppError(e)
        if (err.code === 'internal') logger.error('chat_failed', { requestId })
        logger.info('request', {
          ...log,
          status: err.status,
          outcome: err.code,
          ms: now() - started,
        })
        return jsonError(err, requestId)
      }
    })
    .onError(({ code, error }) => {
      if (code === 'NOT_FOUND')
        return jsonError(new AppError('not_found', 'Not found.'))
      logger.error('unhandled', {
        code: String(code),
        name: (error as Error).name,
      })
      return jsonError(new AppError('internal', 'Internal error'))
    })
}

export type App = ReturnType<typeof createApp>
