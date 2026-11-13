// Builds the real dependency graph from config. Used by main.ts; tests build their own with fakes.
import { readFile } from 'node:fs/promises'
import { UsageStore } from './usage/store.ts'
import { EmbedderClient } from '@wefaber/embed'
import { AnswerCache } from './chat/cache.ts'
import { ChatService } from './chat/service.ts'
import type { Config } from './config.ts'
import type { AppDeps, BuildInfo } from './context.ts'
import { loadIndex } from './index/store.ts'
import { Retriever } from './index/search.ts'
import { RateLimiter, TokenBudget } from './limits.ts'
import { GithubHeadSource } from './chat/head.ts'
import { D1FollowUpDecider } from './decision/followup.ts'
import { D1ContextGate } from './decision/gate.ts'
import { FallbackProvider } from './llm/fallback.ts'
import { DeepSeekProvider } from './llm/deepseek.ts'
import { FakeLlmProvider } from './llm/fake.ts'
import type { LlmProvider } from './llm/provider.ts'
import type { Logger } from './log.ts'
import { GithubClient } from './project/github.ts'
import {
  DisabledChecklistSource,
  MyChecklistSource,
} from './project/mychecklist.ts'
import { ProjectService } from './project/service.ts'
import { createViewerPort } from './viewer.ts'

export interface EmbedderOverrides {
  /** Per-request timeout (the index build needs far more than a query). */
  timeoutMs?: number
  /** Extra attempts on network errors, 429 and 5xx (backoff). 0 for the request path. */
  retries?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Embedder client whose every request has a hard timeout, so a hung embedder cannot stall a
 * request, and the bearer token (hosted embedders) on every call.
 */
export function createEmbedder(
  config: Config,
  overrides: EmbedderOverrides = {},
): EmbedderClient {
  const { url, model, token } = config.embedder
  const timeoutMs = overrides.timeoutMs ?? config.embedder.timeoutMs
  const retries = overrides.retries ?? 0
  return new EmbedderClient({
    baseUrl: url,
    model,
    fetch: (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      if (token) headers.set('authorization', `Bearer ${token}`)
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(input, {
            ...init,
            headers,
            signal: AbortSignal.timeout(timeoutMs),
          })
          if ((res.status === 429 || res.status >= 500) && attempt < retries) {
            await sleep(500 * 2 ** attempt)
            continue
          }
          return res
        } catch (e) {
          if (attempt >= retries) throw e
          await sleep(500 * 2 ** attempt)
        }
      }
    }) as typeof fetch,
  })
}

export function createLlm(config: Config, logger?: Logger): LlmProvider {
  if (config.llm.provider === 'fake') return new FakeLlmProvider()
  const primary = new DeepSeekProvider({
    name: config.llm.provider,
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl,
    model: config.llm.model,
    timeoutMs: config.llm.timeoutMs,
  })
  const fb = config.llm.fallback
  if (!fb) return primary
  return new FallbackProvider(
    primary,
    new DeepSeekProvider({
      name: 'local',
      apiKey: '',
      baseUrl: fb.baseUrl,
      model: fb.model,
      timeoutMs: config.llm.timeoutMs,
    }),
    (from, to) => logger?.warn('llm_fallback', { from, to }),
  )
}

async function readBuildInfo(config: Config): Promise<BuildInfo> {
  try {
    const b = JSON.parse(
      await readFile(config.buildInfoPath, 'utf8'),
    ) as Partial<BuildInfo>
    return {
      sha: String(b.sha ?? 'unknown'),
      version: String(b.version ?? 'unknown'),
      slot: config.slot,
      builtAt: String(b.builtAt ?? ''),
    }
  } catch {
    return { sha: 'dev', version: 'dev', slot: config.slot, builtAt: '' }
  }
}

export function createProject(
  config: Config,
  logger: Logger,
): ProjectService | null {
  const p = config.project
  if (!p.githubToken) {
    logger.warn('project_disabled', { reason: 'ASTRA_GITHUB_TOKEN is not set' })
    return null
  }
  const mc = p.myChecklist
  return new ProjectService({
    github: new GithubClient({ token: p.githubToken, baseUrl: p.githubApiUrl }),
    repo: p.repo,
    ref: p.ref,
    planPath: p.planPath,
    complexityPath: p.complexityPath,
    checklist: mc.token
      ? new MyChecklistSource({
          baseUrl: mc.baseUrl,
          token: mc.token,
          listName: mc.listName,
        })
      : new DisabledChecklistSource(mc.listName),
    ttlMs: p.cacheTtlMs,
    viewerPerMin: p.viewerPerMin,
    logger,
  })
}

export async function buildDeps(
  config: Config,
  logger: Logger,
): Promise<AppDeps> {
  let retriever: Retriever | null = null
  try {
    const index = await loadIndex(config.indexPath)
    retriever = new Retriever(index, createEmbedder(config), {
      minSemanticScore: config.chat.minSemanticScore,
    })
    logger.info('index_loaded', {
      chunks: index.chunks.length,
      semantic: index.semantic,
      sourceHash: index.sourceHash,
    })
  } catch (e) {
    logger.error('index_unavailable', {
      path: config.indexPath,
      reason: (e as Error).message,
      hint: 'run "bun run index"',
    })
  }

  const build = await readBuildInfo(config)
  let usage: UsageStore | null = null
  if (config.usage.dbPath) {
    try {
      usage = new UsageStore(config.usage.dbPath)
      const purged = usage.purge(config.usage.retentionDays)
      logger.info('usage_store', { purged })
    } catch (e) {
      // Recording is optional: a bad path must not keep the chat down.
      logger.error('usage_store_unavailable', { reason: (e as Error).message })
    }
  }
  const chat = retriever
    ? new ChatService({
        retriever,
        llm: createLlm(config, logger),
        version: build.version,
        head: config.project.githubToken
          ? new GithubHeadSource({
              github: new GithubClient({
                token: config.project.githubToken,
                baseUrl: config.project.githubApiUrl,
              }),
              repo: config.project.repo,
              ref: config.project.ref,
              ttlMs: config.project.cacheTtlMs,
            })
          : undefined,
        gate: config.decision.url
          ? new D1ContextGate({
              url: config.decision.url,
              timeoutMs: config.decision.timeoutMs,
              threshold: config.decision.gateThreshold,
              floor: config.decision.gateFloor,
              maxFragmentChars: config.decision.gateMaxFragmentChars,
            })
          : undefined,
        budget: new TokenBudget(
          config.limits.dailyTokensViewer,
          config.limits.dailyTokensGlobal,
        ),
        settings: config.chat,
        decider: config.decision.url
          ? new D1FollowUpDecider({
              url: config.decision.url,
              timeoutMs: config.decision.timeoutMs,
              threshold: config.decision.followUpThreshold,
            })
          : undefined,
        cache: new AnswerCache({
          maxEntries: config.chat.cacheMaxEntries,
          ttlMs: config.chat.cacheTtlSeconds * 1000,
        }),
      })
    : null

  return {
    config,
    logger,
    viewers: createViewerPort(config),
    retriever,
    chat,
    project: createProject(config, logger),
    usage,
    limiters: {
      chatViewer: new RateLimiter(config.limits.chatViewerPerMin),
      chatIp: new RateLimiter(config.limits.chatIpPerMin),
      searchIp: new RateLimiter(config.limits.searchIpPerMin),
    },
    build,
  }
}
