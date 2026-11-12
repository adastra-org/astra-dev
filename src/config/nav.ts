// Navegación del shell: una sola fuente para sidebar, barra superior y tests. Los textos salen del
// diccionario (`lib/i18n.ts`) por clave: el idioma lo decide quien renderiza.
import type { MessageKey } from '@/lib/i18n'

export type NavIcon = 'home' | 'docs' | 'natives' | 'tools' | 'roadmap'

export interface NavItem {
  to: string
  label: MessageKey
  /** Una línea para la portada y el título de página. */
  description: MessageKey
  icon: NavIcon
  /** `true` si el enlace solo está activo con coincidencia exacta (la portada). */
  end?: boolean
}

export const NAV: readonly NavItem[] = [
  {
    to: '/',
    label: 'nav.home',
    description: 'nav.home.desc',
    icon: 'home',
    end: true,
  },
  {
    to: '/docs',
    label: 'nav.docs',
    description: 'nav.docs.desc',
    icon: 'docs',
  },
  {
    to: '/natives',
    label: 'nav.natives',
    description: 'nav.natives.desc',
    icon: 'natives',
  },
  {
    to: '/tools',
    label: 'nav.tools',
    description: 'nav.tools.desc',
    icon: 'tools',
  },
  {
    to: '/roadmap',
    label: 'nav.roadmap',
    description: 'nav.roadmap.desc',
    icon: 'roadmap',
  },
]

/** Item de navegación que contiene `pathname` (el más específico gana). */
export function navFor(pathname: string): NavItem | undefined {
  return [...NAV]
    .sort((a, b) => b.to.length - a.to.length)
    .find((n) =>
      n.to === '/'
        ? pathname === '/'
        : pathname === n.to || pathname.startsWith(`${n.to}/`),
    )
}
