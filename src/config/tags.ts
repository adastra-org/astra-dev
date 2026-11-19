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

export function tagLabel(tag: string): string {
  return (
    LABELS[tag] ??
    (tag.charAt(0).toUpperCase() + tag.slice(1)).replace(/-/g, ' ')
  )
}
