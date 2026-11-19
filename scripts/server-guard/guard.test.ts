import { expect, test } from 'bun:test'
import { check } from './guard'

test('lua: blocked sandbox APIs are denied', () => {
  expect(check('resources/a/server.lua', "os.execute('ls')")?.action).toBe(
    'deny',
  )
  expect(check('a/b.LUA', 'local f = io.tmpfile()')?.action).toBe('deny')
  expect(
    check('a.lua', "for f in ipairs(io.readdir('@a/x')) do end")?.action,
  ).toBe('deny')
})

test('lua: clean code and other file types pass', () => {
  expect(check('a.lua', 'print(os.time())')).toBeUndefined()
  expect(check('src/lib/sandbox/runner.ts', 'os.execute')).toBeUndefined()
  expect(check('docs/x.md', 'sv_useAccurateSends')).toBeUndefined()
})

test('cfg: removed Enhanced settings deny, permissions ask', () => {
  expect(check('server.cfg', 'set sv_useAccurateSends true')?.action).toBe(
    'deny',
  )
  expect(
    check('server.cfg', 'add_filesystem_permission a write b')?.action,
  ).toBe('ask')
  expect(check('server.cfg', 'set sv_syncTickRate 60')).toBeUndefined()
})
