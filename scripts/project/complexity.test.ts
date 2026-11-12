import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  churnUpTo,
  classify,
  countLines,
  mergeSeries,
  measure,
  samplePoints,
  weekKey,
} from './complexity.ts'

const enc = (s: string) => new TextEncoder().encode(s)

describe('classify', () => {
  test('código, docs y lo que no se mide', () => {
    expect(classify('src/a.tsx')).toBe('code')
    expect(classify('server/src/x.ts')).toBe('code')
    expect(classify('docs/README.md')).toBe('doc')
    expect(classify('bun.lock')).toBeNull()
    expect(classify('src/styles/tokens.css')).toBeNull()
    expect(classify('design/tokens.json')).toBeNull()
    expect(classify('content/generated/natives/a.json')).toBeNull()
    expect(classify('public/favicon.svg')).toBeNull()
    expect(classify('node_modules/x/index.js')).toBeNull()
    expect(classify('img.png')).toBeNull()
  })
})

describe('countLines', () => {
  test('cuenta la última línea sin salto y trata lo binario como 0', () => {
    expect(countLines(enc(''))).toBe(0)
    expect(countLines(enc('a\nb\n'))).toBe(2)
    expect(countLines(enc('a\nb'))).toBe(2)
    expect(countLines(new Uint8Array([97, 0, 98, 10]))).toBe(0)
  })
})

describe('series', () => {
  test('weekKey sigue el año ISO', () => {
    expect(weekKey('2026-11-12')).toBe('2026-W46')
    expect(weekKey('2026-01-01')).toBe('2026-W01')
    expect(weekKey('2027-01-01')).toBe('2026-W53')
  })

  test('samplePoints toma el último commit de cada semana', () => {
    const t = (d: string) => Date.parse(`${d}T12:00:00Z`)
    const out = samplePoints(
      [
        { sha: 'c', ms: t('2026-11-10') },
        { sha: 'a', ms: t('2026-11-02') },
        { sha: 'b', ms: t('2026-11-04') },
        { sha: 'd', ms: t('2026-11-12') },
      ],
      'weekly',
    )
    expect(out.map((c) => c.sha)).toEqual(['b', 'd'])
    expect(
      samplePoints(
        [
          { sha: 'a', ms: t('2026-11-02') },
          { sha: 'b', ms: t('2026-11-02') + 1000 },
        ],
        'daily',
      ).map((c) => c.sha),
    ).toEqual(['b'])
  })

  test('churn: ventana de 7 días hasta el final del día', () => {
    const t = (d: string) => Date.parse(`${d}T12:00:00Z`)
    const e = [
      { ms: t('2026-11-05'), lines: 10 },
      { ms: t('2026-11-06'), lines: 5 },
      { ms: t('2026-11-12'), lines: 7 },
    ]
    expect(churnUpTo(e, '2026-11-12')).toBe(12) // 6 al 12
    expect(churnUpTo(e, '2026-11-11')).toBe(15) // 5 al 11
  })

  test('mergeSeries reemplaza la misma fecha y ordena', () => {
    const p = (date: string, lines: number) => ({
      date,
      sha: 'x',
      files: 1,
      lines,
      docLines: 0,
      churn: 0,
    })
    expect(
      mergeSeries(
        [p('2026-11-02', 1), p('2026-11-01', 1)],
        [p('2026-11-02', 9)],
      ).map((x) => [x.date, x.lines]),
    ).toEqual([
      ['2026-11-01', 1],
      ['2026-11-02', 9],
    ])
  })
})

describe('measure en un repo real de git', () => {
  const run = (cwd: string, args: string[], env: Record<string, string> = {}) =>
    execFileSync('git', args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'pipe',
    })

  test('cuenta archivos, líneas y churn desde los objetos de git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'astra-complexity-'))
    run(dir, ['init', '-q', '-b', 'main'])
    run(dir, ['config', 'user.email', 't@example.com'])
    run(dir, ['config', 'user.name', 't'])
    run(dir, ['config', 'commit.gpgsign', 'false'])
    const commit = (date: string, msg: string) =>
      run(dir, ['commit', '-q', '-m', msg], {
        GIT_AUTHOR_DATE: `${date}T12:00:00Z`,
        GIT_COMMITTER_DATE: `${date}T12:00:00Z`,
      })
    mkdirSync(join(dir, 'src'))
    writeFileSync(join(dir, 'src/a.ts'), 'a\nb\nc\n')
    writeFileSync(join(dir, 'README.md'), '# t\n')
    writeFileSync(join(dir, 'bun.lock'), 'x\n'.repeat(100))
    run(dir, ['add', '.'])
    commit('2026-11-02', 'one')
    writeFileSync(join(dir, 'src/a.ts'), 'a\nb\nc\nd\ne\n')
    writeFileSync(join(dir, 'src/b.ts'), 'x\n')
    run(dir, ['add', '.'])
    commit('2026-11-10', 'two')

    const head = measure({
      cwd: dir,
      ref: 'HEAD',
      backfill: false,
      step: 'weekly',
    })
    expect(head).toHaveLength(1)
    expect(head[0]).toMatchObject({
      date: '2026-11-10',
      files: 3,
      lines: 6,
      docLines: 1,
    })
    // Último commit: +2 en a.ts y +1 en b.ts. El lock no cuenta. El primero queda fuera de los 7 días.
    expect(head[0]!.churn).toBe(3)

    const all = measure({
      cwd: dir,
      ref: 'HEAD',
      backfill: true,
      step: 'weekly',
    })
    expect(all.map((p) => [p.date, p.files, p.lines])).toEqual([
      ['2026-11-02', 2, 3],
      ['2026-11-10', 3, 6],
    ])
    expect(all[0]!.churn).toBe(4) // 3 líneas de a.ts + 1 de README
  })
})
