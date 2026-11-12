import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIMITS } from './limits.ts'
import { runSnippet, type RunReport } from './runner.ts'
import { capWasmMemory, wasmMemoryMax } from './wasm-patch.ts'

const GLUE = new URL(
  '../../../node_modules/wasmoon/dist/glue.wasm',
  import.meta.url,
)
let dir = ''
let wasm = ''

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'astra-sandbox-'))
  wasm = join(dir, 'glue.wasm')
  writeFileSync(
    wasm,
    capWasmMemory(new Uint8Array(readFileSync(GLUE)), LIMITS.memoryPages),
  )
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

async function run(code: string): Promise<{ r: RunReport; out: string[] }> {
  const out: string[] = []
  const r = await runSnippet({ code, wasm, emit: (l) => out.push(l) })
  return { r, out }
}

describe('wasm memory cap', () => {
  test('patches the declared maximum and keeps the size', () => {
    const src = new Uint8Array(readFileSync(GLUE))
    const patched = capWasmMemory(src, 2048)
    expect(patched.length).toBe(src.length)
    expect(wasmMemoryMax(src)).toBe(32768)
    expect(wasmMemoryMax(patched)).toBe(2048)
    expect(() => new WebAssembly.Module(patched)).not.toThrow()
  })
  test('rejects non-wasm input', () => {
    expect(() =>
      capWasmMemory(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 10),
    ).toThrow()
  })
})

describe('normal execution', () => {
  test('stdout, in order', async () => {
    const { r, out } = await run(`print("hola", 1, true)\nprint(("x"):rep(3))`)
    expect(r.outcome).toEqual({ status: 'ok' })
    expect(out).toEqual(['hola\t1\ttrue', 'xxx'])
    expect(r.ms).toBeGreaterThanOrEqual(0)
  })
  test('Lua 5.4 and the allowed libraries work', async () => {
    const { r, out } = await run(`
      print(_VERSION, 7 // 2, math.floor(3.7), utf8.char(233), #table.pack(1, 2, 3))
      local co = coroutine.wrap(function() coroutine.yield(1) end)
      print(co())
      print(("abc"):upper(), string.format("%5.1f", 3.14159))
    `)
    expect(r.outcome).toEqual({ status: 'ok' })
    expect(out[0]).toBe('Lua 5.4\t3\t3\té\t3')
    expect(out[1]).toBe('1')
    expect(out[2]).toBe('ABC\t  3.1')
  })
  test('runtime error reports the line', async () => {
    const { r } = await run(`local a = 1\nlocal b = nil\nprint(b.x)`)
    expect(r.outcome.status).toBe('error')
    if (r.outcome.status === 'error') {
      expect(r.outcome.line).toBe(3)
      expect(r.outcome.message).toContain('snippet:3:')
    }
  })
  test('syntax error reports the line', async () => {
    const { r } = await run(`print("a")\nlocal = 2`)
    expect(r.outcome.status).toBe('error')
    if (r.outcome.status === 'error') expect(r.outcome.line).toBe(2)
  })
  test('error() with a table value', async () => {
    const { r } = await run(`error({code = 1})`)
    expect(r.outcome.status).toBe('error')
  })
  test('state does not leak between runs', async () => {
    await run(`leak = 42; string.shout = function() end`)
    const { out } = await run(`print(leak, string.shout)`)
    expect(out).toEqual(['nil\tnil'])
  })
})

describe('escape attempts', () => {
  const absent = [
    'io',
    'os',
    'package',
    'require',
    'load',
    'loadstring',
    'loadfile',
    'dofile',
    'getfenv',
    'setfenv',
    'module',
    'js',
    'window',
    'self',
    'globalThis',
    'fetch',
    'process',
  ]
  test('dangerous globals are nil', async () => {
    const { r, out } = await run(
      `local t = {}\n${absent.map((n) => `t[#t+1] = tostring(${n})`).join('\n')}\nprint(table.concat(t, ","))`,
    )
    expect(r.outcome).toEqual({ status: 'ok' })
    expect(out[0]).toBe(absent.map(() => 'nil').join(','))
  })
  test('debug only exposes traceback', async () => {
    const { out } = await run(
      `local k = {} for n in pairs(debug) do k[#k+1] = n end print(table.concat(k, ","))`,
    )
    expect(out).toEqual(['traceback'])
  })
  test('_G is the sandbox env, not the real globals', async () => {
    const { out } = await run(`
      print(_G._G == _G, rawget(_G, "io"), rawget(_G, "__emit"), rawget(_G, "__code"))
    `)
    expect(out).toEqual(['true\tnil\tnil\tnil'])
  })
  test('the bootstrap handles are gone', async () => {
    const { out } = await run(
      `print(__emit, __code, __maxOut, __maxStr, __maxErr)`,
    )
    expect(out).toEqual(['nil\tnil\tnil\tnil\tnil'])
  })
  test('string.dump is gone, also through the string metatable', async () => {
    const { out } = await run(`
      print(string.dump, ("x").dump, getmetatable("").__index.dump)
    `)
    expect(out).toEqual(['nil\tnil\tnil'])
  })
  test('cannot reach the real globals through the string metatable', async () => {
    const { out } = await run(`
      local s = getmetatable("").__index
      print(s._G, s.io, s.os, rawget(s, "load"))
    `)
    expect(out).toEqual(['nil\tnil\tnil\tnil'])
  })
  test('bytecode is rejected (text-only loader)', async () => {
    const { r } = await run('\x1bLua\x54\x00')
    expect(r.outcome.status).toBe('error')
  })
  test('debug has no getinfo, sethook, getupvalue or registry access', async () => {
    const { out } = await run(`
      print(type(debug.getinfo), type(debug.sethook), type(debug.getupvalue),
        type(debug.setupvalue), type(debug.getregistry), type(debug.getmetatable))
    `)
    expect(out).toEqual(['nil\tnil\tnil\tnil\tnil\tnil'])
  })
  test('collectgarbage only reports', async () => {
    const { out } = await run(
      `print(type(collectgarbage("count")), collectgarbage("stop"), collectgarbage("setpause", 1))`,
    )
    expect(out).toEqual(['number\t0\t0'])
  })
  test('edits to the string metatable do not outlive the run', async () => {
    await run(`getmetatable("").__index.len = function() return 99 end`)
    const { out } = await run(`print(("abc"):len())`)
    expect(out).toEqual(['3'])
  })
  test('no JS names are reachable from Lua', async () => {
    const { out } = await run(`
      local found = {}
      for _, name in ipairs({"js", "Module", "emit", "wasmoon", "lua"}) do
        found[#found + 1] = tostring(_G[name])
      end
      print(table.concat(found, ","))
    `)
    expect(out).toEqual(['nil,nil,nil,nil,nil'])
  })
})

describe('limits', () => {
  test('infinite loop stops on the instruction limit or the time limit', async () => {
    const t0 = performance.now()
    const { r } = await run(`while true do end`)
    expect(r.outcome.status).toBe('limit')
    if (r.outcome.status === 'limit')
      expect(['time', 'instructions']).toContain(r.outcome.reason)
    expect(performance.now() - t0).toBeLessThan(LIMITS.timeoutMs + 2000)
  }, 15_000)
  test('a loop inside pcall cannot swallow the limit forever', async () => {
    const t0 = performance.now()
    const { r } = await run(
      `while true do pcall(function() while true do end end) end`,
    )
    // El límite se vuelve a disparar en cada hook; en el navegador, además, el cliente mata el
    // worker. Acá basta con que la VM no se cuelgue.
    expect(['limit', 'error']).toContain(r.outcome.status)
    expect(performance.now() - t0).toBeLessThan(LIMITS.timeoutMs + 4000)
  }, 15_000)
  test('a loop inside a coroutine is also limited', async () => {
    const { r } = await run(
      `local co = coroutine.wrap(function() while true do end end) co()`,
    )
    expect(r.outcome.status).toBe('limit')
  }, 15_000)
  test('infinite recursion is a normal error (stack overflow)', async () => {
    const { r } = await run(`local function f() return 1 + f() end f()`)
    expect(r.outcome.status).toBe('error')
    if (r.outcome.status === 'error')
      expect(r.outcome.message).toMatch(/stack overflow/)
  }, 15_000)
  test('string.rep cannot ask for gigabytes', async () => {
    const { r } = await run(`local s = ("x"):rep(2^31)`)
    expect(r.outcome).toEqual({ status: 'limit', reason: 'memory' })
  })
  test('string doubling hits the hard memory cap', async () => {
    const { r } = await run(
      `local s = "x" for i = 1, 40 do s = s .. s end print(#s)`,
    )
    expect(r.outcome).toEqual({ status: 'limit', reason: 'memory' })
  }, 30_000)
  test('a table that grows forever hits a cap', async () => {
    const { r } = await run(
      `local t = {} local i = 0 while true do i = i + 1 t[i] = {i} end`,
    )
    expect(r.outcome.status).toBe('limit')
  }, 30_000)
  test('output is capped', async () => {
    const { r, out } = await run(`while true do print(("y"):rep(1000)) end`)
    expect(r.outcome).toEqual({ status: 'limit', reason: 'output' })
    const bytes = out.reduce((n, l) => n + l.length + 1, 0)
    expect(bytes).toBeLessThanOrEqual(LIMITS.maxOutputBytes)
  }, 15_000)
  test('oversized code is refused', async () => {
    const { r } = await run(`-- ${'x'.repeat(LIMITS.maxCodeBytes)}`)
    expect(r.outcome.status).toBe('limit')
  })
})
