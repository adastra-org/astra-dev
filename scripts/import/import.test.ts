import { describe, expect, test } from 'bun:test'
import { buildCorpus, overrideKey, type CorpusInput } from './corpus.ts'
import {
  convertBody,
  convertDoc,
  docSlug,
  docUrl,
  firstParagraph,
  rewriteHref,
  type ConvertContext,
} from './fivem-docs.ts'
import { joaat, normalizeHash } from './hash.ts'
import { parseNative } from './natives.ts'
import { parseSources } from './sources.ts'
import { ImportError } from './types.ts'

const GTA = `---
ns: VEHICLE
---
## SET_VEHICLE_DOOR_OPEN

\`\`\`c
// 0x7C65DAC73C35C862 0xBB75D38B
void SET_VEHICLE_DOOR_OPEN(Vehicle vehicle, int doorIndex, BOOL loose, BOOL openInstantly);
\`\`\`

Sets the door open. See [\`IS_VEHICLE_DOOR_FULLY_OPEN\`](#_0x3E933CFF7B111C22) and [x](#_0xDEAD).

## Parameters
* **vehicle**: Vehicle.
* **doorIndex**: Index of the door
  (0-7)
* **loose**:
* **openInstantly**: Instant.

## Examples
\`\`\`lua
SetVehicleDoorOpen(v, 0, false, true)
\`\`\`
`

const DOOR_FULLY = `---
ns: VEHICLE
---
## IS_VEHICLE_DOOR_FULLY_OPEN

\`\`\`c
// 0x3E933CFF7B111C22 0xCA2E3C2D
BOOL IS_VEHICLE_DOOR_FULLY_OPEN(Vehicle vehicle, int doorIndex);
\`\`\`
`

const CFX = `---
ns: CFX
apiset: server
---
## GET_PLAYER_IDENTIFIER

\`\`\`c
char* GET_PLAYER_IDENTIFIER(char* playerSrc, int identiferIndex);
\`\`\`

Use [GET_NUM_PLAYER_IDENTIFIERS](#_0xFF7F66AB).
`

const NUM_IDS = `---
ns: CFX
apiset: server
---
## GET_NUM_PLAYER_IDENTIFIERS

\`\`\`c
int GET_NUM_PLAYER_IDENTIFIERS(char* playerSrc);
\`\`\`
`

describe('hash', () => {
  test('joaat coincide con los hashes cortos reales de la fuente', () => {
    expect(joaat('SET_VEHICLE_DOOR_OPEN')).toBe('0xBB75D38B')
    expect(joaat('GET_NUM_PLAYER_IDENTIFIERS')).toBe('0xFF7F66AB')
  })
  test('normalizeHash: mayúsculas y sin ceros a la izquierda', () => {
    expect(normalizeHash('0x00ab')).toBe('0xAB')
    expect(normalizeHash('0xFF7F66AB')).toBe('0xFF7F66AB')
  })
})

describe('parseNative', () => {
  const n = parseNative('gta', 'VEHICLE/SetVehicleDoorOpen.md', GTA)
  test('firma, hashes y namespace', () => {
    expect(n.id).toBe('gta:SET_VEHICLE_DOOR_OPEN')
    expect(n.luaName).toBe('SetVehicleDoorOpen')
    expect(n.ns).toBe('VEHICLE')
    expect(n.returnType).toBe('void')
    expect(n.hashes).toEqual(['0x7C65DAC73C35C862', '0xBB75D38B'])
  })
  test('parámetros con su documentación (multilínea y vacía)', () => {
    expect(n.params.map((p) => p.name)).toEqual([
      'vehicle',
      'doorIndex',
      'loose',
      'openInstantly',
    ])
    expect(n.params[1]).toEqual({
      name: 'doorIndex',
      type: 'int',
      description: 'Index of the door\n(0-7)',
    })
    expect(n.params[2]?.description).toBe('')
  })
  test('descripción, ejemplos y enlaces', () => {
    expect(n.description).toStartWith('Sets the door open.')
    expect(n.examples).toContain('SetVehicleDoorOpen(v, 0, false, true)')
    expect(n.seeAlso).toEqual(['0x3E933CFF7B111C22', '0xDEAD'])
  })
  test('anotación cs_type antes del tipo', () => {
    const x = parseNative(
      'gta',
      'APP/AppDataValid.md',
      '---\nns: APP\n---\n## APP_DATA_VALID\n\n```c\n// 0x1\ncs_type(int) BOOL APP_DATA_VALID();\n```\n',
    )
    expect(x.returnType).toBe('BOOL')
    expect(x.params).toEqual([])
  })
  test('encabezado vacío o atrasado: manda la firma', () => {
    const empty = parseNative(
      'gta',
      'HUD/X.md',
      '---\nns: HUD\n---\n## \n\n```c\n// 0x1\nBOOL SET_X(int a);\n```\n',
    )
    expect(empty.name).toBe('SET_X')
    const old = parseNative(
      'gta',
      'NETWORK/Y.md',
      '---\nns: NETWORK\n---\n## _0xE26C\n\n```c\n// 0x1\nBOOL NEW_NAME(int p0);\n```\n',
    )
    expect(old.name).toBe('NEW_NAME')
    expect(old.aliases).toEqual(['_0xE26C'])
  })
  test('CFX sin hash: usa el joaat del nombre y lee apiset', () => {
    const c = parseNative('cfx', 'ext/native-decls/GetPlayerIdentifier.md', CFX)
    expect(c.apiset).toBe('server')
    expect(c.hashes).toEqual([joaat('GET_PLAYER_IDENTIFIER')])
  })
  test('sin firma es un error con la ruta', () => {
    expect(() =>
      parseNative('gta', 'A/B.md', '---\nns: A\n---\n## B\n\nsolo texto\n'),
    ).toThrow(ImportError)
  })
})

const ctx = (over: Partial<ConvertContext> = {}): ConvertContext => ({
  urlToSlug: new Map([
    [
      '/docs/scripting-manual/introduction',
      'fivem-scripting-manual-introduction',
    ],
    ['/docs/old/place', 'fivem-new-place'],
  ]),
  natives: new Map([
    ['DROP_PLAYER', { id: 'cfx:DROP_PLAYER', slug: 'drop-player' }],
  ]),
  since: '0.5.0',
  readStatic: (p) => (p === 'examples/a.lua' ? 'print(1)\n' : null),
  manifestVersions: { rmv: 'adamant', rmv2: 'cerulean' },
  ...over,
})

describe('slug y url de docs', () => {
  test('un _index toma el nombre de su carpeta', () => {
    expect(docSlug('scripting-manual/introduction/_index.md')).toBe(
      'fivem-scripting-manual-introduction',
    )
    expect(docUrl('scripting-manual/introduction/_index.md')).toBe(
      '/docs/scripting-manual/introduction',
    )
    expect(docSlug('cookbook/Some_Page.md')).toBe('fivem-cookbook-some-page')
  })
})

describe('rewriteHref', () => {
  const base = '/docs/scripting-manual/introduction'
  test('absoluto conocido, alias, relativo y desconocido', () => {
    expect(
      rewriteHref(base, '/docs/scripting-manual/introduction/', ctx()),
    ).toEqual({
      href: '/docs/fivem-scripting-manual-introduction',
      slug: 'fivem-scripting-manual-introduction',
    })
    expect(rewriteHref(base, '/docs/old/place/#frag', ctx()).href).toBe(
      '/docs/fivem-new-place#frag',
    )
    expect(
      rewriteHref('/docs/scripting-manual/introduction/a', '../', ctx()).slug,
    ).toBe('fivem-scripting-manual-introduction')
    expect(rewriteHref(base, '/docs/nope/', ctx()).href).toBe(
      'https://docs.fivem.net/docs/nope',
    )
    expect(rewriteHref(base, '/alchemist/a.png', ctx()).href).toBe(
      'https://docs.fivem.net/alchemist/a.png',
    )
  })
  test('externos, anclas y mailto no se tocan', () => {
    for (const h of ['https://x.dev/a', '#sec', 'mailto:a@b.c', '//cdn/x.js'])
      expect(rewriteHref(base, h, ctx()).href).toBe(h)
  })
})

describe('convertBody', () => {
  const run = (text: string, c = ctx()) => {
    const warns: string[] = []
    return { ...convertBody(text, 'a/b.md', c, (m) => warns.push(m)), warns }
  }
  test('alert (con color, theme y title) pasa a cita', () => {
    const r = run('{{% alert color="warning" %}}\nCuidado\n{{% /alert %}}\n')
    expect(r.body).toContain('> **Warning**')
    expect(r.body).toContain('> Cuidado')
    expect(
      run('{{< alert title="Archive" color="info" >}}\nx\n{{< /alert >}}').body,
    ).toContain('> **Archive**')
  })
  test('native_link: enlaza a los conocidos y registra la referencia', () => {
    const r = run(
      'Usa {{% native_link "DROP_PLAYER" %}} y {{< native_link "NOPE" >}}.',
    )
    expect(r.body).toContain('[`DROP_PLAYER`](/natives/drop-player)')
    expect(r.body).toContain('`NOPE`')
    expect(r.nativeRefs).toEqual(['cfx:DROP_PLAYER'])
  })
  test('video, youtube, article-nav, steps, rmv y code', () => {
    const r = run(
      [
        '{{% youtube id="abc" %}}',
        '{{% video src="https://v/x.mp4" %}}',
        '{{% article-nav %}}',
        '{{% steps %}}',
        "fx_version '{{% rmv2 %}}'",
        '{{% code file="/static/examples/a.lua" language="lua" %}}',
      ].join('\n'),
    )
    expect(r.body).toContain('https://youtu.be/abc')
    expect(r.body).toContain('[Video](https://v/x.mp4)')
    expect(r.body).toContain("fx_version 'cerulean'")
    expect(r.body).toContain('```lua\nprint(1)\n```')
    expect(r.body).not.toContain('{{')
    expect(r.warns).toEqual([])
  })
  test('shortcode desconocido: avisa y lo quita', () => {
    const r = run('a {{% mystery "x" %}} b')
    expect(r.body).toBe('a  b\n')
    expect(r.warns[0]).toContain('desconocido')
  })
  test('shortcode escapado se muestra literal', () => {
    expect(run('{{%/* native_link "X" */%}}').body).toBe(
      '{{% native_link "X" %}}\n',
    )
  })
  test('enlaces se reescriben fuera de código y no dentro', () => {
    const r = run(
      'Ver [intro](/docs/scripting-manual/introduction/) y `[x](/docs/a/)`.\n\n```md\n[y](/docs/a/)\n```\n',
    )
    expect(r.body).toContain(
      '[intro](/docs/fivem-scripting-manual-introduction)',
    )
    expect(r.body).toContain('`[x](/docs/a/)`')
    expect(r.body).toContain('[y](/docs/a/)')
    expect(r.links).toEqual(['fivem-scripting-manual-introduction'])
  })
  test('un H1 se baja a H2', () => {
    expect(run('# Titulo\n\ntexto').body).toStartWith('## Titulo')
  })
})

describe('convertDoc', () => {
  test('título, resumen de description o primer párrafo, tags', () => {
    const d = convertDoc(
      'scripting-manual/intro.md',
      '---\ntitle: Intro\ndescription: Corto.\n---\n\nTexto largo.\n',
      ctx(),
    )
    expect(d).toMatchObject({
      slug: 'fivem-scripting-manual-intro',
      title: 'Intro',
      summary: 'Corto.',
      tags: ['scripting-manual', 'fivem-docs'],
      since: '0.5.0',
      lang: 'en',
    })
    const e = convertDoc(
      'x/y.md',
      '---\ntitle: Y\n---\n\nPrimer [párrafo](/a) con `código`.\n\n## S\n',
      ctx(),
    )
    expect(e.summary).toBe('Primer párrafo con código.')
  })
  test('sin título es un error con la ruta', () => {
    expect(() =>
      convertDoc('x/y.md', '---\nweight: 1\n---\ntexto', ctx()),
    ).toThrow('x/y.md')
  })
  test('firstParagraph salta código, listas y encabezados y trunca', () => {
    expect(
      firstParagraph('## H\n\n- a\n\n```\ncode\n```\n\nHola mundo.\n'),
    ).toBe('Hola mundo.')
    expect(firstParagraph('x'.repeat(500))).toHaveLength(240)
  })
})

const input = (over: Partial<CorpusInput> = {}): CorpusInput => ({
  gta: [
    { path: 'VEHICLE/SetVehicleDoorOpen.md', raw: GTA },
    { path: 'VEHICLE/IsVehicleDoorFullyOpen.md', raw: DOOR_FULLY },
  ],
  cfx: [
    { path: 'ext/native-decls/GetPlayerIdentifier.md', raw: CFX },
    { path: 'ext/native-decls/GetNumPlayerIdentifiers.md', raw: NUM_IDS },
  ],
  docs: [
    {
      path: 'scripting-manual/_index.md',
      raw: '---\ntitle: Manual\naliases:\n  - /docs/manual-viejo/\n---\n\nVer {{% native_link "SET_VEHICLE_DOOR_OPEN" %}} y [viejo](/docs/manual-viejo/).\n',
    },
  ],
  overrides: new Map(),
  since: '0.5.0',
  readStatic: () => null,
  manifestVersions: { rmv: 'a', rmv2: 'b' },
  ...over,
})

describe('buildCorpus', () => {
  test('resuelve enlaces por hash 64/32 bits y por joaat de CFX', () => {
    const c = buildCorpus(input())
    const door = c.natives.find((n) => n.name === 'SET_VEHICLE_DOOR_OPEN')
    expect(door?.seeAlso).toEqual(['gta:IS_VEHICLE_DOOR_FULLY_OPEN'])
    expect(door?.unresolved).toEqual(['0xDEAD'])
    const id = c.natives.find((n) => n.name === 'GET_PLAYER_IDENTIFIER')
    expect(id?.seeAlso).toEqual(['cfx:GET_NUM_PLAYER_IDENTIFIERS'])
  })
  test('docs: native_link y enlaces por alias llegan como ids y slugs', () => {
    const c = buildCorpus(input())
    const d = c.docs[0]
    expect(d?.nativeRefs).toEqual(['gta:SET_VEHICLE_DOOR_OPEN'])
    expect(d?.links).toEqual(['fivem-scripting-manual'])
    expect(d?.body).toContain('(/natives/set-vehicle-door-open)')
  })
  test('nombre repetido entre GTA y CFX: ambos con sufijo, native_link va al de GTA', () => {
    const dup = `---\nns: CFX\napiset: server\n---\n## SET_VEHICLE_DOOR_OPEN\n\n\`\`\`c\nvoid SET_VEHICLE_DOOR_OPEN(Vehicle v);\n\`\`\`\n`
    const c = buildCorpus(
      input({
        cfx: [{ path: 'ext/native-decls/SetVehicleDoorOpen.md', raw: dup }],
      }),
    )
    const slugs = c.natives
      .filter((n) => n.name === 'SET_VEHICLE_DOOR_OPEN')
      .map((n) => n.slug)
      .sort()
    expect(slugs).toEqual([
      'set-vehicle-door-open-cfx-server',
      'set-vehicle-door-open-gta',
    ])
    expect(c.docs[0]?.body).toContain('(/natives/set-vehicle-door-open-gta)')
  })
  test('overrides por nombre Lua o canónico; uno huérfano avisa', () => {
    const c = buildCorpus(
      input({
        overrides: new Map([
          [overrideKey('SetVehicleDoorOpen'), 'Nota de Astra.'],
          [overrideKey('NO_EXISTE'), 'x'],
        ]),
      }),
    )
    expect(
      c.natives.find((n) => n.name === 'SET_VEHICLE_DOOR_OPEN')?.astraNotes,
    ).toBe('Nota de Astra.')
    expect(c.warnings.some((w) => w.includes('NOEXISTE'))).toBe(true)
  })
  test('un archivo roto no tapa al resto; vacío se omite con aviso', () => {
    const c = buildCorpus(
      input({
        gta: [
          { path: 'VEHICLE/SetVehicleDoorOpen.md', raw: GTA },
          {
            path: 'VEHICLE/Roto.md',
            raw: '---\nns: V\n---\n## R\n\nsin firma\n',
          },
        ],
        docs: [
          { path: 'a/vacio.md', raw: '\n' },
          { path: 'a/sin-titulo.md', raw: '---\nweight: 1\n---\nx' },
        ],
      }),
    )
    expect(c.errors.map((e) => e.file).sort()).toEqual([
      'VEHICLE/Roto.md',
      'a/sin-titulo.md',
    ])
    expect(c.natives.some((n) => n.name === 'SET_VEHICLE_DOOR_OPEN')).toBe(true)
    expect(c.warnings.some((w) => w.includes('vacío'))).toBe(true)
  })
  test('slug de doc repetido falla', () => {
    expect(() =>
      buildCorpus(
        input({
          docs: [
            { path: 'a/b.md', raw: '---\ntitle: A\n---\nx' },
            { path: 'a/B.md', raw: '---\ntitle: B\n---\nx' },
          ],
        }),
      ),
    ).toThrow('repetido')
  })
  test('salida determinista', () => {
    expect(JSON.stringify(buildCorpus(input()))).toBe(
      JSON.stringify(buildCorpus(input())),
    )
  })
})

describe('parseSources', () => {
  const ok = {
    since: '0.5.0',
    sources: {
      a: {
        repo: 'https://github.com/x/y',
        ref: 'master',
        sha: 'a'.repeat(40),
        paths: ['/c/'],
      },
    },
  }
  test('acepta un archivo válido', () => {
    expect(parseSources(ok).since).toBe('0.5.0')
  })
  test('rechaza sha corto, repo no GitHub y paths vacíos', () => {
    const bad = (patch: object) =>
      parseSources({ ...ok, sources: { a: { ...ok.sources.a, ...patch } } })
    expect(() => bad({ sha: 'abc' })).toThrow('sha')
    expect(() => bad({ repo: 'https://evil.example/x' })).toThrow('repo')
    expect(() => bad({ paths: [] })).toThrow('paths')
    expect(() => parseSources({ ...ok, since: 'x' })).toThrow('since')
  })
})
