// Viewer port: who is asking. Accounts is a shared system living in the adastra-site server
// (session cookie on `.adastrarp.com`); this service only asks it `GET /api/auth/viewer` with the
// incoming cookie. Until that endpoint exists, `DevStubViewerPort` stands in (dev only).
import type { Config, Role } from './config.ts'
import { AppError } from './errors.ts'

export type { Role }

export interface Viewer {
  /** `null` for an anonymous visitor. */
  id: string | null
  handle: string | null
  role: Role
  entitlements: string[]
}

export const ANONYMOUS: Viewer = {
  id: null,
  handle: null,
  role: 'public',
  entitlements: [],
}

export interface ViewerPort {
  /** Resolve the viewer behind a request. Throws `viewer_unavailable` when accounts is down. */
  resolve(request: Request): Promise<Viewer>
}

const STAFF_ROLES = new Set(['staff', 'admin', 'owner'])

/** Map the accounts payload onto our three roles. Anything unknown is `public` (fail closed). */
export function parseViewer(payload: unknown): Viewer {
  if (payload === null || typeof payload !== 'object') return ANONYMOUS
  const p = payload as Record<string, unknown>
  const id = typeof p.id === 'string' && p.id ? p.id : null
  if (!id) return ANONYMOUS
  const entitlements = Array.isArray(p.entitlements)
    ? p.entitlements
        .filter((e): e is string => typeof e === 'string')
        .slice(0, 50)
    : []
  const role = typeof p.role === 'string' ? p.role.toLowerCase() : ''
  let mapped: Role = 'public'
  if (STAFF_ROLES.has(role)) mapped = 'staff'
  else if (role === 'subscriber' || entitlements.includes('subscriber'))
    mapped = 'subscriber'
  return {
    id,
    handle: typeof p.handle === 'string' ? p.handle.slice(0, 64) : null,
    role: mapped,
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
  /** Short cache so a burst of requests does not hit accounts each time. A revoked session lingers this long. */
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
    this.#opts = { cacheMs: 30_000, ...opts }
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
        viewer = parseViewer(await res.json())
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
            entitlements: role === 'subscriber' ? ['subscriber'] : [],
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
