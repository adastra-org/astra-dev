// Builds the real dependency graph from config. Used by main.ts; tests build their own with fakes.
import { readFile } from 'node:fs/promises'
import { EmbedderClient } from '@wefaber/embed'
import { ChatService } from './chat/service.ts'
import type { Config } from './config.ts'
import type { AppDeps, BuildInfo } from './context.ts'
import { loadIndex } from './index/store.ts'
import { Retriever } from './index/search.ts'
import { RateLimiter, TokenBudget } from './limits.ts'
import { DeepSeekProvider } from './llm/deepseek.ts'
import { FakeLlmProvider } from './llm/fake.ts'
import type { LlmProvider } from './llm/provider.ts'
import type { Logger } from './log.ts'
import { createViewerPort } from './viewer.ts'

/** Embedder client whose every request has a hard timeout, so a hung embedder cannot stall a request. */
export function createEmbedder(config: Config): EmbedderClient {
  return new EmbedderClient({
    baseUrl: config.embedder.url,
    model: config.embedder.model,
    fetch: ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.timeout(config.embedder.timeoutMs),
      })) as typeof fetch,
  })
}

export function createLlm(config: Config): LlmProvider {
  if (config.llm.provider === 'fake') return new FakeLlmProvider()
  return new DeepSeekProvider({
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl,
    model: config.llm.model,
    timeoutMs: config.llm.timeoutMs,
  })
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

  const chat = retriever
    ? new ChatService({
        retriever,
        llm: createLlm(config),
        budget: new TokenBudget(
          config.limits.dailyTokensViewer,
          config.limits.dailyTokensGlobal,
        ),
        settings: config.chat,
      })
    : null

  return {
    config,
    logger,
    viewers: createViewerPort(config),
    retriever,
    chat,
    limiters: {
      chatViewer: new RateLimiter(config.limits.chatViewerPerMin),
      chatIp: new RateLimiter(config.limits.chatIpPerMin),
      searchIp: new RateLimiter(config.limits.searchIpPerMin),
    },
    build: await readBuildInfo(config),
  }
}
