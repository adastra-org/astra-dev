// Acceso a los docs generados en build (módulos virtuales de scripts/docs/plugin.ts).
import { docs, loaders } from 'virtual:astra-docs'
import type { DocContent, DocMeta } from './docs/types'

export { docs }

/** Repo público: enlaces a la fuente y a los commits desde el historial. */
export const REPO_URL = 'https://github.com/adastra-org/astra-dev'

export const docBySlug = (slug: string): DocMeta | undefined =>
  docs.find((d) => d.slug === slug)

/** Contenido renderizado de un doc (un chunk por documento). */
export async function loadDocContent(slug: string): Promise<DocContent> {
  const load = loaders[slug]
  if (!load) throw new Error(`doc inexistente: ${slug}`)
  return (await load()).default
}
