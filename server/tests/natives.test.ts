import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chunkPath } from '../src/docs/chunk.ts'
import {
  NATIVE_MAX_CHARS,
  nativeChunk,
  nativeText,
  parseNativeRecord,
  readNatives,
  type NativeRecord,
} from '../src/docs/natives.ts'
import { buildIndex } from '../src/index/build.ts'
import { NativeLookup, hashKey, nameKey } from '../src/index/lookup.ts'
import { Retriever, tokenize } from '../src/index/search.ts'
import {
  IndexFormatError,
  parseIndex,
  serializeIndex,
} from '../src/index/store.ts'
import { DIMS, DOCS, fakeEmbedder, harness, parseSse } from './helpers.ts'

const native = (o: Partial<NativeRecord> & { name: string }): NativeRecord => ({
  id: `gta:${o.name}`,
  slug: o.name.toLowerCase().replace(/_/g, '-'),
  source: 'gta',
  luaName: o.name
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, (_m, _a, c: string) => c.toUpperCase()),
  ns: 'ENTITY',
  apiset: null,
  hashes: [],
  aliases: [],
  signature: `void ${o.name}(Entity entity)`,
  params: [],
  returnType: 'void',
  description: '',
  returns: '',
  examples: '',
  astraNotes: '',
  ...o,
})

const COORDS = native({
  name: 'GET_ENTITY_COORDS',
  hashes: ['0x3FEF770D40960D5A', '0x1647F1CB'],
  description: 'Gets the position of an entity.',
  params: [{ name: 'entity', type: 'Entity', description: 'The entity.' }],
  astraNotes: 'En Astra usa vec3 siempre.',
})
const COORDS_SERVER = native({
  name: 'GET_ENTITY_COORDS',
  id: 'cfx:GET_ENTITY_COORDS',
  slug: 'get-entity-coords-cfx-server',
  source: 'cfx',
  ns: 'CFX',
  apiset: 'server',
  hashes: ['0x1647F1CB'],
  description: 'Server-side version.',
})
const DOOR = native({
  name: 'SET_VEHICLE_DOOR_OPEN',
  ns: 'VEHICLE',
  hashes: ['0x7C65DAC73C35C862', '0xBB75D38B'],
  aliases: ['_0xE26CCFF8094D8C74', 'OLD_DOOR_NAME'],
  description: 'Sets the specified door index open on the passed vehicle.',
})
const WAIT = native({ name: 'WAIT', ns: 'SYSTEM', description: 'Waits.' })
const NATIVES = [COORDS, COORDS_SERVER, DOOR, WAIT]

const chunksOf = (natives: NativeRecord[]) => natives.map(nativeChunk)

describe('native chunk', () => {
  test('names, signature, params and Astra notes are in the text', () => {
    const t = nativeText(COORDS)
    expect(t).toStartWith('GET_ENTITY_COORDS (GetEntityCoords) - ENTITY')
    expect(t).toContain('void GET_ENTITY_COORDS(Entity entity)')
    expect(t).toContain('- entity (Entity): The entity.')
    expect(t).toContain('Hashes: 0x3FEF770D40960D5A, 0x1647F1CB')
    expect(t).toContain('Notas de Astra:\nEn Astra usa vec3 siempre.')
  })
  test('long examples are cut; the text never exceeds the cap', () => {
    const t = nativeText(native({ name: 'BIG', examples: 'x'.repeat(5000) }))
    expect(t.length).toBeLessThanOrEqual(NATIVE_MAX_CHARS + 1)
    expect(t).toContain('…')
  })
  test('chunk identity and site path', () => {
    const c = nativeChunk(COORDS_SERVER)
    expect(c).toMatchObject({
      id: 'native:cfx:GET_ENTITY_COORDS',
      kind: 'native',
      title: 'GET_ENTITY_COORDS',
      heading: null,
    })
    expect(c.native?.apiset).toBe('server')
    expect(chunkPath(c)).toBe('/natives/get-entity-coords-cfx-server')
    expect(chunkPath({ kind: 'doc', slug: 'a', anchor: 'b' })).toBe('/docs/a#b')
  })
  test('parseNativeRecord rejects a record without signature', () => {
    expect(() =>
      parseNativeRecord({ id: 'gta:X', slug: 'x' }, 'f.json'),
    ).toThrow('malformed')
  })
})

describe('NativeLookup', () => {
  const lookup = new NativeLookup(chunksOf(NATIVES).map((c) => ({ ...c })))
  const names = (q: string) => lookup.find(q).map((c) => c.id)

  test('keys ignore case, underscores and call syntax', () => {
    expect(nameKey('SetVehicleDoorOpen')).toBe(nameKey('SET_VEHICLE_DOOR_OPEN'))
    expect(hashKey('0x00bb75d38b')).toBe('0xBB75D38B')
    for (const q of [
      'GET_ENTITY_COORDS',
      'GetEntityCoords',
      'getentitycoords',
      '`GetEntityCoords`',
      'GetEntityCoords(ped, true)',
    ])
      expect(names(q)).toEqual([
        'native:gta:GET_ENTITY_COORDS',
        'native:cfx:GET_ENTITY_COORDS',
      ])
  })
  test('by 64-bit hash, 32-bit hash and alias', () => {
    expect(names('0xBB75D38B')).toEqual(['native:gta:SET_VEHICLE_DOOR_OPEN'])
    expect(names('0x7c65dac73c35c862')).toEqual([
      'native:gta:SET_VEHICLE_DOOR_OPEN',
    ])
    expect(names('0xE26CCFF8094D8C74')).toEqual([
      'native:gta:SET_VEHICLE_DOOR_OPEN',
    ])
    expect(names('OLD_DOOR_NAME')).toEqual(['native:gta:SET_VEHICLE_DOOR_OPEN'])
    // The 32-bit hash is shared by the GTA native and its CFX redefinition.
    expect(names('0x1647F1CB')).toHaveLength(2)
  })
  test('a single plain word matches, but inside a sentence it does not', () => {
    expect(names('WAIT')).toEqual(['native:gta:WAIT'])
    expect(names('wait')).toEqual(['native:gta:WAIT'])
    expect(names('how do I wait for a resource to start')).toEqual([])
  })
  test('identifiers and hashes inside a sentence are found, in order', () => {
    expect(
      names('what does SET_VEHICLE_DOOR_OPEN do, compared to GetEntityCoords?'),
    ).toEqual([
      'native:gta:SET_VEHICLE_DOOR_OPEN',
      'native:gta:GET_ENTITY_COORDS',
      'native:cfx:GET_ENTITY_COORDS',
    ])
    expect(names('who calls 0xBB75D38B in the framework')).toEqual([
      'native:gta:SET_VEHICLE_DOOR_OPEN',
    ])
  })
  test('unknown names and empty queries find nothing; the cap holds', () => {
    expect(names('NOT_A_NATIVE')).toEqual([])
    expect(names('')).toEqual([])
    expect(lookup.find('GET_ENTITY_COORDS', 1)).toHaveLength(1)
  })
})

describe('tokenizer', () => {
  test('camelCase is split so Lua names match snake_case names', () => {
    expect(tokenize('GetEntityCoords')).toEqual(tokenize('GET_ENTITY_COORDS'))
    expect(tokenize('SetVehicleDoorOpen')).toEqual([
      'set',
      'vehicle',
      'door',
      'open',
    ])
  })
})

async function index(natives = NATIVES, embedder = fakeEmbedder()) {
  return buildIndex(DOCS, { embedder, dims: DIMS, natives })
}

describe('index with natives', () => {
  test('docs first, then one chunk per native; hash covers the natives', async () => {
    const a = await index()
    const b = await index([...NATIVES, native({ name: 'EXTRA' })])
    expect(a.chunks.filter((c) => c.kind === 'native')).toHaveLength(4)
    expect(a.chunks.findIndex((c) => c.kind === 'native')).toBeGreaterThan(
      a.chunks.findLastIndex((c) => c.kind === 'doc') - 1,
    )
    expect(a.sourceHash).not.toBe(b.sourceHash)
    const docsOnly = await buildIndex(DOCS, { embedder: null, dims: DIMS })
    expect(docsOnly.sourceHash).not.toBe(a.sourceHash)
  })
  test('survives the strict parser; malformed native metadata is rejected', async () => {
    const i = await index()
    const { json, vectors } = serializeIndex(i)
    const round = parseIndex(JSON.parse(json), vectors)
    const c = round.chunks.find(
      (x) => x.id === 'native:gta:SET_VEHICLE_DOOR_OPEN',
    )
    expect(c?.native?.hashes).toEqual(['0x7C65DAC73C35C862', '0xBB75D38B'])

    const bad = JSON.parse(json)
    const target = bad.chunks.find((x: { kind: string }) => x.kind === 'native')
    delete target.native
    expect(() => parseIndex(bad, vectors)).toThrow(IndexFormatError)
    const noKind = JSON.parse(json)
    delete noKind.chunks[0].kind
    expect(() => parseIndex(noKind, vectors)).toThrow(IndexFormatError)
  })
})

describe('retriever with natives', () => {
  const make = async (state = {}) =>
    new Retriever(
      await index(NATIVES, fakeEmbedder(state)),
      fakeEmbedder(state),
      {
        minSemanticScore: 0.25,
      },
    )

  test('a native named in the query is first, whatever the semantic ranking says', async () => {
    const r = await make()
    const res = await r.search('dibujar texto con SetVehicleDoorOpen', 5)
    expect(res.hits[0]).toMatchObject({
      kind: 'native',
      slug: 'set-vehicle-door-open',
      score: 1,
    })
    expect(res.hits[0]?.native?.name).toBe('SET_VEHICLE_DOOR_OPEN')
    expect(res.hits.some((h) => h.slug === 'dibujar-texto')).toBe(true)
  })
  test('kind restricts results; docs-only never returns natives', async () => {
    const r = await make()
    const docs = await r.search('GetEntityCoords', 5, { kind: 'doc' })
    expect(docs.hits.every((h) => h.kind === 'doc')).toBe(true)
    const natives = await r.search('rollback del deploy', 5, { kind: 'native' })
    expect(natives.hits.every((h) => h.kind === 'native')).toBe(true)
  })
  test('searchMany ranks docs and natives apart, from one query embedding', async () => {
    const state = { calls: 0 }
    const r = await make(state)
    state.calls = 0
    const res = await r.searchMany('rollback del deploy con WAIT', [
      { kind: 'doc', k: 2 },
      { kind: 'native', k: 2 },
    ])
    expect(state.calls).toBe(1)
    expect(res.hits.filter((h) => h.kind === 'doc').length).toBeLessThanOrEqual(
      2,
    )
    expect(
      res.hits.filter((h) => h.kind === 'native').length,
    ).toBeLessThanOrEqual(2)
    expect(res.hits.find((h) => h.kind === 'doc')?.slug).toBe('flujo-de-deploy')
    expect(new Set(res.hits.map((h) => h.id)).size).toBe(res.hits.length)
  })
  test('embedder down: degraded, but exact native lookup still works', async () => {
    const built = await index()
    const r = new Retriever(built, fakeEmbedder({ fail: true }), {
      minSemanticScore: 0.25,
    })
    const res = await r.search('0xBB75D38B', 5)
    expect(res.degraded).toBe(true)
    expect(res.hits[0]?.slug).toBe('set-vehicle-door-open')
  })
  test('BM25 finds a native by its Lua name in words', async () => {
    const r = new Retriever(
      await buildIndex(DOCS, { embedder: null, dims: DIMS, natives: NATIVES }),
      null,
      {
        minSemanticScore: 0.25,
      },
    )
    const res = await r.search('open the door of a vehicle', 3, {
      kind: 'native',
    })
    expect(res.mode).toBe('keyword')
    expect(res.hits[0]?.slug).toBe('set-vehicle-door-open')
  })
  test('info counts docs and natives', async () => {
    const r = await make()
    expect(r.info).toMatchObject({ natives: 4 })
    expect(r.info.docs + r.info.natives).toBe(r.info.chunks)
  })
})

describe('graphql and chat with natives', () => {
  const gql = async (h: Awaited<ReturnType<typeof harness>>, query: string) =>
    (await h.call('/graphql', { json: { query } })).json()

  test('native(q) returns identity and signature, no description', async () => {
    const h = await harness({ role: 'public', index: await index() })
    const body = await gql(
      h,
      '{ native(q: "GetEntityCoords") { id name luaName ns apiset source hashes signature path } }',
    )
    expect(body.data.native.map((n: { id: string }) => n.id)).toEqual([
      'gta:GET_ENTITY_COORDS',
      'cfx:GET_ENTITY_COORDS',
    ])
    expect(body.data.native[1]).toMatchObject({
      apiset: 'server',
      path: '/natives/get-entity-coords-cfx-server',
    })
    const leak = await gql(h, '{ native(q: "WAIT") { description } }')
    expect(leak.errors?.[0]?.message).toContain('Cannot query field')
  })
  test('searchDocs takes a kind and exposes kind and path', async () => {
    const h = await harness({ role: 'public', index: await index() })
    const body = await gql(
      h,
      '{ searchDocs(q: "SET_VEHICLE_DOOR_OPEN", kind: "native") { hits { kind path } } }',
    )
    expect(body.data.searchDocs.hits[0]).toEqual({
      kind: 'native',
      path: '/natives/set-vehicle-door-open',
    })
    const bad = await gql(
      h,
      '{ searchDocs(q: "x", kind: "nope") { hits { kind } } }',
    )
    expect(bad.errors?.[0]?.extensions?.code).toBe('bad_request')
  })
  test('the chat cites a native named in the question, first, with its page', async () => {
    const h = await harness({ index: await index() })
    const res = await h.call('/chat', {
      json: {
        question: 'Para que sirve SetVehicleDoorOpen y como hago rollback',
      },
    })
    const events = parseSse(await res.text())
    const sources = events.find((e) => e.event === 'sources')!.data.sources
    expect(sources[0]).toMatchObject({
      n: 1,
      kind: 'native',
      path: '/natives/set-vehicle-door-open',
    })
    expect(sources.some((s: { kind: string }) => s.kind === 'doc')).toBe(true)
    const prompt = h.llm.requests[0]!.messages[1]!.content
    expect(prompt).toContain('tipo="native"')
    expect(prompt).toContain('Sets the specified door index open')
  })
  test('CHAT_NATIVES_TOP_K=0 keeps the context to docs only', async () => {
    const h = await harness({
      index: await index(),
      env: { CHAT_NATIVES_TOP_K: '0' },
    })
    const res = await h.call('/chat', {
      json: { question: 'rollback del deploy, no SetVehicleDoorOpen' },
    })
    const sources = parseSse(await res.text()).find(
      (e) => e.event === 'sources',
    )!.data.sources
    expect(sources.every((s: { kind: string }) => s.kind === 'doc')).toBe(true)
  })
  test('/ready reports docs and natives', async () => {
    const h = await harness({ index: await index() })
    const body = await (await h.call('/ready')).json()
    expect(body.index).toMatchObject({ natives: 4 })
  })
})

describe('readNatives', () => {
  const withDir = async (fn: (dir: string) => Promise<void>) => {
    const dir = await mkdtemp(join(tmpdir(), 'astra-natives-'))
    try {
      await fn(dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
  const write = async (dir: string, rel: string, data: unknown) => {
    await mkdir(join(dir, 'natives', rel.split('/')[0]!), { recursive: true })
    await writeFile(join(dir, 'natives', rel), JSON.stringify(data))
  }

  test('reads group files, skips index.json, and returns [] when absent', async () => {
    await withDir(async (dir) => {
      expect(await readNatives(dir)).toEqual([])
      await write(dir, 'gta/entity.json', [COORDS, WAIT])
      await write(dir, 'cfx/server.json', [COORDS_SERVER])
      await writeFile(join(dir, 'natives', 'index.json'), '[]')
      const out = await readNatives(dir)
      expect(out.map((n) => n.id).sort()).toEqual([
        'cfx:GET_ENTITY_COORDS',
        'gta:GET_ENTITY_COORDS',
        'gta:WAIT',
      ])
    })
  })
  test('a duplicate id or a broken record fails with the file name', async () => {
    await withDir(async (dir) => {
      await write(dir, 'gta/a.json', [COORDS])
      await write(dir, 'gta/b.json', [COORDS])
      await expect(readNatives(dir)).rejects.toThrow('duplicate native')
    })
    await withDir(async (dir) => {
      await write(dir, 'gta/a.json', [{ id: 'gta:X' }])
      await expect(readNatives(dir)).rejects.toThrow('a.json')
    })
  })
})
