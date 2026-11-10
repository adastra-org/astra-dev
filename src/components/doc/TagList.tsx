import { tagLabel } from '@/config/tags'

/** Chips de tags. Texto con borde, sin color como único portador de significado. */
export function TagList({ tags }: { tags: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Tags">
      {tags.map((t) => (
        <li
          key={t}
          className="text-data text-ink-muted border-border rounded-sm border px-2 py-1 uppercase"
        >
          {tagLabel(t)}
        </li>
      ))}
    </ul>
  )
}
