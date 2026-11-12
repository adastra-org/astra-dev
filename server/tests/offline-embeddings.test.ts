// Phase 4b: vectors computed off the VPS (PC / Cloudflare) and shipped as index.json + index.vec.
import { describe, expect, test } from 'bun:test'
import { EmbedderClient } from '@wefaber/embed'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEmbedder } from '../src/boot.ts'
import { loadConfig } from '../src/config.ts'
import { ConfigError } from '../src/errors.ts'
import { buildIndex, embedKey, reusableFrom } from '../src/index/build.ts'
import { compareEmbedders, sampleEvenly } from '../src/index/compat.ts'
import { loadIndex, vectorsFileFor, writeIndex } from '../src/index/store.ts'
import { DIMS, DOCS, chunks, fakeEmbedder, fakeVector } from './helpers.ts'

const ACCEPT = ['embeddinggemma-2']
const built = async () =>
  buildIndex(DOCS, {
    embedder: fakeEmbedder(),
    dims: DIMS,
    now: () => new Date(0),
  })

/** An index "computed elsewhere": same corpus, model name as declared. */
async function prebuilt(model: string) {
  const i = await built()
  return { ...i, model }
}

describe('index files on disk', () => {
  test('writeIndex + loadIndex round trip, vectors in a binary sibling', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'idx-'))
    try {
      const path = join(dir, 'index.json')
      const index = await built()
      const { jsonBytes, vectorBytes } = await writeIndex(path, index)
      expect(vectorBytes).toBe(chunks.length * DIMS * 4)
      expect(jsonBytes).toBeGreaterThan(0)
      expect(vectorsFileFor(path)).toBe('index.vec')
      const back = await loadIndex(path)
      expect(back.semantic).toBe(true)
      expect(back.chunks.map((c) => c.id)).toEqual(
        index.chunks.map((c) => c.id),
      )
      expect(back.chunks[2]!.vector![1]).toBeCloseTo(
        index.chunks[2]!.vector![1]!,
        6,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('a vec file from another build is refused, not served', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'idx-'))
    try {
      const path = join(dir, 'index.json')
      await writeIndex(path, await built())
      const other = Buffer.from(await readFile(join(dir, 'index.vec')))
      other.writeFloatLE(other.readFloatLE(0) + 1, 0)
      await writeFile(join(dir, 'index.vec'), other)
      await expect(loadIndex(path)).rejects.toThrow('hash differs')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('a keyword-only index is a single file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'idx-'))
    try {
      const path = join(dir, 'index.json')
      const kw = await buildIndex(DOCS, { embedder: null, dims: DIMS })
      expect((await writeIndex(path, kw)).vectorBytes).toBe(0)
      expect((await loadIndex(path)).semantic).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('reusing prebuilt vectors', () => {
  test('everything reused: no embedder needed, nothing embedded', async () => {
    const prev = reusableFrom(await prebuilt('embeddinggemma-2'), {
      dims: DIMS,
      acceptModels: ACCEPT,
    })
    expect(prev.ok).toBe(true)
    if (!prev.ok) return
    const state = { calls: 0 }
    const i = await buildIndex(DOCS, {
      embedder: fakeEmbedder(state),
      dims: DIMS,
      reuse: prev.reuse,
    })
    expect(state.calls).toBe(0)
    expect(i.semantic).toBe(true)
    expect(i.model).toBe('embeddinggemma-2')
    const noEmbedder = await buildIndex(DOCS, {
      embedder: null,
      dims: DIMS,
      reuse: prev.reuse,
    })
    expect(noEmbedder.semantic).toBe(true)
  })

  test('a changed chunk is re-embedded, the rest is reused', async () => {
    const prev = reusableFrom(await prebuilt('embeddinggemma-2'), {
      dims: DIMS,
      acceptModels: ACCEPT,
    })
    if (!prev.ok) throw new Error(prev.reason)
    const changed = DOCS.map((d, i) =>
      i === 0
        ? { ...d, body: `${d.body}\n\nUn párrafo nuevo sobre otra cosa.` }
        : d,
    )
    const embedded: string[] = []
    const spy = new EmbedderClient({
      model: 'embeddinggemma-2',
      fetch: (async (_u: unknown, init?: { body?: unknown }) => {
        const { input } = JSON.parse(String(init?.body)) as { input: string[] }
        embedded.push(...input)
        return Response.json({
          data: input.map((t, index) => ({ index, embedding: fakeVector(t) })),
        })
      }) as unknown as typeof fetch,
    })
    const i = await buildIndex(changed, {
      embedder: spy,
      dims: DIMS,
      reuse: prev.reuse,
    })
    expect(i.semantic).toBe(true)
    expect(embedded.length).toBeGreaterThan(0)
    expect(embedded.length).toBeLessThan(i.chunks.length)
    expect(embedded.some((t) => t.includes('párrafo nuevo'))).toBe(true)
  })

  test('partly covered and no embedder: keyword-only, with a warning', async () => {
    const prev = reusableFrom(await prebuilt('embeddinggemma-2'), {
      dims: DIMS,
      acceptModels: ACCEPT,
    })
    if (!prev.ok) throw new Error(prev.reason)
    const warns: string[] = []
    const changed = DOCS.map((d, i) =>
      i === 0 ? { ...d, body: `${d.body} x` } : d,
    )
    const i = await buildIndex(changed, {
      embedder: null,
      dims: DIMS,
      reuse: prev.reuse,
      onWarn: (m) => warns.push(m),
    })
    expect(i.semantic).toBe(false)
    expect(warns[0]).toContain('keyword-only')
  })

  test('refuses vectors from a model that was not declared interchangeable', async () => {
    const r = reusableFrom(await prebuilt('@cf/google/embeddinggemma-300m'), {
      dims: DIMS,
      acceptModels: ACCEPT,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('EMBEDDER_ACCEPT_MODELS')
    const ok = reusableFrom(await prebuilt('@cf/google/embeddinggemma-300m'), {
      dims: DIMS,
      acceptModels: [...ACCEPT, '@cf/google/embeddinggemma-300m'],
    })
    expect(ok.ok).toBe(true)
  })

  test('refuses other dims and keyword-only previous indexes', async () => {
    const dims = reusableFrom(await prebuilt('embeddinggemma-2'), {
      dims: DIMS + 1,
      acceptModels: ACCEPT,
    })
    expect(dims.ok).toBe(false)
    const kw = await buildIndex(DOCS, { embedder: null, dims: DIMS })
    expect(reusableFrom(kw, { dims: DIMS, acceptModels: ACCEPT }).ok).toBe(
      false,
    )
  })

  test('the reuse key follows the embedded text, so edits never get a stale vector', () => {
    const c = { title: 't', heading: 'h', text: 'a' }
    expect(embedKey(c)).toBe(embedKey({ ...c }))
    expect(embedKey(c)).not.toBe(embedKey({ ...c, text: 'b' }))
    expect(embedKey(c)).not.toBe(embedKey({ ...c, heading: null }))
  })
})

describe('compatibility between embedders', () => {
  const scaled = (k: number) =>
    new EmbedderClient({
      model: `m-${k}`,
      fetch: (async (_u: unknown, init?: { body?: unknown }) => {
        const { input } = JSON.parse(String(init?.body)) as { input: string[] }
        return Response.json({
          data: input.map((t, index) => ({
            index,
            // Same direction scaled (cosine 1), or the vector with noise added.
            embedding: fakeVector(t).map((x, i) =>
              k === 0 ? x * 3 : x + (i === 0 ? k : 0),
            ),
          })),
        })
      }) as unknown as typeof fetch,
    })
  const texts = ['uno', 'dos', 'tres', 'cuatro']

  test('same model up to scale: cosine 1, ok', async () => {
    const r = await compareEmbedders(fakeEmbedder(), scaled(0), texts, {
      dims: DIMS,
    })
    expect(r.ok).toBe(true)
    expect(r.min).toBeGreaterThan(0.999)
    expect(r.pairs).toBe(4)
  })

  test('a drifting model fails and reports the worst pairs', async () => {
    const r = await compareEmbedders(fakeEmbedder(), scaled(5), texts, {
      dims: DIMS,
    })
    expect(r.ok).toBe(false)
    expect(r.min).toBeLessThan(0.99)
    expect(r.worst.length).toBeGreaterThan(0)
    expect(r.worst[0]!.cosine).toBe(r.min)
  })

  test('sampleEvenly is deterministic and spread', () => {
    const items = Array.from({ length: 100 }, (_, i) => i)
    expect(sampleEvenly(items, 4)).toEqual([0, 25, 50, 75])
    expect(sampleEvenly(items, 200)).toHaveLength(100)
  })
})

describe('hosted embedder config', () => {
  const cf = {
    EMBEDDER_URL:
      'https://api.cloudflare.com/client/v4/accounts/abc/ai/v1/embeddings',
    EMBEDDER_MODEL: '@cf/google/embeddinggemma-300m',
    EMBEDDER_TOKEN: 'secret-token',
  }

  test('the token needs https (loopback excepted) and never reaches describeConfig', () => {
    expect(() =>
      loadConfig({
        LLM_PROVIDER: 'fake',
        ...cf,
        EMBEDDER_URL: 'http://example.com/v1/embeddings',
      }),
    ).toThrow(ConfigError)
    expect(() =>
      loadConfig({
        LLM_PROVIDER: 'fake',
        ...cf,
        EMBEDDER_URL: 'http://127.0.0.1:8891/v1/embeddings',
      }),
    ).not.toThrow()
    const c = loadConfig({ LLM_PROVIDER: 'fake', ...cf })
    expect(c.embedder.token).toBe('secret-token')
  })

  test('acceptModels always includes the configured model', () => {
    const c = loadConfig({
      LLM_PROVIDER: 'fake',
      EMBEDDER_ACCEPT_MODELS: ' @cf/google/embeddinggemma-300m , ',
    })
    expect(c.embedder.acceptModels).toEqual([
      'embeddinggemma-2',
      '@cf/google/embeddinggemma-300m',
    ])
  })

  test('createEmbedder sends the bearer token and retries 429/5xx', async () => {
    const seen: { auth: string | null }[] = []
    const real = globalThis.fetch
    let n = 0
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      seen.push({ auth: new Headers(init?.headers).get('authorization') })
      if (++n < 3) return new Response('busy', { status: n === 1 ? 429 : 503 })
      return Response.json({ data: [{ index: 0, embedding: [1, 0] }] })
    }) as unknown as typeof fetch
    try {
      const e = createEmbedder(loadConfig({ LLM_PROVIDER: 'fake', ...cf }), {
        retries: 3,
        timeoutMs: 5000,
      })
      expect(await e.embed('hola')).toEqual([1, 0])
      expect(seen).toHaveLength(3)
      expect(seen.every((s) => s.auth === 'Bearer secret-token')).toBe(true)
    } finally {
      globalThis.fetch = real
    }
  })

  test('without retries (request path) a 5xx is returned as is', async () => {
    const real = globalThis.fetch
    let n = 0
    globalThis.fetch = (async () => {
      n++
      return new Response('down', { status: 503 })
    }) as unknown as typeof fetch
    try {
      const e = createEmbedder(loadConfig({ LLM_PROVIDER: 'fake' }))
      await expect(e.embed('hola')).rejects.toThrow('503')
      expect(n).toBe(1)
    } finally {
      globalThis.fetch = real
    }
  })
})
