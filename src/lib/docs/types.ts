// Tipos compartidos entre el build (scripts/docs) y la app (src). Solo tipos: sin código.

export type DocLang = 'es' | 'en'

/** Metadatos de un documento (frontmatter validado + datos calculados en build). */
export interface DocMeta {
  /** Nombre del archivo sin `.md`. Único en todo `content/docs`. */
  slug: string
  title: string
  summary: string
  /** El primer tag es el grupo del índice. */
  tags: string[]
  /** Slugs de documentos relacionados (en el orden del frontmatter). */
  related: string[]
  /** Versión de Astra Dev (o del servidor) desde la que aplica. */
  since: string
  lang: DocLang
  /** Slugs de los documentos que declaran a este en su `related`. Calculado. */
  backlinks: string[]
  /** Ruta del archivo desde la raíz del repo. */
  path: string
}

export type Block =
  | { type: 'html'; html: string }
  | {
      type: 'code'
      lang: string
      code: string
      html: string
      /** `lua run` en el Markdown: el bloque se puede ejecutar en el sandbox (M4). */
      runnable?: boolean
    }

export type SectionKind = 'intro' | 'example' | 'section'

export interface Section {
  /** `null` solo en la introducción (lo que va antes del primer `##`). */
  id: string | null
  title: string | null
  kind: SectionKind
  /** Secciones largas van plegadas por defecto. */
  collapsible: boolean
  blocks: Block[]
  words: number
}

export interface TocItem {
  id: string
  title: string
  depth: 2 | 3
}

export interface HistoryEntry {
  /** SHA corto. */
  sha: string
  /** Fecha del commit, `YYYY-MM-DD`. */
  date: string
  subject: string
}

export interface History {
  /** `false` si no hubo git o el repo es superficial: la página lo avisa. */
  available: boolean
  entries: HistoryEntry[]
}

/** Contenido de un documento: lo que carga la página bajo demanda. */
export interface DocContent {
  sections: Section[]
  toc: TocItem[]
  history: History
}
