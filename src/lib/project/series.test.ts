import { describe, expect, test } from 'bun:test'
import {
  bucketDays,
  bucketSizeFor,
  formatDay,
  formatRange,
  labelIndexes,
  niceTicks,
} from './series'

const d = (date: string, opened: number, closed: number, commits: number) => ({
  date,
  opened,
  closed,
  commits,
  open: 0,
})

describe('bucketDays', () => {
  const daily = Array.from({ length: 10 }, (_, i) =>
    d(`2026-11-${String(i + 1).padStart(2, '0')}`, 1, i % 2, 2),
  )

  test('tamaño 1 deja los días tal cual', () => {
    expect(bucketDays(daily, 1)).toHaveLength(10)
  })

  test('grupos de 7 contando desde el final: el más nuevo queda completo', () => {
    const b = bucketDays(daily, 7)
    expect(b.map((x) => [x.start, x.end])).toEqual([
      ['2026-11-01', '2026-11-03'],
      ['2026-11-04', '2026-11-10'],
    ])
    expect(b[1]).toMatchObject({ opened: 7, commits: 14 })
  })

  test('la suma se conserva', () => {
    const b = bucketDays(daily, 7)
    expect(b.reduce((n, x) => n + x.commits, 0)).toBe(20)
  })

  test('hasta 30 días, por día; más, por semana', () => {
    expect(bucketSizeFor(14)).toBe(1)
    expect(bucketSizeFor(30)).toBe(1)
    expect(bucketSizeFor(90)).toBe(7)
  })
})

describe('niceTicks', () => {
  test('números redondos que cubren el máximo', () => {
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8])
    expect(niceTicks(1)).toEqual([0, 0.5, 1])
    expect(niceTicks(13238)[0]).toBe(0)
    expect(niceTicks(13238).at(-1)!).toBeGreaterThanOrEqual(13238)
  })
  test('sin datos', () => {
    expect(niceTicks(0)).toEqual([0, 1])
  })
})

describe('formatos y rótulos', () => {
  test('fechas en español, UTC', () => {
    expect(formatDay('2026-11-12')).toMatch(/12/)
    expect(formatRange('2026-11-12', '2026-11-12')).toBe(
      formatDay('2026-11-12'),
    )
    expect(formatRange('2026-11-05', '2026-11-12')).toContain('–')
  })

  test('labelIndexes incluye primero y último y no se amontona', () => {
    expect(labelIndexes(5, 400)).toEqual([0, 1, 2, 3, 4])
    const idx = labelIndexes(30, 300)
    expect(idx[0]).toBe(0)
    expect(idx.at(-1)).toBe(29)
    expect(idx.length).toBeLessThanOrEqual(6)
    expect(labelIndexes(0, 300)).toEqual([])
  })
})
