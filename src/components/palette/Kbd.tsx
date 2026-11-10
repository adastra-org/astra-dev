/** Tecla como etiqueta: relleno, sin borde (vive dentro de contenedores con borde propio). */
export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="text-data text-ink-muted bg-surface-sunken grid h-6 min-w-6 place-items-center rounded-sm px-1.5 whitespace-nowrap">
      {children}
    </kbd>
  )
}

/** Lo que dice el lector de pantalla para un atajo (las teclas visuales van en `aria-hidden`). */
export function Shortcut({
  keys,
  label,
}: {
  keys: readonly string[]
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="inline-flex items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </span>
  )
}
