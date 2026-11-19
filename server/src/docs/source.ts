// Reads `content/docs/**/*.md` for indexing. Lenient on purpose: the strict validation of the
// frontmatter belongs to the site build (scripts/docs); here we only need slug, title and summary.
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse } from 'yaml'
import type { DocInput } from './chunk.ts'

export interface SourceDoc extends DocInput {
  lang: string
  raw: string
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p)
  }
  return out.sort()
}

export function parseDoc(path: string, raw: string): SourceDoc {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text)
  if (!m) throw new Error(`${path}: missing frontmatter`)
  const data = parse(m[1] ?? '') as Record<string, unknown> | null
  const title = typeof data?.title === 'string' ? data.title.trim() : ''
  const summary = typeof data?.summary === 'string' ? data.summary.trim() : ''
  if (!title || !summary)
    throw new Error(`${path}: frontmatter needs title and summary`)
  return {
    slug: basename(path, '.md'),
    title,
    summary: summary.replace(/\s+/g, ' '),
    lang: typeof data?.lang === 'string' ? data.lang : 'es',
    body: text.slice(m[0].length),
    raw: text,
  }
}

export async function readDocs(dir: string): Promise<SourceDoc[]> {
  const paths = await walk(dir)
  const docs = await Promise.all(
    paths.map(async (p) => parseDoc(p, await readFile(p, 'utf8'))),
  )
  const seen = new Set<string>()
  for (const d of docs) {
    if (seen.has(d.slug)) throw new Error(`duplicate slug "${d.slug}"`)
    seen.add(d.slug)
  }
  return docs
}

/** Stable hash of the sources: tells whether an index is stale. */
export const hashDocs = (docs: readonly SourceDoc[]) =>
  createHash('sha256')
    .update(docs.map((d) => `${d.slug}\n${d.raw}`).join('\n\u0000\n'))
    .digest('hex')
    .slice(0, 16)
