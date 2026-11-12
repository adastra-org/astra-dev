// Carga de los datos de natives (archivos estáticos que emite el build, ver
// scripts/natives/plugin.ts). El índice se pide una vez y se reutiliza; cada página de native es un
// archivo propio. Sin módulo virtual: se puede inyectar `fetch` en las pruebas.
import { decodeIndex, type NativeContent, type NativeIndex } from './types'
import { type PreparedNative, prepareNatives } from './query'

type Fetch = typeof fetch

const base = (): string => import.meta.env?.BASE_URL ?? '/'

export const nativesUrl = (name: string) =>
  `${base()}data/natives/${encodeURIComponent(name)}.json`

let indexPromise: Promise<NativeIndex> | undefined
let preparedPromise: Promise<PreparedNative[]> | undefined
const pages = new Map<string, Promise<NativeContent | null>>()

export function loadNativeIndex(f: Fetch = fetch): Promise<NativeIndex> {
  indexPromise ??= f(nativesUrl('index'))
    .then((r) => {
      if (!r.ok) throw new Error(`índice de natives: ${r.status}`)
      return r.json()
    })
    .then(decodeIndex)
    .catch((e: unknown) => {
      indexPromise = undefined // un fallo de red no se queda para siempre
      throw e
    })
  return indexPromise
}

export function loadPreparedNatives(
  f: Fetch = fetch,
): Promise<PreparedNative[]> {
  preparedPromise ??= loadNativeIndex(f)
    .then((i) => prepareNatives(i.rows))
    .catch((e: unknown) => {
      preparedPromise = undefined
      throw e
    })
  return preparedPromise
}

/** Página de un native; `null` si no existe (404). */
export function loadNative(
  slug: string,
  f: Fetch = fetch,
): Promise<NativeContent | null> {
  let p = pages.get(slug)
  if (!p) {
    p = f(nativesUrl(slug)).then(async (r) => {
      if (r.status === 404) return null
      if (!r.ok) throw new Error(`native ${slug}: ${r.status}`)
      const type = r.headers.get('content-type') ?? ''
      // Un servidor con SPA fallback responde 200 con HTML a lo que no existe.
      if (!type.includes('json')) return null
      return (await r.json()) as NativeContent
    })
    pages.set(slug, p)
    p.catch(() => pages.delete(slug))
  }
  return p
}

/** Solo para pruebas: olvida lo cacheado. */
export function resetNativesCache() {
  indexPromise = undefined
  preparedPromise = undefined
  pages.clear()
}
