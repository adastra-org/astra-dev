import { describe, expect, test } from 'bun:test'
import { canAccess } from '@/lib/palette/registry'
import type { PaletteContext } from '@/lib/palette/types'
import { aiUsageProvider } from './palette'
import {
  formatDuration,
  formatPercent,
  formatTokens,
  formatUsd,
} from './format'

describe('formatDuration', () => {
  test('ms, seconds, minutes and hours', () => {
    expect(formatDuration(340)).toBe('340 ms')
    expect(formatDuration(6964, 'en')).toBe('7 s')
    expect(formatDuration(6900, 'en')).toBe('6.9 s')
    expect(formatDuration(6900, 'es')).toBe('6,9 s')
    expect(formatDuration(12 * 60_000)).toBe('12 min')
    expect(formatDuration(72 * 60_000)).toBe('1 h 12 min')
    expect(formatDuration(3 * 3_600_000)).toBe('3 h')
  })
  test('no data is a dash, not NaN', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})

describe('formatTokens, formatUsd, formatPercent', () => {
  test('compact above 10k', () => {
    expect(formatTokens(950, 'en')).toBe('950')
    expect(formatTokens(9999, 'en')).toBe('9,999')
    expect(formatTokens(12_300, 'en')).toBe('12.3 k')
    expect(formatTokens(1_250_000, 'en')).toBe('1.3 M')
  })
  test('cost keeps four decimals under a cent', () => {
    expect(formatUsd(0.0006, 'en')).toBe('$0.0006')
    expect(formatUsd(1.5, 'en')).toBe('$1.50')
    expect(formatUsd(0, 'en')).toBe('$0.00')
  })
  test('percent', () => {
    expect(formatPercent(0.25, 'en')).toBe('25%')
  })
})

describe('palette provider', () => {
  const ctx = { lang: 'es' } as PaletteContext
  const sig = new AbortController().signal

  test('only the owner sees it', () => {
    expect(aiUsageProvider.permission).toBe('owner')
    expect(canAccess('owner', aiUsageProvider.permission)).toBe(true)
    for (const level of ['public', 'subscriber', 'staff'] as const)
      expect(canAccess(level, aiUsageProvider.permission)).toBe(false)
  })

  test('shows without a query and for related words, hides for unrelated ones', async () => {
    const empty = await aiUsageProvider.search('', ctx, sig)
    expect(empty.map((i) => i.to)).toEqual(['/dashboard'])
    expect(await aiUsageProvider.search('tokens', ctx, sig)).toHaveLength(1)
    expect(await aiUsageProvider.search('uso de ia', ctx, sig)).toHaveLength(1)
    expect(await aiUsageProvider.search('rollback', ctx, sig)).toHaveLength(0)
  })
})
