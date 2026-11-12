// Minimal read-only GitHub REST client. The token comes from env, only ever travels in the
// `Authorization` header to `api.github.com`, and is never logged or put in an error message.
// Conditional requests (ETag): once the server-side TTL expires, a refresh of unchanged data is a
// `304`, which GitHub does not count against the rate limit.

const DEFAULT_BASE = 'https://api.github.com'
const MAX_ETAG_ENTRIES = 200

export class GithubError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GithubError'
    this.status = status
  }
}

export interface GithubOptions {
  token: string
  baseUrl?: string
  timeoutMs?: number
  fetch?: typeof fetch
}

interface Cached {
  etag: string
  body: string
  link: string | null
}

export interface Page<T> {
  data: T
  /** Absolute URL of the next page, or `null`. Always on the configured API host. */
  next: string | null
}

/** `rel="next"` from a `Link` header. */
export function nextLink(link: string | null): string | null {
  if (!link) return null
  for (const part of link.split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part)
    if (m) return m[1]!
  }
  return null
}

export class GithubClient {
  readonly #token: string
  readonly #base: string
  readonly #timeoutMs: number
  readonly #fetch: typeof fetch
  readonly #cache = new Map<string, Cached>()
  /** Requests that actually hit the network, and how many of those were `304`. For tests and /ready. */
  stats = { requests: 0, notModified: 0 }

  constructor(opts: GithubOptions) {
    this.#token = opts.token
    this.#base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')
    this.#timeoutMs = opts.timeoutMs ?? 10_000
    this.#fetch = opts.fetch ?? fetch
  }

  async #get(
    url: string,
    accept: string,
  ): Promise<{ body: string; link: string | null } | null> {
    // A `next` link comes from the response: it must stay on the API host we were configured with.
    if (!url.startsWith(`${this.#base}/`))
      throw new GithubError(0, 'Refusing to follow a link to another host.')
    const key = `${accept}|${url}`
    const cached = this.#cache.get(key)
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.#token}`,
      accept,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'astra-dev-server',
    }
    if (cached) headers['if-none-match'] = cached.etag

    let res: Response
    try {
      res = await this.#fetch(url, {
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(this.#timeoutMs),
      })
    } catch {
      throw new GithubError(0, 'GitHub is not reachable.')
    }
    this.stats.requests++
    if (res.status === 304 && cached) {
      this.stats.notModified++
      return { body: cached.body, link: cached.link }
    }
    if (res.status === 404) return null
    if (!res.ok)
      throw new GithubError(res.status, `GitHub answered ${res.status}.`)

    const body = await res.text()
    const link = res.headers.get('link')
    const etag = res.headers.get('etag')
    if (etag) {
      if (this.#cache.size >= MAX_ETAG_ENTRIES)
        this.#cache.delete(this.#cache.keys().next().value!)
      this.#cache.set(key, { etag, body, link })
    }
    return { body, link }
  }

  /** One JSON page. `null` on 404. */
  async page<T>(pathOrUrl: string): Promise<Page<T> | null> {
    const url = pathOrUrl.startsWith('http')
      ? pathOrUrl
      : `${this.#base}${pathOrUrl}`
    const res = await this.#get(url, 'application/vnd.github+json')
    if (!res) return null
    let data: T
    try {
      data = JSON.parse(res.body) as T
    } catch {
      throw new GithubError(502, 'GitHub returned invalid JSON.')
    }
    return { data, next: nextLink(res.link) }
  }

  /** Follows `rel="next"` up to `maxPages`. `truncated` when there were still more pages. */
  async paginate<T>(
    path: string,
    maxPages: number,
  ): Promise<{ items: T[]; truncated: boolean }> {
    const items: T[] = []
    let url: string | null = path
    let pages = 0
    while (url && pages < maxPages) {
      const p: Page<T[]> | null = await this.page<T[]>(url)
      if (!p) break
      if (Array.isArray(p.data)) items.push(...p.data)
      url = p.next
      pages++
    }
    return { items, truncated: url !== null }
  }

  /** Raw text of a file in the repo (`null` when it does not exist). */
  async file(repo: string, path: string, ref: string): Promise<string | null> {
    const url = `${this.#base}/repos/${repo}/contents/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?ref=${encodeURIComponent(ref)}`
    const res = await this.#get(url, 'application/vnd.github.raw+json')
    return res ? res.body : null
  }
}
