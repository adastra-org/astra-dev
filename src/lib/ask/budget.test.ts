// Presupuesto de contexto, velocidad de salida y totales: funciones puras sobre turnos.
import { describe, expect, test } from 'bun:test'
import {
  contextUsage,
  estimateTokens,
  fmtCount,
  lastSpeed,
  outputSpeed,
  sessionTotals,
  ttftMs,
} from './budget'
import { emptyTurn, type Turn } from './store'

/** Turno ya respondido, con uso y tiempos dados. */
const answered = (
  id: number,
  over: Partial<Turn> & { in?: number; out?: number } = {},
): Turn => {
  const { in: inputTokens = 100, out: outputTokens = 20, ...rest } = over
  return {
    ...emptyTurn(id, `pregunta ${id}`),
    status: 'done',
    text: 'respuesta',
    usage: { inputTokens, outputTokens },
    timing: { startedAt: 0, firstDeltaAt: 300, doneAt: 1300 },
    ...rest,
  }
}

describe('estimateTokens', () => {
  test('un token cada tres caracteres, hacia arriba (igual que el server)', () => {
    expect(estimateTokens(0)).toBe(0)
    expect(estimateTokens(1)).toBe(1)
    expect(estimateTokens(3)).toBe(1)
    expect(estimateTokens(4)).toBe(2)
  })
})

describe('contextUsage', () => {
  test('sin ventana o sin envío medido no hay medidor', () => {
    expect(contextUsage([answered(1)], null, '')).toBeNull()
    expect(contextUsage([answered(1)], 0, '')).toBeNull()
    expect(contextUsage([emptyTurn(1, 'hola')], 8192, '')).toBeNull()
  })

  test('el próximo envío es el último uso más el borrador estimado', () => {
    const u = contextUsage([answered(1, { in: 700, out: 100 })], 1000, 'abcdef')
    expect(u).toMatchObject({
      used: 800,
      draft: 2,
      next: 802,
      limit: 1000,
      level: 'warn',
      estimated: false,
    })
  })

  test('los niveles cambian en 80 % y en 100 % de la ventana', () => {
    const at = (used: number) =>
      contextUsage([answered(1, { in: used, out: 0 })], 1000, '')!
    expect(at(799).level).toBe('ok')
    expect(at(800).level).toBe('warn')
    expect(at(999).level).toBe('warn')
    expect(at(1000).level).toBe('full')
    expect(at(1400).ratio).toBe(1.4)
  })

  test('el uso de una respuesta de caché o de un rechazo no cuenta', () => {
    const turns = [
      answered(1, { in: 500, out: 0 }),
      answered(2, { cached: true, in: 0, out: 0 }),
      answered(3, { refused: true, in: 0, out: 0 }),
    ]
    expect(contextUsage(turns, 1000, '')!.used).toBe(500)
  })

  test('marca como estimado el uso que el server contó', () => {
    const u = contextUsage([answered(1, { usageEstimated: true })], 1000, '')
    expect(u!.estimated).toBe(true)
  })
})

describe('velocidad de salida', () => {
  test('tokens de salida sobre el tiempo entre primer y último texto', () => {
    // 50 tokens en 1000 ms de texto.
    const t = answered(1, {
      out: 50,
      timing: { startedAt: 0, firstDeltaAt: 300, doneAt: 1300 },
    })
    expect(outputSpeed(t)).toBe(50)
    expect(ttftMs(t)).toBe(300)
  })

  test('menos de 200 ms de stream no es una medida', () => {
    const t = answered(1, {
      timing: { startedAt: 0, firstDeltaAt: 300, doneAt: 450 },
    })
    expect(outputSpeed(t)).toBeNull()
  })

  test('caché, sin uso o sin tiempos: sin velocidad', () => {
    expect(outputSpeed(answered(1, { cached: true }))).toBeNull()
    expect(outputSpeed({ ...answered(1), usage: null })).toBeNull()
    expect(
      outputSpeed(
        answered(1, {
          timing: { startedAt: 0, firstDeltaAt: null, doneAt: 9 },
        }),
      ),
    ).toBeNull()
  })

  test('ttft es de envío a primer texto', () => {
    expect(
      ttftMs(
        answered(1, {
          timing: { startedAt: 100, firstDeltaAt: 350, doneAt: 900 },
        }),
      ),
    ).toBe(250)
    expect(ttftMs(answered(1, { cached: true }))).toBeNull()
  })

  test('lastSpeed toma la última respuesta con medida', () => {
    const fast = answered(1, {
      out: 100,
      timing: { startedAt: 0, firstDeltaAt: 0, doneAt: 2000 },
    })
    const cached = answered(2, { cached: true })
    expect(lastSpeed([fast, cached])).toEqual({ tps: 50, ttft: 0 })
    expect(lastSpeed([cached])).toBeNull()
  })
})

describe('memorias en el presupuesto', () => {
  test('suma solo la diferencia con las memorias del último envío', () => {
    const turns = [answered(1, { in: 500, out: 100, memoryTokens: 40 })] // usado = 600
    // Mismas memorias que en el envío: no se cuentan dos veces.
    expect(contextUsage(turns, 1000, '', 40)!.next).toBe(600)
    // Se agregaron 60 tokens de memorias desde el último envío.
    const more = contextUsage(turns, 1000, '', 100)!
    expect(more.next).toBe(660)
    expect(more.memories).toBe(100)
    // Se borraron: baja.
    expect(contextUsage(turns, 1000, '', 0)!.next).toBe(560)
    // Nunca negativo.
    const tiny = [answered(1, { in: 0, out: 1, memoryTokens: 90 })]
    expect(contextUsage(tiny, 1000, '', 0)!.next).toBe(0)
  })

  test('las memorias pueden llevar el medidor a warn', () => {
    const turns = [answered(1, { in: 700, out: 50 })] // 750 de 1000
    expect(contextUsage(turns, 1000, '', 0)!.level).toBe('ok')
    expect(contextUsage(turns, 1000, '', 60)!.level).toBe('warn')
  })

  test('sin memorias el cálculo es el de siempre', () => {
    const u = contextUsage([answered(1, { in: 500, out: 100 })], 1000, 'abc')!
    expect(u).toMatchObject({ next: 601, memories: 0 })
  })
})

describe('totales de sesión y formato', () => {
  test('suma tokens de envíos medidos, sin caché', () => {
    const totals = sessionTotals([
      answered(1, { in: 100, out: 20 }),
      answered(2, { in: 0, out: 0, cached: true }),
      emptyTurn(3, 'pendiente'),
    ])
    expect(totals).toEqual({ questions: 3, tokens: 120 })
  })

  test('separador de miles según el idioma', () => {
    expect(fmtCount(12345, 'en')).toBe('12,345')
    expect(fmtCount(12345, 'es')).toBe('12.345')
  })
})
