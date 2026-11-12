// Shared test fixtures: a tiny docs set, a deterministic fake embedder and a fully wired app.
import { EmbedderClient } from '@wefaber/embed'
import { createApp } from '../src/app.ts'
import { ChatService } from '../src/chat/service.ts'
import { loadConfig, type Config, type Role } from '../src/config.ts'
import type { AppDeps } from '../src/context.ts'
import { chunkDoc } from '../src/docs/chunk.ts'
import type { SourceDoc } from '../src/docs/source.ts'
import { buildIndex } from '../src/index/build.ts'
import { Retriever } from '../src/index/search.ts'
import type { DocsIndex } from '../src/index/store.ts'
import { RateLimiter, TokenBudget } from '../src/limits.ts'
import { FakeLlmProvider } from '../src/llm/fake.ts'
import type { LlmProvider } from '../src/llm/provider.ts'
import { createLogger, silentLogger, type Logger } from '../src/log.ts'
import { DevStubViewerPort, type ViewerPort } from '../src/viewer.ts'

export const doc = (
  slug: string,
  title: string,
  summary: string,
  body: string,
): SourceDoc => ({
  slug,
  title,
  summary,
  body,
  lang: 'es',
  raw: `---\ntitle: ${title}\n---\n${body}`,
})

export const DOCS: SourceDoc[] = [
  doc(
    'dibujar-texto',
    'Dibujar texto en pantalla',
    'Cómo pintar texto en la pantalla con las nativas de texto.',
    `Para pintar texto usa las nativas de texto en un hilo con Wait(0).

## Ejemplo mínimo

\`\`\`lua
SetTextFont(0)
DrawText(0.5, 0.5)
\`\`\`

## Detalle

Cada frame hay que volver a llamar a las nativas.`,
  ),
  doc(
    'flujo-de-deploy',
    'Flujo de deploy',
    'Un push a main construye el sitio y cambia el slot blue green.',
    `El deploy es blue green y nadie despliega a mano.

## Rollback

El rollback cambia el symlink al slot anterior.

### Cuándo usarlo

Si el probe público falla tras el switch.`,
  ),
  doc(
    'glosario',
    'Glosario',
    'Términos del proyecto.',
    `## Slug

Identificador de un doc en la URL.`,
  ),
]

export const chunks = DOCS.flatMap((d) => chunkDoc(d))

// Tiny "semantic" space: words of the same concept share a dimension, like synonyms would.
const CONCEPTS: string[][] = [
  ['dibujar', 'pintar', 'draw', 'texto', 'text', 'pantalla'],
  ['deploy', 'desplegar', 'publicar', 'slot', 'blue', 'green', 'rollback'],
  ['slug', 'url', 'identificador', 'glosario'],
  ['lua', 'nativas', 'nativa', 'native'],
]
export const DIMS = CONCEPTS.length + 1

export function fakeVector(text: string): number[] {
  const v = new Array<number>(DIMS).fill(0)
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
  for (const w of words) {
    const c = CONCEPTS.findIndex((group) => group.includes(w))
    if (c >= 0) v[c]! += 1
    else v[DIMS - 1]! += 0.05
  }
  const n = Math.hypot(...v) || 1
  return v.map((x) => x / n)
}

/** Embedder whose HTTP layer is replaced by `fakeVector`. `fail` simulates an unreachable service. */
export function fakeEmbedder(state: { fail?: boolean; calls?: number } = {}) {
  return new EmbedderClient({
    fetch: (async (_url: unknown, init?: { body?: unknown }) => {
      state.calls = (state.calls ?? 0) + 1
      if (state.fail) throw new TypeError('connect ECONNREFUSED')
      const { input } = JSON.parse(String(init?.body)) as {
        input: string | string[]
      }
      const list = Array.isArray(input) ? input : [input]
      return Response.json({
        data: list.map((t, index) => ({ index, embedding: fakeVector(t) })),
      })
    }) as unknown as typeof fetch,
  })
}

export async function semanticIndex(): Promise<DocsIndex> {
  return buildIndex(DOCS, {
    embedder: fakeEmbedder(),
    dims: DIMS,
    now: () => new Date('2026-01-01T00:00:00Z'),
  })
}

export async function keywordIndex(): Promise<DocsIndex> {
  return buildIndex(DOCS, { embedder: null, dims: DIMS })
}

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ LLM_PROVIDER: 'fake', ...env })
}

export interface Harness {
  app: ReturnType<typeof createApp>
  deps: AppDeps
  llm: FakeLlmProvider
  logs: string[]
  call(path: string, init?: RequestInit & { json?: unknown }): Promise<Response>
}

export async function harness(
  opts: {
    viewers?: ViewerPort
    role?: Role
    llm?: LlmProvider
    env?: Record<string, string>
    index?: DocsIndex | null
    logger?: Logger
    embedder?: EmbedderClient | null
  } = {},
): Promise<Harness> {
  const config = testConfig(opts.env)
  const logs: string[] = []
  const logger = opts.logger ?? createLogger((l) => logs.push(l))
  const index = opts.index === undefined ? await semanticIndex() : opts.index
  const retriever = index
    ? new Retriever(index, opts.embedder ?? fakeEmbedder(), {
        minSemanticScore: 0.25,
      })
    : null
  const llm = (opts.llm as FakeLlmProvider | undefined) ?? new FakeLlmProvider()
  const deps: AppDeps = {
    config,
    logger: opts.logger ?? logger ?? silentLogger,
    viewers: opts.viewers ?? new DevStubViewerPort(opts.role ?? 'subscriber'),
    retriever,
    chat: retriever
      ? new ChatService({
          retriever,
          llm,
          budget: new TokenBudget(
            config.limits.dailyTokensViewer,
            config.limits.dailyTokensGlobal,
          ),
          settings: config.chat,
        })
      : null,
    limiters: {
      chatViewer: new RateLimiter(config.limits.chatViewerPerMin),
      chatIp: new RateLimiter(config.limits.chatIpPerMin),
      searchIp: new RateLimiter(config.limits.searchIpPerMin),
    },
    build: { sha: 'abc123', version: '0.0.0', slot: 'test', builtAt: '' },
  }
  const app = createApp(deps)
  return {
    app,
    deps,
    llm,
    logs,
    call: (path, init = {}) => {
      const { json, ...rest } = init
      const headers = new Headers(rest.headers)
      if (json !== undefined) headers.set('content-type', 'application/json')
      return Promise.resolve(
        app.handle(
          new Request(`http://localhost${path}`, {
            ...rest,
            headers,
            ...(json === undefined
              ? {}
              : { method: rest.method ?? 'POST', body: JSON.stringify(json) }),
          }),
        ),
      )
    },
  }
}

/** Parses an SSE body into `[event, data]` pairs. */
export function parseSse(body: string): { event: string; data: any }[] {
  return body
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n')
      const event = lines.find((l) => l.startsWith('event: '))!.slice(7)
      const data = JSON.parse(
        lines.find((l) => l.startsWith('data: '))!.slice(6),
      )
      return { event, data }
    })
}
