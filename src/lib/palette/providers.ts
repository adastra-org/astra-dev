// Proveedores públicos del palette. Los de IA (Preguntar a Ether, Code Mode) se registran aparte,
// con `permission: 'subscriber' | 'staff'`, cuando existan (ver docs/cmdk/README.md).
import { NAV } from '@/config/nav'
import { displayDoc, rankDocs, scoreMatch } from '@/lib/docs-query'
import { t } from '@/lib/i18n'
import { loadPreparedNatives } from '@/lib/natives/data'
import { searchNatives } from '@/lib/natives/query'
import { registerPaletteProvider } from './registry'
import type { PaletteIcon, PaletteItem, PaletteProvider } from './types'

const MAX_DOCS = 8
const MAX_HEADINGS = 8
const MAX_NATIVES = 8

/** Ordena por puntaje descendente y descarta lo que no coincide; empates conservan el orden dado. */
function rankBy<T>(
  list: readonly T[],
  query: string,
  fields: (x: T) => Parameters<typeof scoreMatch>[1],
): T[] {
  return list
    .map((x, i) => ({ x, i, s: scoreMatch(query, fields(x)) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.x)
}

export const recentsProvider: PaletteProvider = {
  id: 'recent',
  label: 'palette.section.recent',
  order: 10,
  permission: 'public',
  // Solo con la consulta vacía: al escribir, los recientes compiten como cualquier otro resultado.
  search: (q, ctx) =>
    q.trim()
      ? []
      : // Prefijo en el id: así no se descartan los destinos de "Ir a" por duplicados.
        ctx.recents.map((r) => ({
          ...r,
          id: `recent:${r.id}`,
          icon: 'recent' as PaletteIcon,
        })),
}

export const headingsProvider: PaletteProvider = {
  id: 'headings',
  label: 'palette.section.headings',
  order: 20,
  permission: 'public',
  search: (q, ctx) => {
    const items: PaletteItem[] = ctx.headings.map((h) => ({
      id: `heading:${ctx.pathname}#${h.id}`,
      title: h.title,
      icon: 'heading',
      to: `${ctx.pathname}#${h.id}`,
    }))
    if (!q.trim()) return items.slice(0, MAX_HEADINGS)
    return rankBy(items, q, (i) => ({ title: i.title })).slice(0, MAX_HEADINGS)
  },
}

/** Sinónimos para encontrar un destino por otro nombre ("hoja de ruta" lleva al Roadmap). */
const NAV_KEYWORDS: Record<string, string[]> = {
  '/': ['portada', 'home'],
  '/docs': ['docs', 'documentos', 'manuales', 'fivem'],
  '/natives': ['natives', 'funciones', 'api', 'referencia'],
  '/tools': ['herramientas', 'utilidades'],
  '/roadmap': ['hoja de ruta', 'plan', 'estado'],
}

export const navProvider: PaletteProvider = {
  id: 'nav',
  label: 'palette.section.nav',
  order: 30,
  permission: 'public',
  search: (q, ctx) => {
    const items: PaletteItem[] = NAV.map((n) => ({
      id: `nav:${n.to}`,
      title: t(ctx.lang, n.label),
      subtitle: t(ctx.lang, n.description),
      icon: n.icon,
      to: n.to,
    }))
    if (!q.trim()) return items
    return rankBy(items, q, (i) => ({
      title: i.title,
      keywords: NAV_KEYWORDS[i.to ?? ''] ?? [],
    }))
  },
}

export const docsProvider: PaletteProvider = {
  id: 'docs',
  label: 'palette.section.docs',
  order: 40,
  permission: 'public',
  // Sin consulta no se lista el índice entero: para eso está "Ir a Documentación".
  search: (q, ctx) =>
    q.trim()
      ? rankDocs(ctx.docs, q)
          .slice(0, MAX_DOCS)
          .map(({ doc, matchedTags }) => {
            const shown = displayDoc(doc, ctx.lang)
            return {
              id: `doc:${doc.slug}`,
              title: shown.title,
              subtitle: shown.summary,
              tags: matchedTags,
              icon: 'doc' as const,
              to: `/docs/${doc.slug}`,
            }
          })
      : [],
}

/**
 * Natives por nombre (`SetVehicleDoorOpen` o `SET_VEHICLE_DOOR_OPEN`) o por hash. El índice
 * (~1 MB, comprimido mucho menos) se pide recién al escribir la primera consulta de dos letras
 * o más. Si no carga, el grupo queda vacío: el palette sigue sirviendo todo lo demás.
 */
export const nativesProvider: PaletteProvider = {
  id: 'natives',
  label: 'palette.section.natives',
  order: 45,
  permission: 'public',
  async search(q, _ctx, signal) {
    if (q.trim().length < 2) return []
    let prepared
    try {
      prepared = await loadPreparedNatives()
    } catch {
      return []
    }
    if (signal.aborted) return []
    return searchNatives(prepared, q, MAX_NATIVES).map(({ row, hash }) => ({
      id: `native:${row.slug}`,
      title: row.luaName,
      subtitle: [hash ?? row.name, row.summary].filter(Boolean).join(' · '),
      icon: 'natives' as const,
      to: `/natives/${row.slug}`,
    }))
  },
}

export const PUBLIC_PROVIDERS: readonly PaletteProvider[] = [
  recentsProvider,
  headingsProvider,
  navProvider,
  docsProvider,
  nativesProvider,
]

/** Registra los proveedores públicos. Idempotente: se puede llamar más de una vez. */
export function registerPublicProviders() {
  for (const p of PUBLIC_PROVIDERS) registerPaletteProvider(p)
}
