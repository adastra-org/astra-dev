// Shared wiring: everything a request handler may touch, built once at boot (or by tests).
import type { Config } from './config.ts'
import type { ChatService } from './chat/service.ts'
import type { Retriever } from './index/search.ts'
import type { RateLimiter } from './limits.ts'
import type { Logger } from './log.ts'
import type { ProjectService } from './project/service.ts'
import type { UsageSink } from './usage/store.ts'
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
  /** "Proyecto" (M5). `null`/absent when `ASTRA_GITHUB_TOKEN` is not set: `project` answers `project_unavailable`. */
  project?: ProjectService | null
  /** Per-request usage records. Absent = none are kept. */
  usage?: UsageSink | null
  limiters: {
    chatViewer: RateLimiter
    chatIp: RateLimiter
    searchIp: RateLimiter
  }
  build: BuildInfo
  now?: () => number
}
