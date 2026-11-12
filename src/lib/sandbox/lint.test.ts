import { describe, expect, test } from 'bun:test'
import * as stylua from '@johnnymorganz/stylua'
import { formatLua, type Stylua } from './format.ts'
import { blankAttribs, lintLua } from './lint.ts'

const messages = (code: string) =>
  lintLua(code).map((d) => `${d.line}: ${d.severity}: ${d.message}`)

describe('lint', () => {
  test('clean code has no diagnostics', () => {
    expect(
      lintLua(`local function add(a, b) return a + b end\nprint(add(1, 2))\n`),
    ).toEqual([])
  })
  test('syntax error with line and column', () => {
    const [d] = lintLua(`print("a")\nlocal = 2\n`)
    expect(d?.severity).toBe('error')
    expect(d?.line).toBe(2)
    expect(d?.column).toBeGreaterThan(0)
  })
  test('unused local', () => {
    expect(messages(`local x = 1\nlocal y = 2\nprint(y)`)).toEqual([
      '1: warning: variable local «x» sin usar',
    ])
  })
  test('underscore names, parameters and loop variables are not reported', () => {
    expect(
      messages(
        `local _ignored = 1\nlocal function f(a, b) return a end\nfor i = 1, 3 do end\nfor k, v in pairs({}) do end\nprint(f)`,
      ),
    ).toEqual([])
  })
  test('a local only assigned is unused', () => {
    expect(messages(`local x = 1\nx = 2`)).toEqual([
      '1: warning: variable local «x» sin usar',
    ])
  })
  test('uses inside closures and repeat conditions count', () => {
    expect(
      messages(
        `local n = 0\nlocal function inc() n = n + 1 end\ninc()\nrepeat local done = true until done`,
      ),
    ).toEqual([])
  })
  test('table field names are not reads', () => {
    expect(messages(`local os = 1\nlocal t = { os = 2 }\nprint(t)`)).toEqual([
      '1: warning: variable local «os» sin usar',
    ])
  })
  test('warns about globals the sandbox does not have', () => {
    expect(
      messages(`os.exit()\nlocal f = require("x")\nprint(f)\nio.write("a")`),
    ).toEqual([
      '1: warning: «os» no está disponible en el sandbox',
      '2: warning: «require» no está disponible en el sandbox',
      '4: warning: «io» no está disponible en el sandbox',
    ])
  })
  test('a local named like an unavailable global is fine', () => {
    expect(messages(`local io = { write = print }\nio.write("a")`)).toEqual([])
  })
  test('field access is not a global read', () => {
    expect(messages(`local t = {}\nt.os = 1\nprint(t.io, t:load())`)).toEqual(
      [],
    )
  })
  test('Lua 5.4 attribs do not break the parser', () => {
    expect(blankAttribs('local x <const> = 1').length).toBe(
      'local x <const> = 1'.length,
    )
    expect(messages(`local x <const> = 1\nprint(x)`)).toEqual([])
  })
  test('goto and integer division (5.3)', () => {
    expect(
      messages(
        `for i = 1, 3 do if i // 2 == 0 then goto continue end ::continue:: end`,
      ),
    ).toEqual([])
  })
})

describe('format (StyLua)', () => {
  const s = stylua as unknown as Stylua
  test('formats', () => {
    const r = formatLua(`local   a=1\nif a==1 then print( 'x' ) end`, s)
    expect(r).toEqual({
      ok: true,
      code: `local a = 1\nif a == 1 then\n  print("x")\nend\n`,
    })
  })
  test('is idempotent', () => {
    const once = formatLua(
      `local t={1,2,3}\nfor _,v in ipairs(t) do print(v) end`,
      s,
    )
    if (!once.ok) throw new Error('no debería fallar')
    expect(formatLua(once.code, s)).toEqual(once)
  })
  test('accepts FiveM syntax (backtick hashes, compound assignment)', () => {
    const r = formatLua('local h = `adder`\nlocal n = 1\nn += 1\n', s)
    expect(r.ok).toBe(true)
  })
  test('syntax error comes back as a diagnostic with a line', () => {
    const r = formatLua(`print("a")\nlocal = 2\n`, s)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.diagnostic.line).toBe(2)
      expect(r.diagnostic.severity).toBe('error')
    }
  })
})
