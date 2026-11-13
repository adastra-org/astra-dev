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
  embedder: {
    url: string
    model: string
    timeoutMs: number
    dims: number
    /** Bearer token for a hosted embedder (Cloudflare Workers AI). Secret; empty = no auth header. */
    token: string
    /** Models whose vectors may be reused from a prebuilt index. Always includes `model`. */
    acceptModels: string[]
  }
  llm: {
    provider: 'deepseek' | 'local' | 'fake'
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
    /** Answer cache: seconds an answer is reused (0 = cache off) and how many are kept. */
    cacheTtlSeconds: number
    cacheMaxEntries: number
  }
  /** "Proyecto" (M5): GitHub data, plan and checklist. Staff only. */
  project: {
    /** Read-only token. Secret. Empty = the module is off and `project` answers `project_unavailable`. */
    githubToken: string
    githubApiUrl: string
    /** `owner/name`. */
    repo: string
    /** Branch read for commits, the plan and the complexity series. */
    ref: string
    planPath: string
    complexityPath: string
    cacheTtlMs: number
    viewerPerMin: number
    myChecklist: {
      baseUrl: string
      /** `mck_…` in read mode. Secret. Empty = the external checklist is off. */
      token: string
      listName: string
    }
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
  if (provider !== 'deepseek' && provider !== 'local' && provider !== 'fake')
    problems.push('LLM_PROVIDER must be "deepseek", "local" or "fake"')
  if (production && provider === 'fake')
    problems.push('LLM_PROVIDER=fake is not allowed in production')
  const apiKey = env.DEEPSEEK_API_KEY?.trim() ?? ''
  if (production && provider === 'deepseek' && !apiKey)
    problems.push('DEEPSEEK_API_KEY is required in production')

  // `local` talks to a model server on this machine (llama.cpp, Ollama, LM Studio): the URL must be
  // loopback so the question never leaves the host, and no key is needed.
  const llmBaseUrl = url(
    'LLM_BASE_URL',
    provider === 'local'
      ? 'http://127.0.0.1:8080/v1'
      : 'https://api.deepseek.com',
  ).replace(/\/+$/, '')
  if (provider === 'local') {
    try {
      const host = new URL(llmBaseUrl).hostname
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host))
        problems.push('LLM_PROVIDER=local needs a loopback LLM_BASE_URL')
    } catch {
      // already reported by url()
    }
  }

  const embedderUrl = url('EMBEDDER_URL', 'http://127.0.0.1:8891/v1/embeddings')
  const embedderModel = str('EMBEDDER_MODEL', 'embeddinggemma-2')
  const embedderToken = env.EMBEDDER_TOKEN?.trim() ?? ''
  if (embedderToken) {
    // A token never travels in clear over the network.
    try {
      const u = new URL(embedderUrl)
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      if (u.protocol !== 'https:' && !loopback)
        problems.push('EMBEDDER_TOKEN needs an https EMBEDDER_URL')
    } catch {
      // already reported by url()
    }
  }

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

  const repo = str('PROJECT_REPO', 'adastra-org/astra-dev')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
    problems.push('PROJECT_REPO must look like owner/name')
  const ref = str('PROJECT_REF', 'dev')
  if (!/^[A-Za-z0-9_./-]{1,100}$/.test(ref) || ref.includes('..'))
    problems.push('PROJECT_REF is not a valid branch name')
  const repoPath = (key: string, fallback: string) => {
    const v = str(key, fallback)
    if (v.startsWith('/') || v.split('/').includes('..'))
      problems.push(`${key} must be a relative path inside the repo`)
    return v
  }
  const githubToken = env.ASTRA_GITHUB_TOKEN?.trim() ?? ''
  if (/\s/.test(githubToken))
    problems.push('ASTRA_GITHUB_TOKEN must not contain whitespace')
  const checklistToken = env.MYCHECKLIST_TOKEN?.trim() ?? ''
  const checklistUrl = url('MYCHECKLIST_URL', 'https://checklist.wefaber.net')
  if (checklistToken) {
    if (!checklistToken.startsWith('mck_'))
      problems.push('MYCHECKLIST_TOKEN must start with mck_')
    // A token never travels in clear over the network.
    try {
      const u = new URL(checklistUrl)
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      if (u.protocol !== 'https:' && !loopback)
        problems.push('MYCHECKLIST_TOKEN needs an https MYCHECKLIST_URL')
    } catch {
      // already reported by url()
    }
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
      url: embedderUrl,
      model: embedderModel,
      timeoutMs: int('EMBEDDER_TIMEOUT_MS', 2500, 100, 60000),
      dims: int('EMBEDDER_DIMS', 256, 32, 768),
      token: embedderToken,
      acceptModels: [
        ...new Set([
          embedderModel,
          ...str('EMBEDDER_ACCEPT_MODELS', '')
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean),
        ]),
      ],
    },
    llm: {
      provider:
        provider === 'fake'
          ? 'fake'
          : provider === 'local'
            ? 'local'
            : 'deepseek',
      baseUrl: llmBaseUrl,
      model: str(
        'LLM_MODEL',
        provider === 'local' ? 'local' : 'deepseek-flash',
      ),
      apiKey: provider === 'local' ? '' : apiKey,
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
      cacheTtlSeconds: int('CHAT_CACHE_TTL_SECONDS', 3600, 0, 604800),
      cacheMaxEntries: int('CHAT_CACHE_MAX_ENTRIES', 500, 0, 5000),
    },
    project: {
      githubToken,
      githubApiUrl: url('GITHUB_API_URL', 'https://api.github.com').replace(
        /\/+$/,
        '',
      ),
      repo,
      ref,
      planPath: repoPath('PROJECT_PLAN_PATH', 'docs/plan/README.md'),
      complexityPath: repoPath(
        'PROJECT_COMPLEXITY_PATH',
        'docs/project/complexity.json',
      ),
      cacheTtlMs: int('PROJECT_CACHE_TTL_SECONDS', 300, 10, 3600) * 1000,
      viewerPerMin: int('RATE_PROJECT_VIEWER_PER_MIN', 30, 1, 10000),
      myChecklist: {
        baseUrl: checklistUrl.replace(/\/+$/, ''),
        token: checklistToken,
        listName: str('MYCHECKLIST_LIST', 'Ad Astra'),
      },
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
  embedder: {
    url: c.embedder.url,
    model: c.embedder.model,
    hasToken: !!c.embedder.token,
  },
  accounts: c.accounts.baseUrl,
  project: {
    repo: c.project.repo,
    ref: c.project.ref,
    hasGithubToken: !!c.project.githubToken,
    hasMyChecklistToken: !!c.project.myChecklist.token,
  },
  devViewer: c.devViewer,
})
