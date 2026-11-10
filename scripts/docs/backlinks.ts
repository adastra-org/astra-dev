// Referencias cruzadas: `related` declarado + backlinks calculados.

interface Linked {
  slug: string
  related: readonly string[]
}

/**
 * Para cada doc, los slugs que lo declaran en su `related` ("Usada por").
 * Ignora `related` que apunta a un slug inexistente o a sí mismo. Orden estable (por slug).
 */
export function computeBacklinks(
  docs: readonly Linked[],
): Record<string, string[]> {
  const known = new Set(docs.map((d) => d.slug))
  const out: Record<string, string[]> = Object.fromEntries(
    docs.map((d) => [d.slug, [] as string[]]),
  )
  for (const d of docs) {
    for (const r of d.related) {
      if (r !== d.slug && known.has(r)) out[r]?.push(d.slug)
    }
  }
  for (const list of Object.values(out)) list.sort()
  return out
}

/** Avisos de `related` rotos: slug inexistente o autorreferencia. */
export function relatedWarnings(docs: readonly (Linked & { path: string })[]) {
  const known = new Set(docs.map((d) => d.slug))
  const out: string[] = []
  for (const d of docs) {
    for (const r of d.related) {
      if (r === d.slug)
        out.push(
          `${d.path}: \`related\` se refiere al propio documento ("${r}")`,
        )
      else if (!known.has(r))
        out.push(
          `${d.path}: \`related\` apunta a "${r}", que no existe en content/docs`,
        )
    }
  }
  return out
}
