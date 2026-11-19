// `mentions` in `POST /chat`: things the user attached with `@` in the composer. Three kinds:
//  - native: a slug. Resolved against the server's own index (the client text is never trusted).
//  - issue: a number of the project repo. Staff only, like the `project` GraphQL field.
//  - session: a bounded summary of one of the user's own /ask conversations, kept in their browser.
//    It is the user's data, like `history`: capped, cleaned, escaped, and sent to the model as data.
// Strict like `parseMemories`: a wrong shape or an over-limit list is a 400, never silently cut.
// Only a count is ever logged; the cache is off when there are mentions.
import { AppError } from '../errors.ts'
import type { Policy } from '../policy.ts'
import type { ProjectService } from '../project/service.ts'
import type { Viewer } from '../viewer.ts'
import { cleanText, type PromptMention } from './prompt.ts'

/** Same numbers as `src/lib/ask/mentions.ts` in the client. */
export const MENTIONS_MAX_ITEMS = 5
// Sized so the worst request still fits `CHAT_MAX_BODY_BYTES` (16384): question 800 + history
// 6 x 800 + memories 2000 + sessions 4000 is about 12 KB of text.
export const MENTION_SESSION_MAX_CHARS = 2000
export const MENTION_SESSIONS_MAX_TOTAL = 4000
export const MENTION_TITLE_MAX_CHARS = 120
export const MENTION_ISSUE_BODY_MAX_CHARS = 2500

const SLUG = /^[\w.:/-]{1,160}$/

export type Mention =
  | { kind: 'native'; slug: string }
  | { kind: 'issue'; number: number }
  | { kind: 'session'; title: string; text: string }

export interface ResolvedMentions {
  /** Native slugs to pin as fuentes. */
  natives: string[]
  /** Issues and sessions, ready for `<menciones>`. */
  blocks: PromptMention[]
}

const bad = (message: string) => new AppError('bad_request', message)

/** Absent or `null` = none. Anything else must be an array of valid, distinct mentions. */
export function parseMentions(raw: unknown): Mention[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw bad('`mentions` must be an array.')
  if (raw.length > MENTIONS_MAX_ITEMS)
    throw bad(`\`mentions\` has more than ${MENTIONS_MAX_ITEMS} items.`)
  const out: Mention[] = []
  const seen = new Set<string>()
  let sessionChars = 0
  for (const m of raw) {
    if (m === null || typeof m !== 'object' || Array.isArray(m))
      throw bad('A mention must be an object.')
    const r = m as Record<string, unknown>
    let mention: Mention
    let id: string
    if (r.kind === 'native') {
      if (typeof r.slug !== 'string' || !SLUG.test(r.slug))
        throw bad('A native mention needs a valid `slug`.')
      mention = { kind: 'native', slug: r.slug }
      id = `n:${r.slug}`
    } else if (r.kind === 'issue') {
      if (
        typeof r.number !== 'number' ||
        !Number.isInteger(r.number) ||
        r.number < 1 ||
        r.number > 10_000_000
      )
        throw bad('An issue mention needs a positive integer `number`.')
      mention = { kind: 'issue', number: r.number }
      id = `i:${r.number}`
    } else if (r.kind === 'session') {
      if (typeof r.title !== 'string' || typeof r.text !== 'string')
        throw bad('A session mention needs `title` and `text` strings.')
      if (r.text.length > MENTION_SESSION_MAX_CHARS * 2)
        throw bad(
          `A session mention is longer than ${MENTION_SESSION_MAX_CHARS} characters.`,
        )
      const title = cleanText(r.title, MENTION_TITLE_MAX_CHARS).replace(
        /\s+/g,
        ' ',
      )
      const text = cleanText(r.text, MENTION_SESSION_MAX_CHARS)
      if (!title || !text) throw bad('A session mention is empty.')
      sessionChars += text.length
      mention = { kind: 'session', title, text }
      id = `s:${title}\n${text}`
    } else {
      throw bad('A mention `kind` must be native, issue or session.')
    }
    if (seen.has(id)) throw bad('`mentions` has a duplicate.')
    seen.add(id)
    out.push(mention)
  }
  if (sessionChars > MENTION_SESSIONS_MAX_TOTAL)
    throw bad(
      `Session mentions are longer than ${MENTION_SESSIONS_MAX_TOTAL} characters in total.`,
    )
  return out
}

export interface ResolveDeps {
  viewer: Viewer
  policy: Pick<Policy, 'rateLimits'>
  /** Null without `ASTRA_GITHUB_TOKEN`. */
  project: ProjectService | null
}

/**
 * Turns the parsed mentions into what the chat pipeline needs. An issue is read here, on the
 * server, after the same staff gate as the `project` query: the client only sends the number.
 */
export async function resolveMentions(
  mentions: readonly Mention[],
  deps: ResolveDeps,
): Promise<ResolvedMentions> {
  const natives: string[] = []
  const blocks: PromptMention[] = []
  const issues = mentions.filter((m) => m.kind === 'issue')
  if (issues.length) {
    // 401/403 before anything else: a non-staff viewer learns nothing about the repo.
    if (!deps.project)
      throw new AppError(
        'project_unavailable',
        'GitHub data is not available right now.',
      )
    deps.project.authorize(deps.viewer, deps.policy)
  }
  for (const m of mentions) {
    if (m.kind === 'native') natives.push(m.slug)
    else if (m.kind === 'session')
      blocks.push({ kind: 'session', ref: m.title, text: m.text })
    else {
      const issue = await deps.project!.issue(m.number)
      if (!issue || issue.isPull)
        throw new AppError('not_found', `Issue #${m.number} does not exist.`)
      const head = `#${issue.number} [${issue.state}] ${issue.title}`
      const labels = issue.labels.length
        ? `\nEtiquetas: ${issue.labels.join(', ')}`
        : ''
      const body = cleanText(issue.body, MENTION_ISSUE_BODY_MAX_CHARS)
      blocks.push({
        kind: 'issue',
        ref: `#${issue.number}`,
        text: `${head}${labels}${body ? `\n\n${body}` : ''}`,
      })
    }
  }
  return { natives, blocks }
}
