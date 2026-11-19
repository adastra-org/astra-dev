import { describe, expect, test } from 'bun:test'
import {
  definedKeys,
  DevArgsError,
  localServices,
  parseArgs,
  serverEnv,
} from './plan.ts'

describe('parseArgs', () => {
  test('defaults: Vite + server, sin IA local', () => {
    expect(parseArgs([])).toEqual({
      local: false,
      think: false,
      fake: false,
      server: true,
      help: false,
      viteArgs: [],
    })
  })

  test('--local, --fake y --no-server', () => {
    expect(parseArgs(['--local']).local).toBe(true)
    expect(parseArgs(['--fake']).fake).toBe(true)
    expect(parseArgs(['--no-server']).server).toBe(false)
  })

  test('lo desconocido va a Vite, en orden', () => {
    expect(parseArgs(['--local', '--port', '5174', '--host']).viteArgs).toEqual(
      ['--port', '5174', '--host'],
    )
  })

  test('combinaciones inválidas', () => {
    expect(() => parseArgs(['--local', '--fake'])).toThrow(DevArgsError)
    expect(() => parseArgs(['--local', '--no-server'])).toThrow(DevArgsError)
    expect(() => parseArgs(['--think'])).toThrow(DevArgsError)
  })
})

describe('serverEnv', () => {
  test('viewer owner y registro de uso por defecto, sin pisar lo del usuario', () => {
    expect(serverEnv({ local: false, fake: false }, {}, new Set())).toEqual({
      ASTRA_DEV_VIEWER: 'owner',
      USAGE_DB_PATH: 'data/usage.sqlite',
    })
    expect(
      serverEnv(
        { local: false, fake: false },
        { ASTRA_DEV_VIEWER: 'public' },
        new Set(),
      ),
    ).toEqual({ USAGE_DB_PATH: 'data/usage.sqlite' })
    expect(
      serverEnv(
        { local: false, fake: false },
        {},
        new Set(['ASTRA_DEV_VIEWER', 'USAGE_DB_PATH']),
      ),
    ).toEqual({})
  })

  test('--local apunta el server a los puertos de los servicios', () => {
    const env = serverEnv({ local: true, fake: false }, {}, new Set())
    expect(env).toMatchObject({
      LLM_PROVIDER: 'local',
      LLM_BASE_URL: 'http://127.0.0.1:8080/v1',
      LLM_MODEL: 'lfm',
      DECISION_URL: 'http://127.0.0.1:8081',
      LLM_TIMEOUT_MS: '120000',
    })
  })

  test('--local manda sobre el LLM_PROVIDER del .env; el timeout del usuario se respeta', () => {
    const env = serverEnv(
      { local: true, fake: false },
      {},
      new Set(['LLM_PROVIDER', 'LLM_TIMEOUT_MS']),
    )
    expect(env.LLM_PROVIDER).toBe('local')
    expect(env.LLM_TIMEOUT_MS).toBeUndefined()
  })

  test('--fake', () => {
    expect(
      serverEnv({ local: false, fake: true }, {}, new Set()).LLM_PROVIDER,
    ).toBe('fake')
  })
})

test('los puertos de los servicios son loopback-friendly y distintos', () => {
  const ports = localServices().map((s) => s.port)
  expect(new Set(ports).size).toBe(ports.length)
  expect(ports).toEqual([8891, 8080, 8081])
})

test('definedKeys ignora comentarios y valores vacíos', () => {
  const text = [
    '# LLM_PROVIDER=deepseek',
    'LLM_PROVIDER=local',
    'DEEPSEEK_API_KEY=',
    '  ASTRA_DEV_VIEWER=staff',
  ].join('\n')
  expect(definedKeys(text)).toEqual(['LLM_PROVIDER', 'ASTRA_DEV_VIEWER'])
})

test('--think deja pensar al LLM; por defecto lo corta', () => {
  const llmArgs = (think: boolean) =>
    localServices(think).find((s) => s.name === 'llm')!.args
  expect(llmArgs(false)).toContain('--reasoning-budget')
  expect(llmArgs(true)).not.toContain('--reasoning-budget')
  expect(parseArgs(['--local', '--think']).think).toBe(true)
})
