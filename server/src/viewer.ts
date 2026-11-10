// Viewer port: who is asking. Accounts is a shared system living in the adastra-site server
// (session cookie on `.adastrarp.com`); this service only asks it `GET /api/auth/viewer` with the
// incoming cookie (contract: adastra-site docs/accounts/README.md). `DevStubViewerPort` stands in
// for it in dev only.
import type { Config, Role } from './config.ts'
import { AppError } from './errors.ts'

export type { Role }

export interface Viewer {
  /** `null` for an anonymous visitor. */
  id: string | null
  handle: string | null
  /** Our permission level, derived from the accounts payload (never taken from it verbatim). */
  role: Role
  /** Accounts says the email is verified. Informational: chat access does not depend on it. */
  emailVerified: boolean
  /** Active entitlements as accounts reports them, expired ones dropped. */
  entitlements: Entitlement[]
}

export interface Entitlement {
  kind: string
  /** ISO date the entitlement ends, `null` when it does not expire. */
  validUntil: string | null
}

/** Accounts entitlement that makes someone a subscriber (Tebex). */
export const SUBSCRIBER_KIND = 'tebex-subscriber'

export const ANONYMOUS: Viewer = {
  id: null,
  handle: null,
  role: 'public',
  emailVerified: false,
  entitlements: [],
}

export interface ViewerPort {
  /** Resolve the viewer behind a request. Throws `viewer_unavailable` when accounts is down. */
  resolve(request: Request): Promise<Viewer>
}

/**
 * An entitlement entry from accounts, or `null` when it is malformed or already expired.
 * `validUntil: null` means it does not expire. An unparseable date counts as expired (fail closed).
 */
function parseEntitlement(raw: unknown, now: number): Entitlement | null {
  if (raw === null || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.kind !== 'string' || !e.kind) return null
  const until = e.validUntil
  if (until === null || until === undefined)
    return { kind: e.kind.slice(0, 64), validUntil: null }
  if (typeof until !== 'string') return null
  const t = Date.parse(until)
  if (!Number.isFinite(t) || t <= now) return null
  return { kind: e.kind.slice(0, 64), validUntil: until }
}

/**
 * Map the accounts payload onto our three roles. Anything unknown is `public` (fail closed):
 * `role === 'staff'` is staff; an active `tebex-subscriber` entitlement is subscriber.
 * Accounts only lists active entitlements, but we check `validUntil` too.
 */
export function parseViewer(payload: unknown, now = Date.now()): Viewer {
  if (payload === null || typeof payload !== 'object') return ANONYMOUS
  const p = payload as Record<string, unknown>
  const id = typeof p.id === 'string' && p.id ? p.id : null
  if (!id) return ANONYMOUS
  const entitlements = Array.isArray(p.entitlements)
    ? p.entitlements
        .slice(0, 50)
        .map((e) => parseEntitlement(e, now))
        .filter((e): e is Entitlement => e !== null)
    : []
  let role: Role = 'public'
  if (p.role === 'staff') role = 'staff'
  else if (entitlements.some((e) => e.kind === SUBSCRIBER_KIND))
    role = 'subscriber'
  return {
    id,
    handle: typeof p.handle === 'string' ? p.handle.slice(0, 64) : null,
    role,
    emailVerified: p.emailVerified === true,
    entitlements,
  }
}

const sha256 = async (s: string) =>
  Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)),
  ).toString('hex')

export interface HttpViewerOptions {
  baseUrl: string
  path: string
  timeoutMs: number
  /** Short cache (accounts advises a few seconds at most). A revoked session or entitlement lingers this long. */
  cacheMs?: number
  fetch?: typeof fetch
  now?: () => number
}

export class HttpViewerPort implements ViewerPort {
  readonly #opts: Required<Omit<HttpViewerOptions, 'fetch' | 'now'>>
  readonly #fetch: typeof fetch
  readonly #now: () => number
  readonly #cache = new Map<string, { viewer: Viewer; until: number }>()

  constructor(opts: HttpViewerOptions) {
    this.#opts = { cacheMs: 5_000, ...opts }
    this.#fetch = opts.fetch ?? fetch
    this.#now = opts.now ?? Date.now
  }

  async resolve(request: Request): Promise<Viewer> {
    const cookie = request.headers.get('cookie')
    if (!cookie) return ANONYMOUS

    const key = await sha256(cookie)
    const now = this.#now()
    const hit = this.#cache.get(key)
    if (hit && hit.until > now) return hit.viewer

    let res: Response
    try {
      res = await this.#fetch(`${this.#opts.baseUrl}${this.#opts.path}`, {
        headers: { cookie, accept: 'application/json' },
        redirect: 'manual',
        signal: AbortSignal.timeout(this.#opts.timeoutMs),
      })
    } catch {
      throw new AppError(
        'viewer_unavailable',
        'The accounts service is not reachable.',
      )
    }

    let viewer: Viewer
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      viewer = ANONYMOUS
    } else if (!res.ok) {
      throw new AppError(
        'viewer_unavailable',
        'The accounts service answered with an error.',
      )
    } else {
      try {
        viewer = parseViewer(await res.json(), now)
      } catch {
        throw new AppError(
          'viewer_unavailable',
          'The accounts service returned an unreadable viewer.',
        )
      }
    }

    if (this.#cache.size > 2000) this.#cache.clear()
    this.#cache.set(key, { viewer, until: now + this.#opts.cacheMs })
    return viewer
  }
}

/** Dev only: a fixed viewer. `createViewerPort` never builds this when `production` is true. */
export class DevStubViewerPort implements ViewerPort {
  readonly #viewer: Viewer
  constructor(role: Role) {
    this.#viewer =
      role === 'public'
        ? ANONYMOUS
        : {
            id: `dev-${role}`,
            handle: `dev-${role}`,
            role,
            emailVerified: true,
            entitlements:
              role === 'subscriber'
                ? [{ kind: SUBSCRIBER_KIND, validUntil: null }]
                : [],
          }
  }
  resolve(): Promise<Viewer> {
    return Promise.resolve(this.#viewer)
  }
}

export function createViewerPort(config: Config): ViewerPort {
  // The config loader already nulls devViewer in production; the check is repeated on purpose.
  if (!config.production && config.devViewer)
    return new DevStubViewerPort(config.devViewer)
  return new HttpViewerPort({
    baseUrl: config.accounts.baseUrl,
    path: config.accounts.viewerPath,
    timeoutMs: config.accounts.timeoutMs,
  })
}

/** Chat needs a signed-in subscriber or staff. 401 for anonymous, 403 for signed-in without access. */
export function requireChatAccess(viewer: Viewer): void {
  if (viewer.id === null)
    throw new AppError('unauthenticated', 'Sign in to use Ask Ether.')
  if (viewer.role !== 'subscriber' && viewer.role !== 'staff')
    throw new AppError(
      'subscription_required',
      'Ask Ether is for subscribers and staff.',
    )
}
