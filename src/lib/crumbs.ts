// Migas de pan de la barra superior. Puro (sin React ni el módulo virtual de docs) para probarlo.
import { NAV } from '@/config/nav'
import { t, type MessageKey } from './i18n'

export interface Crumb {
  label: string
  to: string
}

/** Páginas con ruta propia que no están en la navegación (se llega por URL o por el palette). */
const HIDDEN_PAGES: readonly { to: string; label: MessageKey }[] = [
  { to: '/ask', label: 'ai.title' },
]

/** Traductor de claves del diccionario; por defecto español (para probar sin React). */
export type Tr = (key: MessageKey) => string
const es: Tr = (key) => t('es', key)

/** Datos de natives para las migas: el grupo (namespace) y el native abierto, si ya cargó. */
export interface NativeCrumbs {
  groupLabel: (id: string) => string | undefined
  current: (slug: string) => { label: string; group: string } | undefined
}

/**
 * Inicio / sección / documento. La última miga es la página actual. `docTitle` resuelve el título
 * de un slug (o `undefined` si no existe). Una ruta que no existe termina en "Página no encontrada".
 */
export function crumbsFor(
  pathname: string,
  docTitle: (slug: string) => string | undefined,
  natives?: NativeCrumbs,
  tr: Tr = es,
): Crumb[] {
  const notFound = tr('crumbs.notFound')
  const [home, ...sections] = NAV
  if (!home) return []
  const crumbs: Crumb[] = [{ label: tr(home.label), to: home.to }]
  if (pathname === '/') return crumbs

  const hidden = HIDDEN_PAGES.find(
    (p) => pathname === p.to || pathname === `${p.to}/`,
  )
  if (hidden) return [...crumbs, { label: tr(hidden.label), to: hidden.to }]

  const section = sections.find(
    (n) => pathname === n.to || pathname.startsWith(`${n.to}/`),
  )
  if (!section) return [...crumbs, { label: notFound, to: pathname }]
  crumbs.push({ label: tr(section.label), to: section.to })
  if (pathname === section.to || pathname === `${section.to}/`) return crumbs

  if (section.to === '/natives' && natives) {
    const ns = /^\/natives\/ns\/([^/]+)\/?$/.exec(pathname)?.[1]
    if (ns !== undefined) {
      const label = natives.groupLabel(ns)
      return [
        ...crumbs,
        { label: label ?? tr('crumbs.nsNotFound'), to: pathname },
      ]
    }
    const one = /^\/natives\/([^/]+)\/?$/.exec(pathname)?.[1]
    if (one !== undefined) {
      const cur = natives.current(one)
      const group = cur && natives.groupLabel(cur.group)
      return [
        ...crumbs,
        ...(cur && group
          ? [{ label: group, to: `/natives/ns/${cur.group}` }]
          : []),
        { label: cur?.label ?? one, to: pathname },
      ]
    }
    return [...crumbs, { label: notFound, to: pathname }]
  }

  const slug =
    section.to === '/docs'
      ? /^\/docs\/([^/]+)\/?$/.exec(pathname)?.[1]
      : undefined
  if (slug === undefined) return [...crumbs, { label: notFound, to: pathname }]
  let decoded = slug
  try {
    decoded = decodeURIComponent(slug)
  } catch {
    /* slug malformado: se busca tal cual y no existirá */
  }
  return [
    ...crumbs,
    { label: docTitle(decoded) ?? tr('crumbs.docNotFound'), to: pathname },
  ]
}
