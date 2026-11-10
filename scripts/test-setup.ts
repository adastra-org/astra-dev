// Precarga de `bun test`: los módulos virtuales de Vite no existen fuera del build, así que
// `virtual:astra-docs` se sirve con los docs reales de content/docs (frontmatter ya validado).
import { mock } from 'bun:test'
import { loadDocs, readSources } from './docs/loader.ts'

const { docs } = loadDocs(await readSources(process.cwd()))

mock.module('virtual:astra-docs', () => ({
  docs: docs.map((d) => d.meta),
  loaders: Object.fromEntries(
    docs.map((d) => [
      d.meta.slug,
      () => Promise.reject(new Error('sin contenido renderizado en tests')),
    ]),
  ),
}))
