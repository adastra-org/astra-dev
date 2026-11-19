// Shared conversations: what is accepted, what is kept and who may read or revoke it.
//
// The server keeps no chat text anywhere else, so the snapshot arrives from the client and is
// forgeable: the view says so. What this layer does is (1) keep an allow-list of fields, so nothing
// the client sends beyond question/answer/citations is stored, (2) rebuild every source (title,
// anchor, path) from the docs index, so the client controls no URL, and (3) gate the link: audience,
// expiry, revocation and rate limits.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { cleanText } from '../chat/prompt.ts'
import type { Config } from '../config.ts'
import { chunkPath, type ChunkKind } from '../docs/chunk.ts'
import { AppError } from '../errors.ts'
import type { Retriever } from '../index/search.ts'
import { RateLimiter } from '../limits.ts'
import type { Logger } from '../log.ts'
import { policyFor } from '../policy.ts'
import { atLeast, requireChatAccess, type Viewer } from '../viewer.ts'
import type { ShareAudience, ShareRow, ShareStore } from './store.ts'

export const AUDIENCES: readonly ShareAudience[] = ['staff', 'public']

const MAX_QUESTION_CHARS = 4000
const MAX_TEXT_CHARS = 24_000
const MAX_SOURCES_PER_TURN = 12
const MAX_CITED_PER_TURN = 50
const MAX_REF = 99
const MAX_SLUG = 200
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/
const HOUR_MS = 3_600_000

export interface TurnInput {
  question: string
  text: string
  refused: boolean
  truncated: boolean
  cited: number[]
  sources: { n: number; slug: string; anchor: string | null }[]
}

export interface CreateInput {
  turns: TurnInput[]
  audience: string
  ttlHours?: number | null
}

export interface Created {
  id: string
  /** The only time the link token exists in clear. */
  token: string
  audience: ShareAudience
  expiresAt: number
}

export interface SharedSource {
  n: number
  kind: ChunkKind
  slug: string
  title: string
  heading: string | null
  anchor: string | null
  path: string
}

export interface SharedTurn {
  question: string
  text: string
  refused: boolean
  truncated: boolean
  cited: number[]
  sources: SharedSource[]
}

export interface SharedChat {
  audience: ShareAudience
  /** The sharer's handle, `staff` audience only. */
  sharedBy: string | null
  createdAt: number
  expiresAt: number
  turns: SharedTurn[]
}

export interface ShareSummary {
  id: string
  audience: ShareAudience
  createdAt: number
  expiresAt: number
  turns: number
  views: number
}

interface StoredTurn {
  question: string
  text: string
  refused: boolean
  truncated: boolean
  cited: number[]
  sources: { n: number; slug: string; anchor: string | null }[]
}

interface Payload {
  v: 1
  turns: StoredTurn[]
}

export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

const isRef = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_REF

export interface ShareServiceOptions {
  store: ShareStore
  retriever: Retriever | null
  config: Pick<Config, 'share' | 'limits'>
  logger: Logger
  now?: () => number
}

export class ShareService {
  readonly #store: ShareStore
  readonly #retriever: Retriever | null
  readonly #cfg: Config['share']
  readonly #limits: Pick<Config, 'limits'>
  readonly #logger: Logger
  readonly #now: () => number
  readonly #createViewer: RateLimiter
  readonly #createIp: RateLimiter
  readonly #readIp: RateLimiter
  readonly #missIp: RateLimiter

  constructor(o: ShareServiceOptions) {
    this.#store = o.store
    this.#retriever = o.retriever
    this.#cfg = o.config.share
    this.#limits = { limits: o.config.limits }
    this.#logger = o.logger
    this.#now = o.now ?? Date.now
    const s = o.config.share
    this.#createViewer = new RateLimiter(s.createViewerPerHour, HOUR_MS)
    this.#createIp = new RateLimiter(s.createIpPerHour, HOUR_MS)
    this.#readIp = new RateLimiter(s.readIpPerMin)
    this.#missIp = new RateLimiter(s.missIpPerMin)
  }

  /** What the client needs to draw the Share button and its dialog. */
  get settings() {
    return {
      maxTurns: this.#cfg.maxTurns,
      defaultTtlHours: this.#cfg.defaultTtlHours,
      maxTtlHours: this.#cfg.maxTtlHours,
    }
  }

  purge(): number {
    return this.#store.purge(this.#now())
  }

  create(viewer: Viewer, ip: string, input: CreateInput): Created {
    requireChatAccess(viewer)
    const now = this.#now()
    const audience = this.#audience(input.audience)
    // For now only staff publish links anyone can open: the text comes from the client, so a
    // public link would let any subscriber post made-up answers under this domain.
    if (audience === 'public' && !canSharePublic(viewer))
      throw new AppError(
        'staff_required',
        'Only staff can create public links.',
      )
    const ttlHours = this.#ttl(input.ttlHours)
    const payload = this.#sanitize(input.turns)

    if (policyFor(viewer, this.#limits).rateLimits) {
      this.#createIp.hit(ip, now)
      this.#createViewer.hit(viewer.id!, now)
    }

    const serialized = JSON.stringify(payload)
    if (Buffer.byteLength(serialized, 'utf8') > this.#cfg.maxBytes)
      throw new AppError(
        'payload_too_large',
        'The conversation is too long to share.',
      )

    const token = randomBytes(16).toString('base64url')
    const share = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      ownerId: viewer.id!,
      // Anonymous by design on public links.
      ownerHandle: audience === 'staff' ? viewer.handle : null,
      audience,
      createdAt: now,
      expiresAt: now + ttlHours * HOUR_MS,
      turns: payload.turns.length,
      payload: serialized,
    }
    const res = this.#store.create(
      share,
      { perViewer: this.#cfg.maxPerViewer, active: this.#cfg.maxActive },
      now,
    )
    if (res === 'viewer_limit')
      throw new AppError(
        'share_limit',
        `You already have ${this.#cfg.maxPerViewer} active links. Revoke one first.`,
      )
    if (res === 'global_limit')
      throw new AppError('share_limit', 'Sharing is at capacity. Try later.')
    this.#logger.info('share_created', {
      shareId: share.id,
      audience,
      turns: share.turns,
      ttlHours,
    })
    return {
      id: share.id,
      token,
      audience,
      expiresAt: share.expiresAt,
    }
  }

  /**
   * Opens a link. `viewer` is only resolved for `staff` links, so a `public` one keeps working with
   * accounts down. Unknown, malformed, expired and revoked all answer the same `share_not_found`.
   */
  async read(
    token: string,
    ip: string,
    resolveViewer: () => Promise<Viewer>,
  ): Promise<SharedChat> {
    const now = this.#now()
    this.#readIp.hit(ip, now)
    const row = TOKEN_RE.test(token)
      ? this.#store.findByHash(hashToken(token), now)
      : null
    if (!row) {
      // Guessing tokens burns this budget; once it is gone the answer is `rate_limited`.
      this.#missIp.hit(ip, now)
      throw notFound()
    }

    if (row.audience === 'staff') {
      const viewer = await resolveViewer()
      if (viewer.id === null)
        throw new AppError('unauthenticated', 'Sign in to open this link.')
      if (!atLeast(viewer.role, 'staff') && viewer.id !== row.ownerId)
        throw new AppError('staff_required', 'This link is for staff.')
    }

    const payload = this.#parse(row)
    this.#store.addView(row.id)
    this.#logger.info('share_read', { shareId: row.id, audience: row.audience })
    return {
      audience: row.audience,
      sharedBy: row.audience === 'staff' ? row.ownerHandle : null,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      turns: payload.turns.map((t) => ({
        question: t.question,
        text: t.text,
        refused: t.refused,
        truncated: t.truncated,
        cited: t.cited,
        sources: this.#rebuild(t.sources),
      })),
    }
  }

  /** Deletes the share (and its text). The owner of the link or staff may; anyone else sees nothing. */
  revoke(viewer: Viewer, id: string): true {
    if (viewer.id === null)
      throw new AppError('unauthenticated', 'Sign in to revoke a link.')
    const row = this.#store.get(id, this.#now())
    if (!row || (row.ownerId !== viewer.id && !atLeast(viewer.role, 'staff')))
      throw notFound()
    this.#store.delete(row.id)
    this.#logger.info('share_revoked', { shareId: row.id, by: viewer.id })
    return true
  }

  /** The caller's live links. Summaries only: no token (it is not stored) and no text. */
  list(viewer: Viewer): ShareSummary[] {
    requireChatAccess(viewer)
    return this.#store.listByOwner(viewer.id!, this.#now()).map((r) => ({
      id: r.id,
      audience: r.audience,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      turns: r.turns,
      views: r.views,
    }))
  }

  #audience(a: string): ShareAudience {
    if (!AUDIENCES.includes(a as ShareAudience))
      throw new AppError('bad_request', 'audience must be "staff" or "public".')
    return a as ShareAudience
  }

  #ttl(hours: number | null | undefined): number {
    const h = hours ?? this.#cfg.defaultTtlHours
    if (!Number.isInteger(h) || h < 1 || h > this.#cfg.maxTtlHours)
      throw new AppError(
        'bad_request',
        `ttlHours must be between 1 and ${this.#cfg.maxTtlHours}.`,
      )
    return h
  }

  /** Allow-list: only these fields leave this function, cleaned and capped. */
  #sanitize(turns: TurnInput[]): Payload {
    if (!Array.isArray(turns) || turns.length < 1)
      throw new AppError('bad_request', 'Pick at least one turn to share.')
    if (turns.length > this.#cfg.maxTurns)
      throw new AppError(
        'bad_request',
        `At most ${this.#cfg.maxTurns} turns per shared chat.`,
      )
    return { v: 1, turns: turns.map((t) => this.#turn(t)) }
  }

  #turn(t: TurnInput): StoredTurn {
    if (typeof t?.question !== 'string' || typeof t.text !== 'string')
      throw new AppError(
        'bad_request',
        'Each turn needs a question and a text.',
      )
    if (
      t.question.length > MAX_QUESTION_CHARS ||
      t.text.length > MAX_TEXT_CHARS
    )
      throw new AppError('payload_too_large', 'A turn is too long to share.')
    const question = cleanText(t.question, MAX_QUESTION_CHARS)
    const text = cleanText(t.text, MAX_TEXT_CHARS)
    if (!question || !text)
      throw new AppError(
        'bad_request',
        'Each turn needs a question and a text.',
      )

    const cited = [...new Set((t.cited ?? []).filter(isRef))].slice(
      0,
      MAX_CITED_PER_TURN,
    )
    const seen = new Set<number>()
    const sources: StoredTurn['sources'] = []
    for (const s of (t.sources ?? []).slice(0, MAX_SOURCES_PER_TURN)) {
      if (!isRef(s?.n) || seen.has(s.n)) continue
      if (typeof s.slug !== 'string' || s.slug.length > MAX_SLUG) continue
      // Title, anchor and path come from the index, never from the client. No index = no sources.
      const ref = this.#retriever?.sourceRef(
        s.slug,
        typeof s.anchor === 'string' && s.anchor.length <= MAX_SLUG
          ? s.anchor
          : null,
      )
      if (!ref) continue
      seen.add(s.n)
      sources.push({ n: s.n, slug: ref.slug, anchor: ref.anchor })
    }
    return {
      question,
      text,
      refused: t.refused === true,
      truncated: t.truncated === true,
      cited,
      sources,
    }
  }

  #parse(row: ShareRow): Payload {
    try {
      const p = JSON.parse(row.payload) as Payload
      if (p.v === 1 && Array.isArray(p.turns)) return p
    } catch {
      // fall through
    }
    // A row we wrote ourselves that no longer parses: treat it as gone rather than serve garbage.
    this.#logger.error('share_corrupt', { shareId: row.id })
    throw notFound()
  }

  /** Sources as the index describes them now. A slug that left the index is dropped. */
  #rebuild(stored: StoredTurn['sources']): SharedSource[] {
    const out: SharedSource[] = []
    for (const s of stored) {
      const ref = this.#retriever?.sourceRef(s.slug, s.anchor)
      if (!ref) continue
      out.push({
        n: s.n,
        kind: ref.kind,
        slug: ref.slug,
        title: ref.title,
        heading: ref.heading,
        anchor: ref.anchor,
        path: chunkPath(ref),
      })
    }
    return out
  }
}

/** Who may create a `public` link. */
export const canSharePublic = (viewer: Viewer): boolean =>
  viewer.id !== null && atLeast(viewer.role, 'staff')

const notFound = () =>
  new AppError('share_not_found', 'This link does not exist or has expired.')
