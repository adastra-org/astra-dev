import { tagLabel } from '@/config/tags'

/** Chips de tags: fondo, sin borde (viven dentro de tarjetas con borde propio). El texto lleva el significado. */
export function TagList({ tags }: { tags: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Tags">
      {tags.map((t) => (
        <li
          key={t}
          className="text-data text-ink-muted bg-surface-sunken rounded-sm px-2 py-1 whitespace-nowrap uppercase"
        >
          {tagLabel(t)}
        </li>
      ))}
    </ul>
  )
}
