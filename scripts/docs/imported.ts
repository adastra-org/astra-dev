// Docs importados (fivem-docs) y traducciones ES: se suman a `content/docs` en el build. El
// importador (`bun run import`) ya los dejó con el frontmatter de Astra en `content/generated/docs`,
// así que pasan por la misma validación y el mismo render que un doc escrito a mano.
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocOrigin, DocTranslationMeta } from '../../src/lib/docs/types.ts'
import {
  type DocTranslation,
  docSource,
  readDocTranslations,
} from '../translate/store.ts'
import type { LoadedDoc, SourceFile } from './loader.ts'

export const IMPORTED_DIR = 'content/generated/docs'
const ORIGIN_SITE = 'https://docs.fivem.net'

export interface Imported {
  files: SourceFile[]
  origins: Map<string, DocOrigin>
}

interface IndexEntry {
  slug: string
  url: string
  upstream: { source: string; path: string }
}

/** Docs importados y su procedencia. `null` si no se corrió `bun run import`. */
export async function readImportedDocs(root: string): Promise<Imported | null> {
  const dir = join(root, IMPORTED_DIR)
  if (!existsSync(join(dir, 'index.json'))) return null

  const names = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()
  const files = await Promise.all(
    names.map(async (f) => ({
      path: `${IMPORTED_DIR}/${f}`,
      raw: await readFile(join(dir, f), 'utf8'),
    })),
  )

  const index = JSON.parse(
    await readFile(join(dir, 'index.json'), 'utf8'),
  ) as IndexEntry[]
  const manifest = JSON.parse(
    await readFile(join(root, 'content/generated/manifest.json'), 'utf8'),
  ) as { sources: Record<string, { repo: string; sha: string }> }

  const origins = new Map<string, DocOrigin>()
  for (const e of index) {
    const src = manifest.sources[e.upstream.source]
    origins.set(e.slug, {
      name: e.upstream.source,
      url: `${ORIGIN_SITE}${e.url}`,
      repoUrl: src ? `${src.repo}/blob/${src.sha}/${e.upstream.path}` : '',
    })
  }
  return { files, origins }
}

export interface Extras {
  /** Traducciones ES por slug de doc. */
  translations: Map<string, DocTranslation>
  warnings: string[]
}

/**
 * Pega a cada doc su procedencia y su traducción ES. Una traducción de un doc que ya no existe
 * solo avisa: la fuente puede haber cambiado de slug en un `import:update`.
 */
export async function attachExtras(
  root: string,
  docs: LoadedDoc[],
  origins: ReadonlyMap<string, DocOrigin>,
): Promise<Extras> {
  const translations = await readDocTranslations(root)
  const warnings: string[] = []
  const slugs = new Set(docs.map((d) => d.meta.slug))
  for (const d of docs) {
    const origin = origins.get(d.meta.slug)
    if (origin) d.meta.origin = origin
    const t = translations.get(d.meta.slug)
    if (t) {
      d.meta.translations = { es: translationMeta(t) }
      const current = docSource({
        title: d.meta.title,
        summary: d.meta.summary,
        body: d.body,
      })
      if (current !== t.source)
        warnings.push(
          `${d.meta.slug}: la traducción ES es de una versión anterior del original (source ${t.source}, hoy ${current})`,
        )
    }
  }
  for (const slug of translations.keys())
    if (!slugs.has(slug))
      warnings.push(`traducción de un doc que no existe: ${slug}`)
  return { translations, warnings }
}

export const translationMeta = (t: DocTranslation): DocTranslationMeta => ({
  title: t.title,
  summary: t.summary,
  translated: t.translated,
})
