import { describe, expect, test } from 'bun:test'
import { ApiError, describeError, gql, loadEvolution } from './api'

const reply = (body: unknown, status = 200) =>
  (async () => Response.json(body, { status })) as unknown as typeof fetch

describe('gql', () => {
  test('devuelve data', async () => {
    const d = await gql<{ a: number }>(
      '{a}',
      {},
      undefined,
      reply({ data: { a: 1 } }),
    )
    expect(d.a).toBe(1)
  })

  test('el código del error de GraphQL llega como ApiError', async () => {
    const f = reply({
      data: { project: null },
      errors: [{ message: 'x', extensions: { code: 'staff_required' } }],
    })
    const e = await gql('{a}', {}, undefined, f).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).code).toBe('staff_required')
  })

  test('rate_limited trae retryAfter', async () => {
    const f = reply({
      errors: [
        { message: 'x', extensions: { code: 'rate_limited', retryAfter: 12 } },
      ],
    })
    const e = (await gql('{a}', {}, undefined, f).catch(
      (x: unknown) => x,
    )) as ApiError
    expect(e.code).toBe('rate_limited')
    expect(e.retryAfter).toBe(12)
    expect(describeError(e).hint).toContain('12')
  })

  test('errores HTTP fuera de GraphQL y códigos desconocidos', async () => {
    const origin = reply(
      { error: { code: 'forbidden_origin', message: 'no' } },
      403,
    )
    expect(
      (
        (await gql('{a}', {}, undefined, origin).catch(
          (x: unknown) => x,
        )) as ApiError
      ).code,
    ).toBe('internal')
    const unknown = reply({ errors: [{ extensions: { code: 'raro' } }] })
    expect(
      (
        (await gql('{a}', {}, undefined, unknown).catch(
          (x: unknown) => x,
        )) as ApiError
      ).code,
    ).toBe('internal')
  })

  test('sin red', async () => {
    const f = (async () => {
      throw new TypeError('down')
    }) as unknown as typeof fetch
    expect(
      (
        (await gql('{a}', {}, undefined, f).catch(
          (x: unknown) => x,
        )) as ApiError
      ).code,
    ).toBe('network')
  })

  test('loadEvolution manda los días como variable', async () => {
    let sent: { variables?: { days?: number } } = {}
    const f = (async (_u: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body))
      return Response.json({ data: { project: { evolution: { days: 14 } } } })
    }) as unknown as typeof fetch
    const ev = await loadEvolution(14, undefined, f)
    expect(sent.variables?.days).toBe(14)
    expect(ev.days).toBe(14)
  })
})

describe('describeError', () => {
  test('mensajes para el usuario', () => {
    expect(describeError(new ApiError('unauthenticated', '')).title).toBe(
      'Inicia sesión',
    )
    expect(describeError(new ApiError('staff_required', '')).title).toBe(
      'Solo para el staff',
    )
    expect(describeError(new Error('x')).title).toBe('Algo falló')
  })
})
