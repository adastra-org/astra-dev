// Navegación del shell: una sola fuente para sidebar, barra superior y tests.

export type NavIcon = 'home' | 'docs' | 'tools' | 'roadmap'

export interface NavItem {
  to: string
  label: string
  /** Una línea para la portada y el título de página. */
  description: string
  icon: NavIcon
  /** `true` si el enlace solo está activo con coincidencia exacta (la portada). */
  end?: boolean
}

export const NAV: readonly NavItem[] = [
  {
    to: '/',
    label: 'Inicio',
    description: 'Punto de entrada al desarrollo de Ad Astra.',
    icon: 'home',
    end: true,
  },
  {
    to: '/docs',
    label: 'Documentación',
    description: 'Natives, sistemas y guías del servidor, en español.',
    icon: 'docs',
  },
  {
    to: '/tools',
    label: 'Herramientas',
    description: 'Utilidades del equipo para mapas, vehículos y conversión.',
    icon: 'tools',
  },
  {
    to: '/roadmap',
    label: 'Roadmap',
    description: 'Estado del proyecto: tareas, issues y evolución.',
    icon: 'roadmap',
  },
]

export interface Lang {
  code: 'es' | 'en'
  label: string
  available: boolean
}

/** Placeholder del selector de idioma: solo ES por ahora (EN llega con M2). */
export const LANGS: readonly Lang[] = [
  { code: 'es', label: 'ES', available: true },
  { code: 'en', label: 'EN', available: false },
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
