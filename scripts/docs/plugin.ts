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
  attachExtras,
  type Extras,
  IMPORTED_DIR,
  readImportedDocs,
} from './imported.ts'
import {
  brokenDocLinks,
  CONTENT_DIR,
  type Loaded,
  loadDocs,
  readSources,
} from './loader.ts'
import { renderMarkdown } from './markdown.ts'
import { TRANSLATIONS_DIR } from '../translate/store.ts'

const INDEX = 'virtual:astra-docs'
const DOC = 'virtual:astra-doc/'
const PREFIX = '\0virtual:astra-doc'

type All = Loaded & Extras

/** Docs de `content/docs` + importados (`content/generated/docs`) + traducciones ES. */
async function loadAll(root: string): Promise<All> {
  const imported = await readImportedDocs(root)
  const loaded = loadDocs([
    ...(await readSources(root)),
    ...(imported?.files ?? []),
  ])
  const extras = await attachExtras(
    root,
    loaded.docs,
    imported?.origins ?? new Map(),
  )
  const warnings = [...loaded.warnings, ...extras.warnings]
  if (!imported)
    warnings.push(
      'no hay content/generated/docs: corre `bun run import` para publicar los docs de FiveM',
    )
  if (!imported && process.env.REQUIRE_GENERATED)
    throw new Error(warnings.at(-1))
  return { docs: loaded.docs, translations: extras.translations, warnings }
}

export function docsPlugin(): Plugin {
  let root = process.cwd()
  let loaded: Promise<All> | undefined
  let warned = false

  const load = () => (loaded ??= loadAll(root))

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

      const { docs, warnings, translations } = await load()

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

      const tr = translations.get(slug)
      const es = tr ? renderMarkdown(doc.meta.path, tr.body, highlight) : null
      const content: DocContent = {
        sections: rendered.sections,
        toc: rendered.toc,
        // Un doc importado no tiene historial propio: la fuente es el repo de origen.
        history: doc.meta.origin
          ? { available: false, entries: [] }
          : await readHistory(gitIn(root), doc.meta.path),
        ...(es ? { es: { sections: es.sections, toc: es.toc } } : {}),
      }
      return `export default ${JSON.stringify(content)}`
    },

    configureServer(server) {
      const dirs = [CONTENT_DIR, IMPORTED_DIR, `${TRANSLATIONS_DIR}/docs`].map(
        (d) => resolve(root, d),
      )
      server.watcher.add(dirs)
      const onChange = (file: string) => {
        if (!dirs.some((d) => resolve(file).startsWith(d))) return
        if (!file.endsWith('.md') && !file.endsWith('index.json')) return
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
