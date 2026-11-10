// Proveedores públicos del palette. Los de IA (Preguntar a Ether, Code Mode) se registran aparte,
// con `permission: 'subscriber' | 'staff'`, cuando existan (ver docs/cmdk/README.md).
import { NAV } from '@/config/nav'
import { rankDocs, scoreMatch } from '@/lib/docs-query'
import { registerPaletteProvider } from './registry'
import type { PaletteIcon, PaletteItem, PaletteProvider } from './types'

const MAX_DOCS = 8
const MAX_HEADINGS = 8

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
  label: 'Recientes',
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
  label: 'En esta página',
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
  '/docs': ['docs', 'documentos', 'natives'],
  '/tools': ['herramientas', 'utilidades'],
  '/roadmap': ['hoja de ruta', 'plan', 'estado'],
}

export const navProvider: PaletteProvider = {
  id: 'nav',
  label: 'Ir a',
  order: 30,
  permission: 'public',
  search: (q) => {
    const items: PaletteItem[] = NAV.map((n) => ({
      id: `nav:${n.to}`,
      title: n.label,
      subtitle: n.description,
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
  label: 'Documentación',
  order: 40,
  permission: 'public',
  // Sin consulta no se lista el índice entero: para eso está "Ir a Documentación".
  search: (q, ctx) =>
    q.trim()
      ? rankDocs(ctx.docs, q)
          .slice(0, MAX_DOCS)
          .map(({ doc, matchedTags }) => ({
            id: `doc:${doc.slug}`,
            title: doc.title,
            subtitle: doc.summary,
            tags: matchedTags,
            icon: 'doc' as const,
            to: `/docs/${doc.slug}`,
          }))
      : [],
}

export const PUBLIC_PROVIDERS: readonly PaletteProvider[] = [
  recentsProvider,
  headingsProvider,
  navProvider,
  docsProvider,
]

/** Registra los proveedores públicos. Idempotente: se puede llamar más de una vez. */
export function registerPublicProviders() {
  for (const p of PUBLIC_PROVIDERS) registerPaletteProvider(p)
}
