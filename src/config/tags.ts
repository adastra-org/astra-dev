// Etiquetas legibles de los tags de los docs. Los tags del frontmatter son ASCII en kebab;
// acá van con tilde y mayúscula. Un tag sin entrada se muestra con la primera letra en mayúscula.

const LABELS: Record<string, string> = {
  diseno: 'Diseño',
  guia: 'Guía',
  deploy: 'Deploy',
  proyecto: 'Proyecto',
  contenido: 'Contenido',
  referencia: 'Referencia',
}

const LABELS_EN: Record<string, string> = {
  diseno: 'Design',
  guia: 'Guide',
  deploy: 'Deploy',
  proyecto: 'Project',
  contenido: 'Content',
  referencia: 'Reference',
}

/** Etiqueta del tag en el idioma de la interfaz (español por defecto). */
export function tagLabel(tag: string, lang: 'es' | 'en' = 'es'): string {
  return (
    (lang === 'en' ? LABELS_EN[tag] : undefined) ??
    LABELS[tag] ??
    (tag.charAt(0).toUpperCase() + tag.slice(1)).replace(/-/g, ' ')
  )
}
