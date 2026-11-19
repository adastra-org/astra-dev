// Natives for the index: reads the importer's output (`content/generated/natives/**.json`, see
// docs/import/README.md) and turns each native into one chunk. Lenient about extra fields (the
// importer owns the format), strict about the ones the index needs.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { toExcerpt, type Chunk, type NativeMeta } from './chunk.ts'

export interface NativeRecord extends NativeMeta {
  slug: string
  params: { name: string; type: string; description: string }[]
  returnType: string
  description: string
  returns: string
  examples: string
  astraNotes: string
}

/** Longest text kept per native: long example blocks are cut, the signature and notes never are. */
export const NATIVE_MAX_CHARS = 2400
const EXAMPLES_MAX_CHARS = 700

const isStr = (v: unknown): v is string => typeof v === 'string'
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : [])

export function parseNativeRecord(raw: unknown, file: string): NativeRecord {
  const o = raw as Record<string, unknown> | null
  if (
    !o ||
    !isStr(o.id) ||
    !isStr(o.slug) ||
    !isStr(o.name) ||
    !isStr(o.signature) ||
    (o.source !== 'gta' && o.source !== 'cfx')
  )
    throw new Error(`${file}: malformed native record`)
  const apiset =
    o.apiset === 'client' || o.apiset === 'server' || o.apiset === 'shared'
      ? o.apiset
      : null
  const params = Array.isArray(o.params)
    ? o.params.flatMap((p) => {
        const q = p as Record<string, unknown> | null
        return q && isStr(q.name) && isStr(q.type)
          ? [
              {
                name: q.name,
                type: q.type,
                description: isStr(q.description) ? q.description : '',
              },
            ]
          : []
      })
    : []
  return {
    id: o.id,
    slug: o.slug,
    source: o.source,
    name: o.name,
    luaName: isStr(o.luaName) ? o.luaName : o.name,
    ns: isStr(o.ns) ? o.ns : '',
    apiset,
    hashes: strs(o.hashes),
    aliases: strs(o.aliases),
    signature: o.signature,
    params,
    returnType: isStr(o.returnType) ? o.returnType : 'void',
    description: isStr(o.description) ? o.description : '',
    returns: isStr(o.returns) ? o.returns : '',
    examples: isStr(o.examples) ? o.examples : '',
    astraNotes: isStr(o.astraNotes) ? o.astraNotes : '',
  }
}

/** Reads every native group file under `<generatedDir>/natives` (not `index.json`). */
export async function readNatives(
  generatedDir: string,
): Promise<NativeRecord[]> {
  const root = join(generatedDir, 'natives')
  if (!existsSync(root)) return []
  const files: string[] = []
  for (const source of (await readdir(root, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    if (!source.isDirectory()) continue
    for (const f of (await readdir(join(root, source.name))).sort())
      if (f.endsWith('.json')) files.push(join(root, source.name, f))
  }
  const lists = await Promise.all(
    files.map(
      async (file) =>
        [file, JSON.parse(await readFile(file, 'utf8')) as unknown] as const,
    ),
  )
  const out: NativeRecord[] = []
  for (const [file, list] of lists) {
    if (!Array.isArray(list)) throw new Error(`${file}: expected an array`)
    for (const item of list) out.push(parseNativeRecord(item, file))
  }
  const seen = new Set<string>()
  for (const n of out) {
    if (seen.has(n.id)) throw new Error(`duplicate native ${n.id}`)
    seen.add(n.id)
  }
  return out
}

/** Stable hash of the natives: tells whether an index is stale. */
export const hashNatives = (natives: readonly NativeRecord[]): string =>
  createHash('sha256')
    .update(
      natives
        .map(
          (n) => `${n.id}\n${n.signature}\n${n.description}\n${n.astraNotes}`,
        )
        .join('\n\u0000\n'),
    )
    .digest('hex')
    .slice(0, 16)

const scope = (n: NativeRecord) =>
  [n.ns, n.apiset ?? (n.source === 'gta' ? 'client' : '')]
    .filter(Boolean)
    .join(', ')

/** Markdown of one native. Names and the signature come first: they are what people search. */
export function nativeText(n: NativeRecord): string {
  const parts: string[] = []
  const head = n.luaName !== n.name ? `${n.name} (${n.luaName})` : n.name
  parts.push(`${head} - ${scope(n)}`)
  parts.push(`\`\`\`c\n${n.signature}\n\`\`\``)
  if (n.description) parts.push(n.description)
  const documented = n.params.filter((p) => p.description)
  if (documented.length)
    parts.push(
      `Parameters:\n${documented
        .map(
          (p) =>
            `- ${p.name} (${p.type}): ${p.description.replace(/\s+/g, ' ')}`,
        )
        .join('\n')}`,
    )
  if (n.returns) parts.push(`Returns: ${n.returns}`)
  if (n.hashes.length) parts.push(`Hashes: ${n.hashes.join(', ')}`)
  if (n.examples)
    parts.push(
      `Examples:\n${
        n.examples.length > EXAMPLES_MAX_CHARS
          ? `${n.examples.slice(0, EXAMPLES_MAX_CHARS)}\n…`
          : n.examples
      }`,
    )
  if (n.astraNotes) parts.push(`Notas de Astra:\n${n.astraNotes}`)
  const text = parts.join('\n\n')
  return text.length > NATIVE_MAX_CHARS
    ? `${text.slice(0, NATIVE_MAX_CHARS)}…`
    : text
}

export function nativeChunk(n: NativeRecord): Chunk {
  const text = nativeText(n)
  const meta: NativeMeta = {
    id: n.id,
    source: n.source,
    name: n.name,
    luaName: n.luaName,
    ns: n.ns,
    apiset: n.apiset,
    hashes: n.hashes,
    aliases: n.aliases,
    signature: n.signature,
  }
  return {
    id: `native:${n.id}`,
    kind: 'native',
    native: meta,
    slug: n.slug,
    title: n.name,
    heading: null,
    anchor: null,
    text,
    excerpt: toExcerpt(n.description || n.signature, 220),
  }
}
