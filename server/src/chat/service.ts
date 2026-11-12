// Retrieval-augmented completion, no tools. Two phases so the HTTP layer can still answer with a
// plain JSON error: `prepare` (retrieve, build prompt, reserve budget) throws AppError; `events`
// then streams and never throws (failures become an `error` event).
import { chunkPath, type ChunkKind } from '../docs/chunk.ts'
import { AppError } from '../errors.ts'
import type { Role } from '../config.ts'
import type { Retriever, SearchMode } from '../index/search.ts'
import type { ContextGate } from '../decision/gate.ts'
import type { FollowUpDecider } from '../decision/followup.ts'
import { renderEnv, type ChatLang } from './environment.ts'
import type { HeadSource } from './head.ts'
import type { LlmProvider } from '../llm/provider.ts'
import { estimateTokens, type TokenBudget } from '../limits.ts'
import { cacheKey, type AnswerCache } from './cache.ts'
import {
  REFUSAL_ES,
  buildPrompt,
  citedNumbers,
  isRefusal,
  sanitizeHistory,
  cleanText,
  type BuiltPrompt,
  type HistoryTurn,
} from './prompt.ts'

export interface ChatSettings {
  maxQuestionChars: number
  maxHistoryTurns: number
  maxHistoryTurnChars: number
  maxOutputTokens: number
  maxOutputChars: number
  topK: number
  nativesTopK: number
  contextMaxChars: number
}

export interface Source {
  n: number
  kind: ChunkKind
  slug: string
  title: string
  heading: string | null
  anchor: string | null
  /** Site path the browser can link to. */
  path: string
  excerpt: string
  score: number
}

export type ChatEvent =
  | { type: 'meta'; requestId: string; mode: SearchMode; degraded: boolean }
  | { type: 'sources'; sources: Source[] }
  | { type: 'delta'; text: string }
  | {
      type: 'done'
      cited: number[]
      refused: boolean
      truncated: boolean
      /** The answer came from the cache: no model call, no tokens spent. */
      cached?: boolean
      usage: { inputTokens: number; outputTokens: number }
    }
  | { type: 'error'; code: string; message: string }

export interface ChatRun {
  mode: SearchMode
  degraded: boolean
  sources: Source[]
  /** True when `events` replays a cached answer (no model call). */
  cacheHit?: boolean
  /** What the decision step said: true = used history, false = standalone, null = not asked or no answer. */
  usedHistory?: boolean | null
  /** Context gate result: fragments kept out of those retrieved. Absent = no gate or it could not decide. */
  gate?: { kept: number; total: number } | null
  events(signal?: AbortSignal): AsyncGenerator<ChatEvent>
}

export interface ChatDeps {
  retriever: Retriever
  llm: LlmProvider
  budget: TokenBudget
  settings: ChatSettings
  /** Optional answer cache. Absent or disabled = every question goes to the model. */
  cache?: AnswerCache
  /** Optional: decides whether the previous turn goes into the retrieval query. */
  decider?: FollowUpDecider
  /** Optional: drops retrieved fragments the question does not need before they reach the prompt. */
  gate?: ContextGate
  /** Optional: branch and last commit shown to the model in <entorno>. */
  head?: HeadSource
  /** Version of the running build, shown in <entorno>. */
  version?: string
  now?: () => Date
}

export interface ChatInput {
  requestId: string
  /** Budget key (viewer id). */
  viewerKey: string
  /** Part of the cache key: viewers with different roles never share a cached answer. */
  role: Role
  question: string
  history: unknown
  /** UI language of the visitor. */
  lang?: ChatLang
  /** Who asks. Only goes to the model inside <entorno>; never part of the cache key. */
  user?: { handle: string | null }
}

/** Cached answers are replayed in a few deltas so the client path is the same as a live stream. */
const REPLAY_CHUNK = 160

export class ChatService {
  readonly #d: ChatDeps
  constructor(deps: ChatDeps) {
    this.#d = deps
  }

  async prepare(input: ChatInput): Promise<ChatRun> {
    const s = this.#d.settings
    const question = cleanText(input.question, s.maxQuestionChars)
    if (!question) throw new AppError('bad_request', 'The question is empty.')
    const history: HistoryTurn[] = sanitizeHistory(
      input.history,
      s.maxHistoryTurns,
      s.maxHistoryTurnChars,
    )

    // The query is the question plus the last user turn, so follow-ups ("and how do I draw it?") retrieve well.
    // With a decider, a question that stands on its own is searched alone: the previous topic would
    // otherwise pull unrelated sources in. No decider or no answer = the old behaviour.
    const lastUser = [...history].reverse().find((t) => t.role === 'user')
    let usedHistory: boolean | null = null
    if (lastUser && this.#d.decider) {
      const lastAssistant = [...history]
        .reverse()
        .find((t) => t.role === 'assistant')
      usedHistory = await this.#d.decider.dependsOnHistory({
        lastUser: lastUser.content,
        lastAssistant: lastAssistant?.content ?? null,
        question,
      })
    }
    const query =
      lastUser && usedHistory !== false
        ? `${lastUser.content}\n${question}`
        : question
    // Docs and natives are ranked apart: ~7,000 natives would otherwise crowd the docs out. A
    // native named in the question (by name or hash) always comes first.
    const [found, head] = await Promise.all([
      this.#d.retriever.searchMany(query.slice(0, s.maxQuestionChars * 2), [
        { kind: 'doc', k: s.topK },
        ...(s.nativesTopK > 0
          ? [{ kind: 'native' as const, k: s.nativesTopK }]
          : []),
      ]),
      this.#d.head?.get() ?? Promise.resolve(null),
    ])

    // The gate only removes fragments. null = it could not decide: everything stays.
    let hits = found.hits
    let gate: { kept: number; total: number } | null = null
    if (this.#d.gate && hits.length) {
      const kept = await this.#d.gate.select(question, hits)
      if (kept) {
        gate = { kept: kept.length, total: hits.length }
        hits = kept
      }
    }

    const now = (this.#d.now ?? (() => new Date()))()
    const lang: ChatLang = input.lang ?? 'es'
    const built: BuiltPrompt = buildPrompt({
      question,
      history,
      hits,
      contextMaxChars: s.contextMaxChars,
      env: renderEnv({
        lang,
        now,
        head,
        version: this.#d.version ?? 'dev',
        user: { handle: input.user?.handle ?? null, role: input.role },
      }),
    })
    const sources: Source[] = built.used.map((h, i) => ({
      n: i + 1,
      kind: h.kind,
      slug: h.slug,
      title: h.title,
      heading: h.heading,
      anchor: h.anchor,
      path: chunkPath(h),
      excerpt: h.excerpt,
      score: Math.round(h.score * 1000) / 1000,
    }))

    const base = {
      mode: found.mode,
      degraded: found.degraded,
      sources,
      usedHistory,
      gate,
    }

    // Nothing retrieved: refuse without calling the model (and without spending budget).
    if (!built.used.length) {
      return {
        ...base,
        async *events() {
          yield {
            type: 'meta',
            requestId: input.requestId,
            mode: found.mode,
            degraded: found.degraded,
          }
          yield { type: 'sources', sources: [] }
          yield { type: 'delta', text: REFUSAL_ES }
          yield {
            type: 'done',
            cited: [],
            refused: true,
            truncated: false,
            usage: { inputTokens: 0, outputTokens: 0 },
          }
        },
      }
    }

    // Same question over the same sources for the same role: replay the stored answer. No model
    // call and no budget spent.
    const { cache } = this.#d
    const key = cache?.enabled
      ? cacheKey({
          role: input.role,
          question,
          history,
          sourceIds: built.used.map((h) => h.id),
          // The answer can depend on these, so they split the cache; the user does not.
          context: `${lang}|${now.toISOString().slice(0, 10)}|${head?.sha ?? ''}`,
        })
      : null
    const cached = key ? cache!.get(key) : null
    if (cached) {
      return {
        ...base,
        cacheHit: true,
        async *events() {
          yield {
            type: 'meta',
            requestId: input.requestId,
            mode: found.mode,
            degraded: found.degraded,
          }
          yield { type: 'sources', sources }
          for (let i = 0; i < cached.text.length; i += REPLAY_CHUNK)
            yield {
              type: 'delta',
              text: cached.text.slice(i, i + REPLAY_CHUNK),
            }
          yield {
            type: 'done',
            cited: cached.cited,
            refused: cached.refused,
            truncated: false,
            cached: true,
            usage: { inputTokens: 0, outputTokens: 0 },
          }
        },
      }
    }

    const inputChars = built.messages.reduce((n, m) => n + m.content.length, 0)
    const reserved = estimateTokens(inputChars) + s.maxOutputTokens
    this.#d.budget.reserve(input.viewerKey, reserved)

    const { llm, budget } = this.#d
    return {
      ...base,
      async *events(signal) {
        yield {
          type: 'meta',
          requestId: input.requestId,
          mode: found.mode,
          degraded: found.degraded,
        }
        yield { type: 'sources', sources }

        const stop = new AbortController()
        const onAbort = () => stop.abort()
        signal?.addEventListener('abort', onAbort)

        let answer = ''
        let truncated = false
        let usage: { inputTokens: number; outputTokens: number } | null = null
        let failed = false
        try {
          for await (const chunk of llm.stream({
            messages: built.messages,
            maxOutputTokens: s.maxOutputTokens,
            signal: stop.signal,
          })) {
            if (chunk.type === 'usage') {
              usage = chunk.usage
              continue
            }
            const room = s.maxOutputChars - answer.length
            if (chunk.text.length > room) {
              const part = chunk.text.slice(0, Math.max(0, room))
              if (part) {
                answer += part
                yield { type: 'delta', text: part }
              }
              truncated = true
              stop.abort()
              break
            }
            answer += chunk.text
            yield { type: 'delta', text: chunk.text }
          }
        } catch (e) {
          failed = true
          const err =
            e instanceof AppError
              ? e
              : new AppError('llm_unavailable', 'The language model failed.')
          yield { type: 'error', code: err.code, message: err.message }
        } finally {
          signal?.removeEventListener('abort', onAbort)
          const actual = usage
            ? usage.inputTokens + usage.outputTokens
            : estimateTokens(inputChars) + estimateTokens(answer.length)
          budget.settle(input.viewerKey, reserved, actual)
        }
        if (failed) return

        // A small model can degenerate into whitespace. That is a failed answer, not an empty one:
        // never show it as success and never cache it.
        if (!truncated && !answer.trim()) {
          yield {
            type: 'error',
            code: 'llm_unavailable',
            message: 'The language model returned an empty answer.',
          }
          return
        }

        const cited = citedNumbers(answer, sources.length)
        const refused = isRefusal(answer)
        // Only a complete answer is worth replaying.
        if (key && !truncated && answer)
          cache!.set(key, { text: answer, cited, refused })
        yield {
          type: 'done',
          cited,
          refused,
          truncated,
          usage: usage ?? {
            inputTokens: estimateTokens(inputChars),
            outputTokens: estimateTokens(answer.length),
          },
        }
      },
    }
  }
}
