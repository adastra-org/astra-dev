// Shared wiring: everything a request handler may touch, built once at boot (or by tests).
import type { Config } from './config.ts'
import type { ChatService } from './chat/service.ts'
import type { Retriever } from './index/search.ts'
import type { RateLimiter } from './limits.ts'
import type { Logger } from './log.ts'
import type { ViewerPort } from './viewer.ts'

export interface BuildInfo {
  sha: string
  version: string
  slot: string
  builtAt: string
}

export interface AppDeps {
  config: Config
  logger: Logger
  viewers: ViewerPort
  /** `null` when the index file is missing or invalid: /ready is 503 and chat/search return `index_unavailable`. */
  retriever: Retriever | null
  chat: ChatService | null
  limiters: {
    chatViewer: RateLimiter
    chatIp: RateLimiter
    searchIp: RateLimiter
  }
  build: BuildInfo
  now?: () => number
}
