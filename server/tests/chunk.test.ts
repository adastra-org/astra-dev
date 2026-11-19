import { describe, expect, test } from 'bun:test'
import { chunkDoc, slugifyHeading, toExcerpt } from '../src/docs/chunk.ts'

const doc = (body: string, over: Partial<{ summary: string }> = {}) => ({
  slug: 'x',
  title: 'Doc X',
  summary: over.summary ?? 'Resumen del doc.',
  body,
})

describe('chunkDoc', () => {
  test('intro carries the summary; each ## and ### starts a chunk', () => {
    const c = chunkDoc(
      doc('Intro text.\n\n## Uno\n\nA.\n\n### Sub\n\nB.\n\n## Dos\n\nC.'),
    )
    expect(c.map((x) => [x.anchor, x.heading])).toEqual([
      [null, null],
      ['uno', 'Uno'],
      ['sub', 'Uno > Sub'],
      ['dos', 'Dos'],
    ])
    expect(c[0]!.text).toStartWith('Resumen del doc.')
    expect(c[0]!.text).toContain('Intro text.')
    expect(c[2]!.text).toBe('B.')
  })

  test('anchors fold accents and dedupe like the docs engine', () => {
    expect(slugifyHeading('Ejemplo mínimo')).toBe('ejemplo-minimo')
    const c = chunkDoc(doc('## Detalle\n\nA\n\n## Detalle\n\nB'))
    expect(c.map((x) => x.anchor)).toEqual([null, 'detalle', 'detalle-2'])
  })

  test('a # inside a code fence is not a heading', () => {
    const c = chunkDoc(
      doc('## Uno\n\n```bash\n# comment\n## not a heading\n```'),
    )
    expect(c).toHaveLength(2)
    expect(c[1]!.text).toContain('## not a heading')
  })

  test('h4 stays in its parent chunk but still consumes an id', () => {
    const c = chunkDoc(doc('## A\n\n#### Deep\n\nx\n\n## Deep\n\ny'))
    expect(c.map((x) => x.anchor)).toEqual([null, 'a', 'deep-2'])
    expect(c[1]!.text).toContain('Deep')
  })

  test('long sections split between blocks with unique ids', () => {
    const para = 'palabra '.repeat(60).trim()
    const body = `## Largo\n\n${[para, para, para, para].join('\n\n')}`
    const c = chunkDoc(doc(body), { maxChars: 600 })
    const long = c.filter((x) => x.anchor === 'largo')
    expect(long.length).toBeGreaterThan(1)
    expect(long.every((x) => x.text.length <= 600)).toBe(true)
    expect(new Set(c.map((x) => x.id)).size).toBe(c.length)
    expect(long[1]!.id).toBe('x#largo:2')
  })

  test('a block bigger than the cap is cut at line boundaries', () => {
    const code = `\`\`\`lua\n${Array.from({ length: 80 }, (_, i) => `local v${i} = ${i}`).join('\n')}\n\`\`\``
    const c = chunkDoc(doc(`## Code\n\n${code}`), { maxChars: 400 })
    expect(c.filter((x) => x.anchor === 'code').length).toBeGreaterThan(2)
    expect(c.every((x) => x.text.length <= 400)).toBe(true)
  })

  test('empty sections produce no chunk', () => {
    const c = chunkDoc(doc('## Vacío\n\n## Lleno\n\nHola'))
    expect(c.map((x) => x.anchor)).toEqual([null, 'lleno'])
  })

  test('excerpt is plain text, whitespace collapsed and capped', () => {
    const e = toExcerpt(
      '## T\n\n**negrita** y `code` [link](/x)\n\n' + 'a '.repeat(300),
      80,
    )
    expect(e.length).toBeLessThanOrEqual(80)
    expect(e).not.toContain('**')
    expect(e).toContain('negrita y code link')
    expect(e.endsWith('…')).toBe(true)
  })
})
