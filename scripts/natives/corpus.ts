// Corpus de natives para el sitio: lee lo que generó el importador (`content/generated/`), aplica
// las notas propias (`content/overrides/natives/`) y las traducciones ES, y arma el índice.
// Las notas se leen acá (no solo en el import) para que editarlas se vea sin volver a importar.
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Native } from '../import/types.ts'
import { overrideKey } from '../import/corpus.ts'
import { loadOverrides } from '../import/overrides.ts'
import {
  type NativeTranslation,
  readNativeTranslations,
} from '../translate/store.ts'
import type { NativeGroup } from '../../src/lib/natives/types.ts'

export const GENERATED_DIR = 'content/generated'
export const OVERRIDES_DIR = 'content/overrides/natives'

export interface Manifest {
  sources: Record<string, { repo: string; sha: string }>
}

export interface NativesCorpus {
  natives: Native[]
  groups: NativeGroup[]
  /** Grupo de cada native, por slug. */
  groupOf: Map<string, string>
  translations: Map<string, NativeTranslation>
  manifest: Manifest
  warnings: string[]
}

/** `gta-vehicle`, `cfx-client`: apto para URL. */
export function groupIdOf(n: Pick<Native, 'source' | 'ns' | 'apiset'>): string {
  const part = n.source === 'cfx' ? (n.apiset ?? 'shared') : n.ns
  return `${n.source}-${part.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function groupLabelOf(
  n: Pick<Native, 'source' | 'ns' | 'apiset'>,
): string {
  return n.source === 'cfx' ? `CFX ${n.apiset ?? 'shared'}` : n.ns
}

/** Valida lo mínimo de un native leído del JSON del importador (el contrato de `types.ts`). */
export function assertNative(file: string, n: unknown): asserts n is Native {
  const o = n as Partial<Native> | null
  const bad = (what: string): never => {
    throw new Error(`${file}: native inválido (${what})`)
  }
  if (!o || typeof o !== 'object') return bad('no es un objeto')
  for (const k of ['id', 'slug', 'name', 'luaName', 'ns', 'signature'] as const)
    if (typeof o[k] !== 'string' || !o[k]) bad(`falta \`${k}\``)
  if (o.source !== 'gta' && o.source !== 'cfx') bad('`source`')
  if (!Array.isArray(o.hashes) || !Array.isArray(o.params))
    bad('`hashes` y `params` deben ser listas')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(o.slug ?? ''))
    bad(`slug "${o.slug}" no es apto para URL`)
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, '')) as T
}

/**
 * Lee el corpus. `null` si `content/generated/natives` no existe (no se corrió `bun run import`):
 * el sitio se construye sin natives y el llamador decide si eso es un error.
 */
export async function readNativesCorpus(
  root: string,
): Promise<NativesCorpus | null> {
  const dir = join(root, GENERATED_DIR, 'natives')
  if (!existsSync(join(dir, 'index.json'))) return null
  const warnings: string[] = []

  const natives: Native[] = []
  for (const source of ['gta', 'cfx']) {
    const sub = join(dir, source)
    if (!existsSync(sub)) continue
    for (const f of (await readdir(sub)).sort()) {
      if (!f.endsWith('.json')) continue
      const file = join(sub, f)
      const list = await readJson<unknown[]>(file)
      for (const n of list) {
        assertNative(file, n)
        natives.push(n)
      }
    }
  }

  const slugs = new Set<string>()
  for (const n of natives) {
    if (slugs.has(n.slug))
      throw new Error(`slug de native repetido: ${n.slug} (${n.id})`)
    slugs.add(n.slug)
  }

  const overrides = await loadOverrides(join(root, OVERRIDES_DIR))
  const used = new Set<string>()
  for (const n of natives) {
    for (const key of [overrideKey(n.name), overrideKey(n.luaName)]) {
      const note = overrides.get(key)
      if (note !== undefined) {
        n.astraNotes = note
        used.add(key)
        break
      }
    }
  }
  for (const key of overrides.keys())
    if (!used.has(key)) warnings.push(`override sin native: ${key}`)

  const translations = await readNativeTranslations(root)
  for (const slug of translations.keys())
    if (!slugs.has(slug))
      warnings.push(`traducción de un native que no existe: ${slug}`)

  const groups = new Map<string, NativeGroup>()
  const groupOf = new Map<string, string>()
  for (const n of natives) {
    const id = groupIdOf(n)
    groupOf.set(n.slug, id)
    const g = groups.get(id)
    if (g) g.count++
    else
      groups.set(id, {
        id,
        source: n.source,
        label: groupLabelOf(n),
        count: 1,
      })
  }
  const sorted = [...groups.values()].sort(
    (a, b) =>
      // GTA primero (es lo que más se consulta), luego CFX; dentro, por nombre.
      Number(a.source === 'cfx') - Number(b.source === 'cfx') ||
      a.label.localeCompare(b.label),
  )

  const manifest = await readJson<Manifest>(
    join(root, GENERATED_DIR, 'manifest.json'),
  )

  return {
    natives,
    groups: sorted,
    groupOf,
    translations,
    manifest,
    warnings,
  }
}

/** Enlace al archivo original, fijado al sha importado. */
export function originUrl(manifest: Manifest, n: Native): string {
  const name =
    n.upstream.source === 'cfx' || n.source === 'cfx'
      ? 'cfx-natives'
      : 'natives'
  const src = manifest.sources[name]
  if (!src) return ''
  return `${src.repo}/blob/${src.sha}/${n.upstream.path}`
}
