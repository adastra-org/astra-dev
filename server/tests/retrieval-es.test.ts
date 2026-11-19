// Spanish questions must reach English native names. The embedder is weak across languages on
// identifiers, so a lexical match on the words of the name (through the ES -> EN glossary) is fused
// with the semantic ranking. These tests make the semantic side blind on purpose (the fake
// embedder puts every native in the same "other" dimension): only the name match can order them.
import { describe, expect, test } from 'bun:test'
import type { NativeRecord } from '../src/docs/natives.ts'
import { nativeChunk } from '../src/docs/natives.ts'
import { buildIndex } from '../src/index/build.ts'
import { NativeNameIndex } from '../src/index/names.ts'
import { Retriever, tokenize } from '../src/index/search.ts'
import { DIMS, DOCS, fakeEmbedder } from './helpers.ts'

const native = (name: string): NativeRecord => ({
  id: `gta:${name}`,
  slug: name.toLowerCase().replace(/_/g, '-'),
  source: 'gta',
  name,
  luaName: name
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, (_m, _a, c: string) => c.toUpperCase()),
  ns: 'VEHICLE',
  apiset: null,
  hashes: [],
  aliases: [],
  signature: `int ${name}(Vehicle vehicle)`,
  params: [],
  returnType: 'int',
  description: '',
  returns: '',
  examples: '',
  astraNotes: '',
})

// Distractors first, targets last: a tie in the semantic ranking keeps index order, so without the
// name match the targets would never reach the top.
const NOISE = [
  'SET_PED_CAN_RAGDOLL',
  'GET_PED_MAX_HEALTH',
  'SET_VEHICLE_DOOR_OPEN',
  'GET_VEHICLE_WHEEL_SPEED',
  'SET_VEHICLE_FORWARD_SPEED',
  'GET_VEHICLE_MODEL_ACCELERATION',
  'CREATE_PED',
  'DELETE_PED',
  'GET_NUMBER_OF_VEHICLE_NUMBER_PLATES',
  'SET_VEHICLE_MOD',
  'SET_LIGHT_COLOR',
  'GET_ENTITY_MODEL',
  'GET_VEHICLE_MODEL_ESTIMATED_MAX_SPEED',
  'SET_ENTITY_COORDS',
]
const TARGETS = [
  'GET_VEHICLE_CLASS',
  'GET_VEHICLE_NUMBER_PLATE_TEXT',
  'SET_VEHICLE_NUMBER_PLATE_TEXT',
  'SET_VEHICLE_COLOURS',
  'CREATE_VEHICLE',
  'DELETE_VEHICLE',
  'GET_ENTITY_COORDS',
]
const NATIVES = [...NOISE, ...TARGETS].map(native)

const CASES: [string, string][] = [
  ['Como obtengo la clase de un vehiculo?', 'GET_VEHICLE_CLASS'],
  ['cómo obtengo la matrícula de un vehículo', 'GET_VEHICLE_NUMBER_PLATE_TEXT'],
  ['cómo cambio la matrícula de un vehículo', 'SET_VEHICLE_NUMBER_PLATE_TEXT'],
  ['cómo cambio el color de un vehículo', 'SET_VEHICLE_COLOURS'],
  ['como creo un vehiculo', 'CREATE_VEHICLE'],
  ['como elimino un vehiculo', 'DELETE_VEHICLE'],
  ['cómo obtengo las coordenadas de una entidad', 'GET_ENTITY_COORDS'],
]

describe('Spanish questions reach English natives', () => {
  const make = async (embed: boolean) =>
    new Retriever(
      await buildIndex(DOCS, {
        embedder: embed ? fakeEmbedder() : null,
        dims: DIMS,
        natives: NATIVES,
      }),
      embed ? fakeEmbedder() : null,
      { minSemanticScore: 0.25 },
    )

  for (const embed of [true, false])
    test(`the native is in the natives of the chat (${embed ? 'semantic, blind to names' : 'keyword'})`, async () => {
      const r = await make(embed)
      for (const [question, want] of CASES) {
        const res = await r.searchMany(question, [
          { kind: 'doc', k: 5 },
          { kind: 'native', k: 3 },
        ])
        const names = res.hits
          .filter((h) => h.kind === 'native')
          .map((h) => h.native?.name)
        expect({ question, names }).toEqual({
          question,
          names: expect.arrayContaining([want]),
        })
        // Keyword mode has no blind spot: the verb and the object both match, so it leads.
        if (!embed) expect(names[0]).toBe(want)
      }
    })

  test('a bare verb matches nothing (it would match thousands of natives)', async () => {
    const names = new NativeNameIndex(
      (await buildIndex(DOCS, { embedder: null, dims: DIMS, natives: NATIVES }))
        .chunks,
    )
    expect(names.search(tokenize('obtengo'), 5)).toEqual([])
    expect(names.search(tokenize('hola que tal'), 5)).toEqual([])
  })

  test('English questions and Lua names keep working', async () => {
    const r = await make(true)
    const res = await r.searchMany('how do I get the class of a vehicle', [
      { kind: 'native', k: 3 },
    ])
    expect(res.hits[0]?.native?.name).toBe('GET_VEHICLE_CLASS')
    const lua = await r.searchMany('GetVehicleClass', [
      { kind: 'native', k: 3 },
    ])
    expect(lua.hits[0]?.native?.name).toBe('GET_VEHICLE_CLASS')
  })

  test('natives chunk helper still builds identity (guards the fixture)', () => {
    expect(nativeChunk(native('GET_VEHICLE_CLASS')).native?.luaName).toBe(
      'GetVehicleClass',
    )
  })
})
