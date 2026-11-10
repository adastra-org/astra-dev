// Tipos del command palette. Sin React: los proveedores y el registro se prueban con `bun test`.
import type { DocMeta, TocItem } from '@/lib/docs/types'

/**
 * Quién puede ver los resultados de un proveedor. `public` es todo el sitio; `subscriber` (lectura)
 * y `staff` (lectura y escritura) llegan con las funciones de IA. Cada nivel incluye al anterior.
 */
export type Permission = 'public' | 'subscriber' | 'staff'

/** Nombre del icono; el componente lo traduce a lucide-react. Así este módulo no importa React. */
export type PaletteIcon =
  | 'home'
  | 'docs'
  | 'tools'
  | 'roadmap'
  | 'doc'
  | 'heading'
  | 'recent'
  | 'sparkles'

export interface PaletteItem {
  /** Estable entre búsquedas: es la `key` de React y la clave de dedupe de recientes. */
  id: string
  title: string
  /** Una línea de contexto (resumen del doc, documento del encabezado). */
  subtitle?: string
  /** Tags (slugs) a mostrar como chips: solo los que coinciden con la consulta. */
  tags?: string[]
  icon: PaletteIcon
  /** Ruta interna a la que navega al elegirlo (puede llevar `#hash`). */
  to?: string
  /** Acción alternativa a `to` (p. ej. abrir un chat). Los ítems solo con `run` no se guardan en recientes. */
  run?: () => void
  /** Lo estampa el registro con el permiso del proveedor; los recientes lo usan para no filtrar de más. */
  permission?: Permission
}

export interface PaletteContext {
  docs: readonly DocMeta[]
  /** Encabezados del documento abierto; vacío fuera de un doc. */
  headings: readonly TocItem[]
  pathname: string
  recents: readonly PaletteItem[]
}

export interface PaletteProvider {
  id: string
  /** Encabezado del grupo en la lista. */
  label: string
  /** Menor primero. Pública: 10 recientes, 20 página actual, 30 ir a, 40 docs. IA: 50 o más. */
  order: number
  permission: Permission
  /**
   * Resultados para `query` (puede ser vacía). Puede devolver una promesa; en ese caso la lista
   * se actualiza cuando llega. Debe respetar `signal`: la consulta puede haber cambiado.
   */
  search(
    query: string,
    ctx: PaletteContext,
    signal: AbortSignal,
  ): PaletteItem[] | Promise<PaletteItem[]>
}

export interface PaletteSection {
  id: string
  label: string
  items: PaletteItem[]
}
