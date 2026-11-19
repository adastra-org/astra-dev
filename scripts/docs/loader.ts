// Carga tipada de `content/docs/**/*.md`: valida frontmatter y slugs, calcula backlinks.
import { readdir, readFile } from 'node:fs/promises'
import { join, posix, relative, sep } from 'node:path'
import type { DocMeta } from '../../src/lib/docs/types.ts'
import { computeBacklinks, relatedWarnings } from './backlinks.ts'
import {
  DocError,
  SLUG,
  splitFrontmatter,
  validateFrontmatter,
} from './frontmatter.ts'

/** Carpeta de contenido, relativa a la raíz del repo. */
export const CONTENT_DIR = 'content/docs'

export interface SourceFile {
  /** Ruta desde la raíz del repo, con `/` (ej. `content/docs/glosario.md`). */
  path: string
  raw: string
}

export interface LoadedDoc {
  meta: DocMeta
  /** Cuerpo Markdown (sin frontmatter). */
  body: string
}

export interface Loaded {
  docs: LoadedDoc[]
  warnings: string[]
}

/** Uno o más documentos inválidos. El mensaje lista todos para corregirlos en una pasada. */
export class DocsError extends Error {
  readonly errors: DocError[]
  constructor(errors: DocError[]) {
    super(
      `${errors.length} documento(s) inválido(s):\n${errors.map((e) => `  - ${e.message}`).join('\n')}`,
    )
    this.name = 'DocsError'
    this.errors = errors
  }
}

/** Slug de un archivo: su nombre sin `.md`. Las carpetas organizan, no forman parte del slug. */
export const slugOf = (path: string) => posix.basename(path, '.md')

/** Parte pura: valida un conjunto de archivos. Lanza `DocsError` con todos los errores. */
export function loadDocs(files: readonly SourceFile[]): Loaded {
  const errors: DocError[] = []
  const bySlug = new Map<string, string>()
  const parsed: LoadedDoc[] = []

  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const slug = slugOf(f.path)
    try {
      if (!SLUG.test(slug))
        throw new DocError(
          f.path,
          `el nombre del archivo es el slug y "${slug}" no es válido: minúsculas, números y guiones`,
        )
      const first = bySlug.get(slug)
      if (first)
        throw new DocError(
          f.path,
          `slug duplicado "${slug}": ya lo usa ${first} (el slug es el nombre del archivo, único en todo content/docs)`,
        )
      bySlug.set(slug, f.path)

      const { data, body } = splitFrontmatter(f.path, f.raw)
      const fm = validateFrontmatter(f.path, data)
      parsed.push({
        body,
        meta: { slug, ...fm, backlinks: [], path: f.path },
      })
    } catch (e) {
      if (e instanceof DocError) errors.push(e)
      else throw e
    }
  }
  if (errors.length) throw new DocsError(errors)

  const back = computeBacklinks(parsed.map((d) => d.meta))
  for (const d of parsed) d.meta.backlinks = back[d.meta.slug] ?? []

  return { docs: parsed, warnings: relatedWarnings(parsed.map((d) => d.meta)) }
}

/** Enlaces internos `/docs/<slug>` del cuerpo que no existen. */
export function brokenDocLinks(
  path: string,
  links: readonly string[],
  slugs: ReadonlySet<string>,
): string[] {
  const out: string[] = []
  for (const href of links) {
    const m = /^\/docs\/([^/#?]+)/.exec(href)
    if (m?.[1] && !slugs.has(m[1]))
      out.push(`${path}: enlace a "${href}", que no existe en content/docs`)
  }
  return out
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const out: string[] = []
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p)
  }
  return out
}

/** Lee `content/docs` bajo `root` (la raíz del repo). */
export async function readSources(root: string): Promise<SourceFile[]> {
  const base = join(root, CONTENT_DIR)
  const paths = await walk(base)
  return Promise.all(
    paths.map(async (p) => ({
      path: relative(root, p).split(sep).join('/'),
      raw: await readFile(p, 'utf8'),
    })),
  )
}
