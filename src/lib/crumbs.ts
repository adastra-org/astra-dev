// Migas de pan de la barra superior. Puro (sin React ni el módulo virtual de docs) para probarlo.
import { NAV } from '@/config/nav'

export interface Crumb {
  label: string
  to: string
}

const NOT_FOUND = 'Página no encontrada'

/**
 * Inicio / sección / documento. La última miga es la página actual. `docTitle` resuelve el título
 * de un slug (o `undefined` si no existe). Una ruta que no existe termina en "Página no encontrada".
 */
export function crumbsFor(
  pathname: string,
  docTitle: (slug: string) => string | undefined,
): Crumb[] {
  const [home, ...sections] = NAV
  if (!home) return []
  const crumbs: Crumb[] = [{ label: home.label, to: home.to }]
  if (pathname === '/') return crumbs

  const section = sections.find(
    (n) => pathname === n.to || pathname.startsWith(`${n.to}/`),
  )
  if (!section) return [...crumbs, { label: NOT_FOUND, to: pathname }]
  crumbs.push({ label: section.label, to: section.to })
  if (pathname === section.to || pathname === `${section.to}/`) return crumbs

  const slug =
    section.to === '/docs'
      ? /^\/docs\/([^/]+)\/?$/.exec(pathname)?.[1]
      : undefined
  if (slug === undefined) return [...crumbs, { label: NOT_FOUND, to: pathname }]
  let decoded = slug
  try {
    decoded = decodeURIComponent(slug)
  } catch {
    /* slug malformado: se busca tal cual y no existirá */
  }
  return [
    ...crumbs,
    { label: docTitle(decoded) ?? 'Documento no encontrado', to: pathname },
  ]
}
