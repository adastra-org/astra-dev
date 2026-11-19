// Arma el corpus (natives + docs) a partir de archivos ya leídos. Puro: sin disco ni red, para poder
// probarlo con fixtures. El runner (`run.ts`) lee las fuentes y escribe el resultado.
import { parse } from 'yaml'
import {
  convertDoc,
  docSlug,
  docUrl,
  nativeSlug,
  type ConvertContext,
} from './fivem-docs.ts'
import { parseNative, resolveLinks } from './natives.ts'
import {
  ImportError,
  type GeneratedDoc,
  type Native,
  type NativeSource,
} from './types.ts'

export interface RawFile {
  /** Relativa al repo de origen (natives) o a `content/docs` (docs). */
  path: string
  raw: string
}

export interface CorpusInput {
  gta: RawFile[]
  cfx: RawFile[]
  docs: RawFile[]
  /** Notas de Astra por native: clave = nombre del archivo sin `.md`. */
  overrides: ReadonlyMap<string, string>
  since: string
  readStatic: ConvertContext['readStatic']
  manifestVersions: ConvertContext['manifestVersions']
}

export interface Corpus {
  natives: Native[]
  docs: GeneratedDoc[]
  warnings: string[]
  /** Archivos que no se pudieron convertir (y quedan fuera del corpus). */
  errors: ImportError[]
}

/** `SetVehicleDoorOpen` y `SET_VEHICLE_DOOR_OPEN` dan la misma clave. */
export const overrideKey = (name: string): string =>
  name.replace(/[^A-Za-z0-9]/g, '').toUpperCase()

function frontmatterAliases(raw: string): string[] {
  const m = /^---\n([\s\S]*?)\n---/.exec(
    raw.replace(/^﻿/, '').replace(/\r\n/g, '\n'),
  )
  if (!m) return []
  try {
    const data = parse(m[1] ?? '') as { aliases?: unknown } | null
    const a = data?.aliases
    return Array.isArray(a)
      ? a.filter((x): x is string => typeof x === 'string')
      : []
  } catch {
    return [] // el error de YAML lo reporta `convertDoc` con la ruta
  }
}

/** Un archivo roto no tapa a los demás: se juntan todos los errores y el runner decide. */
function parseAll(
  source: NativeSource,
  files: readonly RawFile[],
  errors: ImportError[],
): Native[] {
  const out: Native[] = []
  for (const f of files) {
    try {
      out.push(parseNative(source, f.path, f.raw))
    } catch (e) {
      if (e instanceof ImportError) errors.push(e)
      else throw e
    }
  }
  return out
}

export function buildCorpus(input: CorpusInput): Corpus {
  const warnings: string[] = []
  const errors: ImportError[] = []
  const warn = (m: string) => warnings.push(m)

  const natives = [
    ...parseAll('gta', input.gta, errors),
    ...parseAll('cfx', input.cfx, errors),
  ].sort((a, b) => a.id.localeCompare(b.id))

  const ids = new Map<string, string>()
  const byName = new Map<string, Native[]>()
  for (const n of natives) {
    const prev = ids.get(n.id)
    if (prev)
      throw new ImportError(
        n.upstream.path,
        `native duplicado ${n.id} (también en ${prev})`,
      )
    ids.set(n.id, n.upstream.path)
    byName.set(n.name, [...(byName.get(n.name) ?? []), n])
  }
  // CFX redefine ~75 natives de GTA (variantes de servidor, etc.): con nombre repetido, ambos
  // llevan sufijo para que cada página tenga su propio slug estable.
  for (const group of byName.values()) {
    for (const n of group) {
      const base = nativeSlug(n.name)
      n.slug =
        group.length === 1
          ? base
          : n.source === 'gta'
            ? `${base}-gta`
            : `${base}-cfx-${n.apiset ?? 'shared'}`
    }
  }
  // Los slugs no llevan el `_` inicial (`_GET_PED_EYE_COLOR` → `get-ped-eye-color`), así que dos
  // nombres pueden chocar. El nombre sin `_` conserva el slug; el otro suma `-2`, `-3`…
  const slugSeen = new Set<string>()
  const bySlugPriority = [...natives].sort(
    (a, b) =>
      Number(a.name.startsWith('_')) - Number(b.name.startsWith('_')) ||
      a.id.localeCompare(b.id),
  )
  for (const n of bySlugPriority) {
    let slug = n.slug
    for (let i = 2; slugSeen.has(slug); i++) slug = `${n.slug}-${i}`
    n.slug = slug
    slugSeen.add(slug)
  }
  const nativeByName = new Map<string, { id: string; slug: string }>()
  for (const [name, group] of byName) {
    const pick = group.find((n) => n.source === 'gta') ?? group[0]
    if (pick) nativeByName.set(name, { id: pick.id, slug: pick.slug })
  }
  resolveLinks(natives)

  const used = new Set<string>()
  for (const n of natives) {
    for (const key of [overrideKey(n.name), overrideKey(n.luaName)]) {
      const note = input.overrides.get(key)
      if (note !== undefined) {
        n.astraNotes = note
        used.add(key)
        break
      }
    }
  }
  for (const key of input.overrides.keys())
    if (!used.has(key)) warn(`override sin native: ${key}`)

  // Primera pasada: slug y URL de cada doc (y de sus aliases), para reescribir enlaces entre ellos.
  const urlToSlug = new Map<string, string>()
  const seenSlugs = new Map<string, string>()
  for (const f of input.docs) {
    const slug = docSlug(f.path)
    const prev = seenSlugs.get(slug)
    if (prev)
      throw new ImportError(
        f.path,
        `slug "${slug}" repetido (también en ${prev})`,
      )
    seenSlugs.set(slug, f.path)
    urlToSlug.set(docUrl(f.path), slug)
    for (const alias of frontmatterAliases(f.raw))
      urlToSlug.set(alias.replace(/\/+$/, ''), slug)
  }

  const ctx: ConvertContext = {
    urlToSlug,
    natives: nativeByName,
    since: input.since,
    readStatic: input.readStatic,
    manifestVersions: input.manifestVersions,
  }
  const docs: GeneratedDoc[] = []
  for (const f of input.docs) {
    // Placeholders vacíos de la fuente (p. ej. `promise.all.md`): no hay nada que convertir.
    if (!f.raw.trim()) {
      warn(`${f.path}: archivo vacío, se omite`)
      continue
    }
    try {
      docs.push(convertDoc(f.path, f.raw, ctx, warn))
    } catch (e) {
      if (e instanceof ImportError) errors.push(e)
      else throw e
    }
  }
  docs.sort((a, b) => a.slug.localeCompare(b.slug))

  return { natives, docs, warnings, errors }
}
