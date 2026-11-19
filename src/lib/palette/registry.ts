// Registro de proveedores del palette y su control de acceso. Sin React.
import type {
  PaletteContext,
  PaletteItem,
  PaletteProvider,
  PaletteSection,
  Permission,
} from './types'

const RANK: Record<Permission, number> = { public: 0, subscriber: 1, staff: 2 }

/** `access` alcanza para `required` (staff ve lo de subscriber; todos ven lo público). */
export function canAccess(access: Permission, required: Permission): boolean {
  return RANK[access] >= RANK[required]
}

const providers = new Map<string, PaletteProvider>()

/** Registra un proveedor (mismo `id` lo reemplaza). Devuelve la función que lo quita. */
export function registerPaletteProvider(p: PaletteProvider): () => void {
  providers.set(p.id, p)
  return () => {
    if (providers.get(p.id) === p) providers.delete(p.id)
  }
}

export function listPaletteProviders(): PaletteProvider[] {
  return [...providers.values()]
}

// Nivel del usuario actual. Hoy no hay sesión: todo el mundo es `public`. Cuando exista
// autenticación (suscriptores de Tebex, staff), la fija con `setPaletteAccess` y el palette
// empieza a mostrar los proveedores que ese nivel permite, sin tocar el componente.
let access: Permission = 'public'
export const getPaletteAccess = () => access
export function setPaletteAccess(next: Permission) {
  access = next
}

const byOrder = (a: PaletteProvider, b: PaletteProvider) =>
  a.order - b.order || a.id.localeCompare(b.id)

/** Proveedores que `level` puede usar, en orden de aparición. */
export function visibleProviders(
  list: readonly PaletteProvider[],
  level: Permission,
): PaletteProvider[] {
  return list.filter((p) => canAccess(level, p.permission)).sort(byOrder)
}

export interface RunOptions {
  providers: readonly PaletteProvider[]
  query: string
  ctx: PaletteContext
  access: Permission
  signal: AbortSignal
  /** Una vez por proveedor visible, con sus ítems (al terminar su búsqueda, sincrónica o no). */
  onResult: (providerId: string, items: PaletteItem[]) => void
}

/**
 * Ejecuta los proveedores que `access` permite. Uno sin permiso no se invoca: su código ni
 * corre. Un proveedor que lanza o rechaza aporta cero ítems sin afectar a los demás. Resuelve
 * cuando todos terminaron. Tras `signal.abort()` ya no se llama a `onResult`.
 */
export async function runProviders(opts: RunOptions): Promise<void> {
  const { query, ctx, signal, onResult } = opts
  const emit = (p: PaletteProvider, items: PaletteItem[]) => {
    if (signal.aborted) return
    onResult(
      p.id,
      items.map((it) => ({ ...it, permission: p.permission })),
    )
  }
  await Promise.all(
    visibleProviders(opts.providers, opts.access).map(async (p) => {
      try {
        emit(p, await p.search(query, ctx, signal))
      } catch {
        emit(p, [])
      }
    }),
  )
}

/**
 * Ordena los resultados por proveedor en secciones; omite las vacías. Un ítem con el mismo `id`
 * que otro de una sección anterior se descarta: un proveedor semántico puede devolver
 * `doc:<slug>` sin duplicar lo que ya encontró la búsqueda por texto.
 */
export function buildSections(
  providers: readonly PaletteProvider[],
  results: ReadonlyMap<string, PaletteItem[]>,
): PaletteSection[] {
  const seen = new Set<string>()
  return [...providers].sort(byOrder).flatMap((p) => {
    const items = (results.get(p.id) ?? []).filter((it) => {
      if (seen.has(it.id)) return false
      seen.add(it.id)
      return true
    })
    return items.length ? [{ id: p.id, label: p.label, items }] : []
  })
}
