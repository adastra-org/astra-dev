// Configuration from env. Secrets only ever come from here (systemd EnvironmentFile on the VPS),
// never from the repo or the browser.
import { ConfigError } from './errors.ts'

export type Role = 'public' | 'subscriber' | 'staff'

export interface Config {
  production: boolean
  slot: string
  host: string
  port: number
  /** Trust `X-Real-IP` set by nginx. Only safe when the server is bound to loopback behind nginx. */
  trustProxy: boolean
  indexPath: string
  buildInfoPath: string
  allowedOrigins: string[]
  accounts: { baseUrl: string; viewerPath: string; timeoutMs: number }
  /** Dev stub role. `null` means: use the accounts service. Always null in production. */
  devViewer: Role | null
  embedder: { url: string; model: string; timeoutMs: number; dims: number }
  llm: {
    provider: 'deepseek' | 'fake'
    baseUrl: string
    model: string
    apiKey: string
    timeoutMs: number
  }
  chat: {
    maxQuestionChars: number
    maxHistoryTurns: number
    maxHistoryTurnChars: number
    maxOutputTokens: number
    maxOutputChars: number
    topK: number
    /** Natives added to the chat context on top of `topK` docs (0 = docs only). */
    nativesTopK: number
    contextMaxChars: number
    minSemanticScore: number
    maxBodyBytes: number
  }
  limits: {
    chatViewerPerMin: number
    chatIpPerMin: number
    searchIpPerMin: number
    dailyTokensViewer: number
    dailyTokensGlobal: number
  }
}

type Env = Record<string, string | undefined>

const SLOT_PORTS: Record<string, number> = { blue: 4101, green: 4102 }

export function loadConfig(env: Env = process.env): Config {
  const problems: string[] = []

  const str = (key: string, fallback: string) => {
    const v = env[key]?.trim()
    return v ? v : fallback
  }
  const int = (key: string, fallback: number, min = 0, max = 1e10) => {
    const raw = env[key]?.trim()
    if (!raw) return fallback
    const n = Number(raw)
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${key} must be an integer between ${min} and ${max}`)
      return fallback
    }
    return n
  }
  const num = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key]?.trim()
    if (!raw) return fallback
    const n = Number(raw)
    if (!Number.isFinite(n) || n < min || n > max) {
      problems.push(`${key} must be a number between ${min} and ${max}`)
      return fallback
    }
    return n
  }
  const url = (key: string, fallback: string) => {
    const v = str(key, fallback)
    try {
      const u = new URL(v)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
    } catch {
      problems.push(`${key} must be an http(s) URL`)
    }
    return v
  }

  const production = env.NODE_ENV === 'production'
  const slot = str('ASTRA_SLOT', 'dev')

  const provider = str('LLM_PROVIDER', 'deepseek')
  if (provider !== 'deepseek' && provider !== 'fake')
    problems.push('LLM_PROVIDER must be "deepseek" or "fake"')
  if (production && provider === 'fake')
    problems.push('LLM_PROVIDER=fake is not allowed in production')
  const apiKey = env.DEEPSEEK_API_KEY?.trim() ?? ''
  if (production && provider === 'deepseek' && !apiKey)
    problems.push('DEEPSEEK_API_KEY is required in production')

  const requestedStub = env.ASTRA_DEV_VIEWER?.trim()
  let devViewer: Role | null = null
  // In production the stub flag is ignored on purpose (main.ts logs a warning).
  if (requestedStub && !production) {
    if (
      requestedStub === 'public' ||
      requestedStub === 'subscriber' ||
      requestedStub === 'staff'
    )
      devViewer = requestedStub
    else problems.push('ASTRA_DEV_VIEWER must be public, subscriber or staff')
  }

  const config: Config = {
    production,
    slot,
    host: str('HOST', '127.0.0.1'),
    port: int('PORT', SLOT_PORTS[slot] ?? 4100, 1, 65535),
    trustProxy: str('TRUST_PROXY', production ? 'true' : 'false') === 'true',
    indexPath: str('INDEX_PATH', 'data/index.json'),
    buildInfoPath: str('BUILD_INFO_PATH', 'build.json'),
    allowedOrigins: str(
      'ALLOWED_ORIGINS',
      production
        ? 'https://development.adastrarp.com'
        : 'https://development.adastrarp.com,http://localhost:5173,http://127.0.0.1:5173',
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    accounts: {
      baseUrl: url('ACCOUNTS_BASE_URL', 'https://adastrarp.com').replace(
        /\/+$/,
        '',
      ),
      viewerPath: str('ACCOUNTS_VIEWER_PATH', '/api/auth/viewer'),
      timeoutMs: int('ACCOUNTS_TIMEOUT_MS', 3000, 100, 30000),
    },
    devViewer,
    embedder: {
      url: url('EMBEDDER_URL', 'http://127.0.0.1:8891/v1/embeddings'),
      model: str('EMBEDDER_MODEL', 'embeddinggemma-2'),
      timeoutMs: int('EMBEDDER_TIMEOUT_MS', 2500, 100, 60000),
      dims: int('EMBEDDER_DIMS', 256, 32, 768),
    },
    llm: {
      provider: provider === 'fake' ? 'fake' : 'deepseek',
      baseUrl: url('LLM_BASE_URL', 'https://api.deepseek.com').replace(
        /\/+$/,
        '',
      ),
      model: str('LLM_MODEL', 'deepseek-flash'),
      apiKey,
      timeoutMs: int('LLM_TIMEOUT_MS', 60000, 1000, 300000),
    },
    chat: {
      maxQuestionChars: int('CHAT_MAX_QUESTION_CHARS', 800, 50, 4000),
      maxHistoryTurns: int('CHAT_MAX_HISTORY_TURNS', 6, 0, 20),
      maxHistoryTurnChars: int('CHAT_MAX_HISTORY_TURN_CHARS', 800, 50, 4000),
      maxOutputTokens: int('CHAT_MAX_OUTPUT_TOKENS', 700, 50, 4000),
      maxOutputChars: int('CHAT_MAX_OUTPUT_CHARS', 4000, 200, 20000),
      topK: int('CHAT_TOP_K', 5, 1, 12),
      nativesTopK: int('CHAT_NATIVES_TOP_K', 3, 0, 8),
      contextMaxChars: int('CHAT_CONTEXT_MAX_CHARS', 9000, 1000, 40000),
      minSemanticScore: num('CHAT_MIN_SEMANTIC_SCORE', 0.25, 0, 1),
      maxBodyBytes: int('CHAT_MAX_BODY_BYTES', 16384, 1024, 262144),
    },
    limits: {
      chatViewerPerMin: int('RATE_CHAT_VIEWER_PER_MIN', 6, 1, 10000),
      chatIpPerMin: int('RATE_CHAT_IP_PER_MIN', 20, 1, 10000),
      searchIpPerMin: int('RATE_SEARCH_IP_PER_MIN', 60, 1, 10000),
      dailyTokensViewer: int('DAILY_TOKENS_VIEWER', 40_000, 1000),
      dailyTokensGlobal: int('DAILY_TOKENS_GLOBAL', 1_000_000, 1000),
    },
  }

  if (problems.length) throw new ConfigError(problems)
  return config
}

/** Safe summary for logs (no secrets). */
export const describeConfig = (c: Config) => ({
  production: c.production,
  slot: c.slot,
  host: c.host,
  port: c.port,
  llm: { provider: c.llm.provider, model: c.llm.model, hasKey: !!c.llm.apiKey },
  embedder: c.embedder.url,
  accounts: c.accounts.baseUrl,
  devViewer: c.devViewer,
})
