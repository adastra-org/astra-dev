// Plugin de Vite de los natives. Son 7.326 páginas: no van como un chunk de JS por native (ni como
// un módulo gigante en el bundle principal). El build las emite como archivos estáticos, y la app
// pide solo la que abre:
//
//   virtual:astra-natives          grupos (namespaces) y total: entra al bundle principal (~50 filas)
//   /data/natives/index.json       índice de búsqueda compacto (tuplas), se pide al buscar o listar
//   /data/natives/<slug>.json      `NativeContent` de un native (secciones ya renderizadas)
//
// En dev se sirven por middleware con el mismo código, bajo demanda. Sin `content/generated` (no se
// corrió `bun run import`) el sitio se construye sin natives y avisa; con `REQUIRE_GENERATED=1`
// (lo pone el deploy) falla, para no publicar un sitio sin natives por un import que no corrió.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'
import {
  encodeIndex,
  type NativeContent,
  type NativeIndexFile,
} from '../../src/lib/natives/types.ts'
import { createHighlight } from '../docs/highlight.ts'
import {
  GENERATED_DIR,
  OVERRIDES_DIR,
  type NativesCorpus,
  readNativesCorpus,
} from './corpus.ts'
import { TRANSLATIONS_DIR } from '../translate/store.ts'
import { hashIndex, nativeRow, renderNative, type RenderCtx } from './render.ts'

const VIRTUAL = 'virtual:astra-natives'
const PREFIX = '/data/natives/'

export interface NativesData {
  corpus: NativesCorpus
  index: NativeIndexFile
  ctx: RenderCtx
  bySlug: Map<string, number>
  render(slug: string): NativeContent | undefined
}

/** Ids de natives → slugs de los docs que los mencionan (`nativeRefs` de `docs/index.json`). */
export async function readMentions(
  root: string,
): Promise<Map<string, string[]>> {
  const file = join(root, GENERATED_DIR, 'docs', 'index.json')
  const out = new Map<string, string[]>()
  if (!existsSync(file)) return out
  const docs = JSON.parse(await readFile(file, 'utf8')) as {
    slug: string
    nativeRefs?: string[]
  }[]
  for (const d of docs)
    for (const id of d.nativeRefs ?? []) {
      const list = out.get(id)
      if (list) list.push(d.slug)
      else out.set(id, [d.slug])
    }
  for (const list of out.values()) list.sort()
  return out
}

export async function buildNativesData(
  root: string,
): Promise<NativesData | null> {
  const corpus = await readNativesCorpus(root)
  if (!corpus) return null
  const ctx: RenderCtx = {
    hashToSlug: hashIndex(corpus.natives),
    byId: new Map(corpus.natives.map((n) => [n.id, n])),
    mentions: await readMentions(root),
    manifest: corpus.manifest,
    highlight: await createHighlight(),
  }
  const bySlug = new Map(corpus.natives.map((n, i) => [n.slug, i]))
  const index = encodeIndex({
    groups: corpus.groups,
    rows: corpus.natives.map((n) =>
      nativeRow(
        n,
        corpus.groupOf.get(n.slug) ?? '',
        corpus.translations.get(n.slug),
      ),
    ),
  })
  return {
    corpus,
    index,
    ctx,
    bySlug,
    render(slug) {
      const i = bySlug.get(slug)
      const n = i === undefined ? undefined : corpus.natives[i]
      return n ? renderNative(n, corpus.translations.get(slug), ctx) : undefined
    },
  }
}

export function nativesPlugin(): Plugin {
  let root = process.cwd()
  let data: Promise<NativesData | null> | undefined
  const load = () => (data ??= buildNativesData(root))
  let warned = false

  async function need(
    warn: (m: string) => void,
    fail: (m: string) => never,
  ): Promise<NativesData | null> {
    const d = await load()
    if (!d) {
      const msg =
        'no hay content/generated/natives: corre `bun run import` para publicar los natives'
      if (process.env.REQUIRE_GENERATED) fail(msg)
      else if (!warned) {
        warned = true
        warn(msg)
      }
    } else if (!warned) {
      warned = true
      for (const w of d.corpus.warnings) warn(w)
    }
    return d
  }

  return {
    name: 'astra-natives',

    configResolved(config) {
      root = config.root
    },

    resolveId(id) {
      if (id === VIRTUAL) return `\0${VIRTUAL}`
    },

    async load(id) {
      if (id !== `\0${VIRTUAL}`) return
      const d = await need(
        (m) => this.warn(m),
        (m) => this.error(m),
      )
      const groups = d?.corpus.groups ?? []
      const total = d?.corpus.natives.length ?? 0
      return `export const groups = ${JSON.stringify(groups)}\nexport const total = ${total}\n`
    },

    async generateBundle() {
      const d = await need(
        (m) => this.warn(m),
        (m) => this.error(m),
      )
      if (!d) return
      this.emitFile({
        type: 'asset',
        fileName: `${PREFIX.slice(1)}index.json`,
        source: JSON.stringify(d.index),
      })
      for (const n of d.corpus.natives) {
        const content = d.render(n.slug)
        if (content)
          this.emitFile({
            type: 'asset',
            fileName: `${PREFIX.slice(1)}${n.slug}.json`,
            source: JSON.stringify(content),
          })
      }
    },

    configureServer(server) {
      const dirs = [OVERRIDES_DIR, TRANSLATIONS_DIR, GENERATED_DIR].map((d) =>
        resolve(root, d),
      )
      server.watcher.add(dirs)
      const onChange = (file: string) => {
        if (!dirs.some((d) => resolve(file).startsWith(d))) return
        data = undefined
        warned = false
        for (const m of server.moduleGraph.idToModuleMap.values())
          if (m.id === `\0${VIRTUAL}`) server.moduleGraph.invalidateModule(m)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('change', onChange)
      server.watcher.on('add', onChange)
      server.watcher.on('unlink', onChange)

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? ''
        if (!url.startsWith(PREFIX) || !url.endsWith('.json')) return next()
        const d = await load()
        const name = decodeURIComponent(
          url.slice(PREFIX.length, -'.json'.length),
        )
        const body =
          name === 'index'
            ? d?.index
            : /^[a-z0-9-]+$/.test(name)
              ? d?.render(name)
              : undefined
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (!body) {
          res.statusCode = 404
          res.end('{"error":"not found"}')
          return
        }
        res.end(JSON.stringify(body))
      })
    },
  }
}
