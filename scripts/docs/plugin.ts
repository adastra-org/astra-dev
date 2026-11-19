// Plugin de Vite: expone los docs como módulos virtuales.
//   virtual:astra-docs        → { docs: DocMeta[], loaders }   (solo metadatos; entra al bundle principal)
//   virtual:astra-doc/<slug>  → DocContent                     (un chunk por documento, carga bajo demanda)
// Errores de contenido (frontmatter inválido, slug duplicado) rompen el build; los `related` o
// enlaces rotos solo avisan.
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import type { DocContent } from '../../src/lib/docs/types.ts'
import { createHighlight } from './highlight.ts'
import { gitIn, readHistory } from './history.ts'
import {
  brokenDocLinks,
  CONTENT_DIR,
  type Loaded,
  loadDocs,
  readSources,
} from './loader.ts'
import { renderMarkdown } from './markdown.ts'

const INDEX = 'virtual:astra-docs'
const DOC = 'virtual:astra-doc/'
const PREFIX = '\0virtual:astra-doc'

export function docsPlugin(): Plugin {
  let root = process.cwd()
  let loaded: Promise<Loaded> | undefined
  let warned = false

  const load = () => (loaded ??= readSources(root).then(loadDocs))

  return {
    name: 'astra-docs',

    configResolved(config) {
      root = config.root
    },

    resolveId(id) {
      if (id === INDEX || id.startsWith(DOC)) return `\0${id}`
    },

    async load(id) {
      if (!id.startsWith(PREFIX)) return

      const { docs, warnings } = await load()

      if (id === `\0${INDEX}`) {
        if (!warned) {
          warned = true
          for (const w of warnings) this.warn(w)
        }
        const metas = docs.map((d) => d.meta)
        const loaders = metas
          .map(
            (m) =>
              `  ${JSON.stringify(m.slug)}: () => import(${JSON.stringify(`${DOC}${m.slug}`)}),`,
          )
          .join('\n')
        return `export const docs = ${JSON.stringify(metas)}\nexport const loaders = {\n${loaders}\n}\n`
      }

      const slug = id.slice(`\0${DOC}`.length)
      const doc = docs.find((d) => d.meta.slug === slug)
      if (!doc) throw new Error(`doc inexistente: ${slug}`)

      this.addWatchFile(join(root, doc.meta.path))
      const highlight = await createHighlight()
      const rendered = renderMarkdown(doc.meta.path, doc.body, highlight)
      const slugs = new Set(docs.map((d) => d.meta.slug))
      for (const w of brokenDocLinks(doc.meta.path, rendered.links, slugs))
        this.warn(w)

      const content: DocContent = {
        sections: rendered.sections,
        toc: rendered.toc,
        history: await readHistory(gitIn(root), doc.meta.path),
      }
      return `export default ${JSON.stringify(content)}`
    },

    configureServer(server) {
      const dir = resolve(root, CONTENT_DIR)
      server.watcher.add(dir)
      const onChange = (file: string) => {
        if (!resolve(file).startsWith(dir) || !file.endsWith('.md')) return
        loaded = undefined
        warned = false
        for (const m of server.moduleGraph.idToModuleMap.values())
          if (m.id?.startsWith(PREFIX)) server.moduleGraph.invalidateModule(m)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('change', onChange)
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)
    },
  }
}
