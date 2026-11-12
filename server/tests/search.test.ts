import { describe, expect, test } from 'bun:test'
import { buildIndex } from '../src/index/build.ts'
import {
  KeywordIndex,
  Retriever,
  semanticSearch,
  tokenize,
} from '../src/index/search.ts'
import {
  INDEX_VERSION,
  IndexFormatError,
  parseIndex,
} from '../src/index/store.ts'
import {
  DOCS,
  chunks,
  fakeEmbedder,
  fakeVector,
  keywordIndex,
  semanticIndex,
} from './helpers.ts'

describe('index build', () => {
  test('embeds every chunk and writes a versioned, valid index', async () => {
    const index = await semanticIndex()
    expect(index.version).toBe(INDEX_VERSION)
    expect(index.semantic).toBe(true)
    expect(index.chunks).toHaveLength(chunks.length)
    expect(index.chunks.every((c) => c.vector?.length === index.dims)).toBe(
      true,
    )
    // Survives a JSON round trip through the strict parser.
    const onDisk = JSON.stringify(index)
    expect(parseIndex(JSON.parse(onDisk)).chunks).toHaveLength(chunks.length)
  })

  test('unreachable embedder: keyword-only index, no throw', async () => {
    const warns: string[] = []
    const index = await buildIndex(DOCS, {
      embedder: fakeEmbedder({ fail: true }),
      dims: 5,
      onWarn: (m) => warns.push(m),
    })
    expect(index.semantic).toBe(false)
    expect(index.model).toBeNull()
    expect(index.chunks.every((c) => c.vector === undefined)).toBe(true)
    expect(warns[0]).toContain('keyword-only')
  })

  test('parseIndex rejects wrong version, bad vectors and duplicate ids', async () => {
    const good = structuredClone(await semanticIndex()) as any
    expect(() => parseIndex({ ...good, version: 99 })).toThrow(IndexFormatError)
    const bad = structuredClone(good)
    bad.chunks[0].vector = [1, 2]
    expect(() => parseIndex(bad)).toThrow('bad vector')
    const dup = structuredClone(good)
    dup.chunks[1].id = dup.chunks[0].id
    expect(() => parseIndex(dup)).toThrow('duplicate')
  })
})

describe('semantic ranking', () => {
  test('finds the right section by meaning, not by shared words', async () => {
    const index = await semanticIndex()
    // "pintar" never appears in the doc body: only the concept matches.
    const hits = semanticSearch(index, fakeVector('quiero pintar algo'), 3)
    expect(hits[0]!.slug).toBe('dibujar-texto')
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score)
    const deploy = semanticSearch(index, fakeVector('como desplegar'), 3)
    expect(deploy[0]!.slug).toBe('flujo-de-deploy')
  })

  test('every hit carries slug, heading anchor and excerpt', async () => {
    const r = await new Retriever(await semanticIndex(), fakeEmbedder(), {
      minSemanticScore: 0.25,
    }).search('slot blue green', 3)
    expect(r.mode).toBe('semantic')
    for (const h of r.hits) {
      expect(h.slug).toBeTruthy()
      expect(h.excerpt.length).toBeGreaterThan(0)
      expect(h.anchor === null || /^[a-z0-9-]+$/.test(h.anchor)).toBe(true)
    }
  })

  test('top-k and minScore are honoured', async () => {
    const index = await semanticIndex()
    expect(semanticSearch(index, fakeVector('deploy'), 2)).toHaveLength(2)
    expect(
      semanticSearch(index, fakeVector('deploy'), 10, 0.99).length,
    ).toBeLessThan(3)
  })
})

describe('keyword fallback', () => {
  test('BM25 ranks the section that mentions the terms, accents and plurals folded', () => {
    const kw = new KeywordIndex(chunks)
    const hits = kw.search('rollback del symlink', 3)
    expect(hits[0]!.anchor).toBe('rollback')
    expect(kw.search('nativas de texto', 2)[0]!.slug).toBe('dibujar-texto')
    expect(kw.search('zzzz', 3)).toEqual([])
    expect(kw.search('el la de', 3)).toEqual([])
  })

  test('tokenize drops stop words and folds accents', () => {
    expect(tokenize('¿Cómo funciona el Rollback?')).toEqual(['rollback'])
  })

  test('embedder down: keyword mode, degraded, no throw, then cooldown skips it', async () => {
    const state = { fail: true, calls: 0 }
    let t = 1_000
    const r = new Retriever(await semanticIndex(), fakeEmbedder(state), {
      minSemanticScore: 0.25,
      cooldownMs: 30_000,
      now: () => t,
    })
    const a = await r.search('rollback', 3)
    expect(a).toMatchObject({ mode: 'keyword', degraded: true })
    expect(a.hits[0]!.anchor).toBe('rollback')
    expect(state.calls).toBe(1)
    await r.search('rollback', 3)
    expect(state.calls).toBe(1) // cooldown: not retried
    t += 31_000
    state.fail = false
    expect((await r.search('rollback', 3)).mode).toBe('semantic')
    expect(state.calls).toBe(2)
  })

  test('keyword-only index works without any embedder', async () => {
    const r = new Retriever(await keywordIndex(), null, {
      minSemanticScore: 0.25,
    })
    const out = await r.search('slug url', 3)
    expect(out).toMatchObject({ mode: 'keyword', degraded: true })
    expect(out.hits[0]!.slug).toBe('glosario')
  })

  test('semantic miss falls back to keywords (exact identifiers)', async () => {
    const r = new Retriever(await semanticIndex(), fakeEmbedder(), {
      minSemanticScore: 0.99,
    })
    const out = await r.search('symlink', 3)
    expect(out.mode).toBe('keyword')
    expect(out.degraded).toBe(false)
    expect(out.hits[0]!.anchor).toBe('rollback')
  })
})
