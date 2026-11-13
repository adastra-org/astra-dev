// Selecciones recientes del palette en localStorage. Cada lectura y escritura va en try/catch:
// el almacenamiento puede faltar o lanzar (modo privado, datos bloqueados, cuota).
import type { PaletteIcon, PaletteItem, Permission } from './types'

const KEY = 'astra-dev:palette:recent'
export const MAX_RECENT = 5

const PERMISSIONS: readonly string[] = [
  'public',
  'subscriber',
  'staff',
  'owner',
]
const ICONS: readonly string[] = [
  'home',
  'docs',
  'tools',
  'roadmap',
  'doc',
  'heading',
  'recent',
  'sparkles',
]

/** Valida lo leído: el almacenamiento es entrada no confiable (otra versión, edición a mano). */
export function parseRecents(raw: string | null): PaletteItem[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  return data
    .flatMap((x): PaletteItem[] => {
      if (!x || typeof x !== 'object') return []
      const o = x as Record<string, unknown>
      if (
        typeof o.id !== 'string' ||
        typeof o.title !== 'string' ||
        typeof o.to !== 'string' ||
        !o.to.startsWith('/') ||
        o.to.startsWith('//') ||
        !ICONS.includes(o.icon as string)
      )
        return []
      return [
        {
          id: o.id,
          title: o.title,
          subtitle: typeof o.subtitle === 'string' ? o.subtitle : undefined,
          icon: o.icon as PaletteIcon,
          to: o.to,
          permission: PERMISSIONS.includes(o.permission as string)
            ? (o.permission as Permission)
            : 'public',
        },
      ]
    })
    .slice(0, MAX_RECENT)
}

export function loadRecents(): PaletteItem[] {
  try {
    return parseRecents(localStorage.getItem(KEY))
  } catch {
    return []
  }
}

/** Agrega `item` al inicio (sin duplicar por `to`). Los ítems sin `to` no se guardan. */
export function pushRecent(
  list: readonly PaletteItem[],
  item: PaletteItem,
): PaletteItem[] {
  if (!item.to) return [...list]
  const entry: PaletteItem = {
    // Un reciente elegido de la lista llega con el prefijo `recent:`; no se acumula.
    id: item.id.replace(/^(recent:)+/, ''),
    title: item.title,
    subtitle: item.subtitle?.slice(0, 160),
    icon: item.icon,
    to: item.to,
    permission: item.permission ?? 'public',
  }
  return [entry, ...list.filter((r) => r.to !== item.to)].slice(0, MAX_RECENT)
}

export function saveRecents(list: readonly PaletteItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* sin almacenamiento: los recientes dejan de persistir, nada más */
  }
}
