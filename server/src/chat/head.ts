// Current head of the development branch (name + last commit), read from GitHub and cached. It is
// context for the model ("what is the latest change?"), never a source of facts to cite, so every
// failure is `null` and the chat just goes without it.
import type { GithubClient } from '../project/github.ts'

export interface HeadInfo {
  branch: string
  sha: string
  subject: string
  committedAt: string
}

export interface HeadSource {
  get(): Promise<HeadInfo | null>
}

interface RawHead {
  sha?: unknown
  commit?: { message?: unknown; committer?: { date?: unknown } }
}

export interface GithubHeadOptions {
  github: Pick<GithubClient, 'page'>
  repo: string
  ref: string
  ttlMs: number
  now?: () => number
}

export class GithubHeadSource implements HeadSource {
  readonly #o: GithubHeadOptions
  #entry: { value: HeadInfo | null; at: number } | null = null
  #inflight: Promise<HeadInfo | null> | null = null

  constructor(options: GithubHeadOptions) {
    this.#o = options
  }

  async get(): Promise<HeadInfo | null> {
    const now = this.#o.now ?? Date.now
    const e = this.#entry
    if (e && now() - e.at < this.#o.ttlMs) return e.value
    this.#inflight ??= this.#load().finally(() => {
      this.#inflight = null
    })
    const value = await this.#inflight
    // A failed refresh keeps serving the last good value instead of dropping the context.
    if (value) this.#entry = { value, at: now() }
    else if (!e) this.#entry = { value: null, at: now() }
    return value ?? e?.value ?? null
  }

  async #load(): Promise<HeadInfo | null> {
    try {
      const { repo, ref, github } = this.#o
      const page = await github.page<RawHead[]>(
        `/repos/${repo}/commits?sha=${encodeURIComponent(ref)}&per_page=1`,
      )
      const c = page?.data?.[0]
      if (!c || typeof c.sha !== 'string') return null
      const message =
        typeof c.commit?.message === 'string' ? c.commit.message : ''
      const date = c.commit?.committer?.date
      return {
        branch: ref,
        sha: c.sha.slice(0, 7),
        subject: message.split('\n')[0]!.slice(0, 120),
        committedAt: typeof date === 'string' ? date : '',
      }
    } catch {
      return null
    }
  }
}
