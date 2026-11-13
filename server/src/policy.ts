// One place that says which limits apply to whom. Callers ask `policyFor(viewer)`; nobody else
// compares roles to decide a limit. `owner` is exempt from cooldowns and quotas (Faku's decision);
// the only brake left on an owner is `maxRounds`, which pauses a long run and asks to continue.
import type { Config } from './config.ts'
import type { ChatSettings } from './chat/service.ts'
import { atLeast, type Viewer } from './viewer.ts'

export interface Policy {
  /** Per-minute rate limits (chat per viewer and IP, search, project). */
  rateLimits: boolean
  /** Daily token budget per viewer. */
  viewerBudget: boolean
  /** Daily token budget shared by everyone. */
  globalBudget: boolean
  /** Question, history, output and context size caps (`CHAT_MAX_*`). */
  sizeCaps: boolean
  /** Rounds (tool calls, subagents) allowed in one message before asking to continue. */
  maxRounds: number
  /** At the round cap, ask the user to continue (owner) instead of just turning tools off. */
  confirmRounds: boolean
}

/** Rounds per message for everyone else; phases 2 and 5 may lower it per feature. */
export const DEFAULT_MAX_ROUNDS = 3

export function policyFor(
  viewer: Pick<Viewer, 'role'>,
  config: Pick<Config, 'limits'>,
): Policy {
  if (viewer.role === 'owner')
    return {
      rateLimits: false,
      viewerBudget: false,
      globalBudget: false,
      sizeCaps: false,
      maxRounds: config.limits.ownerMaxRounds,
      confirmRounds: true,
    }
  return {
    rateLimits: true,
    viewerBudget: true,
    globalBudget: true,
    sizeCaps: true,
    maxRounds: DEFAULT_MAX_ROUNDS,
    confirmRounds: false,
  }
}

/**
 * Sizes an owner gets instead of the `CHAT_MAX_*` caps: generous ceilings, not infinity. The
 * request body cap (`CHAT_MAX_BODY_BYTES`) still applies, and the output ceiling is what the
 * provider accepts.
 */
export const OWNER_CHAT_SETTINGS: Pick<
  ChatSettings,
  | 'maxQuestionChars'
  | 'maxHistoryTurns'
  | 'maxHistoryTurnChars'
  | 'maxOutputTokens'
  | 'maxOutputChars'
  | 'contextMaxChars'
> = {
  maxQuestionChars: 100_000,
  maxHistoryTurns: 50,
  maxHistoryTurnChars: 20_000,
  maxOutputTokens: 16_000,
  maxOutputChars: 200_000,
  contextMaxChars: 60_000,
}

export const chatSettingsFor = (
  base: ChatSettings,
  policy: Pick<Policy, 'sizeCaps'>,
): ChatSettings =>
  policy.sizeCaps ? base : { ...base, ...OWNER_CHAT_SETTINGS }

export { atLeast }
