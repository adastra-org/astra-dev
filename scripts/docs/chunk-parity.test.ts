// The server cites `/docs/<slug>#<anchor>`. Anchors come from server/src/docs/chunk.ts, headings
// ids on the page from scripts/docs/markdown.ts. This test keeps both algorithms in lockstep.
import { describe, expect, test } from 'bun:test'
import { chunkDoc } from '../../server/src/docs/chunk.ts'
import { createHighlight } from './highlight.ts'
import { loadDocs, readSources } from './loader.ts'
import { renderMarkdown } from './markdown.ts'

const hl = await createHighlight()

const pageIds = (body: string) =>
  renderMarkdown('x.md', body, hl)
    .toc.map((t) => t.id)
    .sort()

const chunkAnchors = (body: string) =>
  chunkDoc({ slug: 'x', title: 'T', summary: 'S', body })
    .map((c) => c.anchor)
    .filter((a): a is string => a !== null)
    .sort()

describe('server chunk anchors match the rendered heading ids', () => {
  test('every real doc', async () => {
    const { docs } = loadDocs(await readSources(process.cwd()))
    for (const d of docs) {
      const ids = pageIds(d.body)
      const anchors = new Set(chunkAnchors(d.body))
      // Each toc id (h2/h3) is a chunk anchor unless that section had no content.
      for (const a of anchors) expect(ids).toContain(a)
      for (const id of ids) {
        if (!anchors.has(id)) {
          // Allowed only for headings whose section body is empty.
          expect(d.body).toMatch(new RegExp(`#{2,3} .*\\n+(#{2,3} |$)`))
        }
      }
    }
  })

  test('duplicates, accents, h4 and code fences', () => {
    const body = [
      'Intro.',
      '## Ejemplo mínimo',
      'a',
      '## Detalle',
      'b',
      '### Detalle',
      'c',
      '#### Detalle',
      'd',
      '```bash',
      '# not a heading',
      '```',
      '## Detalle',
      'e',
    ].join('\n\n')
    expect(chunkAnchors(body)).toEqual(
      pageIds(body).filter((id) => id !== 'detalle-3'),
    )
    // The h4 consumed `detalle-3`, so the last ## is `detalle-4` in both.
    expect(pageIds(body)).toContain('detalle-4')
    expect(chunkAnchors(body)).toContain('detalle-4')
  })
})
