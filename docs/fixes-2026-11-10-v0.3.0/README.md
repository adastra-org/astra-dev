# Correcciones 2026-11-10 (v0.3.0)

Pedido de Faku junto con el command palette: rediseño de la barra superior. Marcas: `[ ]` pendiente, `[~]` parcial (con nota), `[x]` hecho y verificado en el navegador (800, 1280 y 375 px; tema solo oscuro). Reglas en [`DESIGN.md`](../../DESIGN.md), sección "Shell". Pedido textual: "El header debería tener breadcrumbs, quitar el fondo, y hacer pills, no una barra estática. El título (De la página - Astra Dev) no debe estar separado con un borde abajo."

## Header

- [~] Migas de pan: Inicio / Documentación / documento. `nav aria-label="Migas de pan"`, `aria-current="page"` en la última (no es enlace), una línea con puntos suspensivos. Bajo `md` colapsa a "… / actual" (la "…" lleva al nivel superior, `aria-label="Subir a …"`). Medido a 375 px: "…" visible, Inicio y Documentación en `display: none`, la actual truncada (`scrollWidth` mayor que `clientWidth`). Lógica pura con test en `src/lib/crumbs.test.ts`.
  - Parcial: a 375 px la miga actual muestra 81 de 182 px (título largo cortado; `title` con el texto completo para ratón). Se bajó el relleno de la pastilla, pero menú, buscador e idioma ocupan 44 + 44 + 88 px de 343. Para ganar espacio habría que mover el idioma (placeholder) fuera de la fila móvil: decisión de Faku.
  - Nota: la truncación es por puntos suspensivos en una línea; no hay salto de línea, así que ninguna palabra se parte hacia abajo. A 375 px el título largo queda corto ("Cómo…") porque comparte la fila con menú, buscador e idioma; el título completo está en el `h1` justo debajo.
- [x] Sin fondo: el `<header>` mide `background-color` transparente, `border-bottom-width` 0 y sin sombra. Sigue siendo sticky; es `pointer-events-none` y solo las pastillas reciben clics.
- [x] Pastillas, no barra: menú (bajo `lg`), migas, buscador Ctrl+K e idioma, cada una `rounded-pill` con relleno `surface-raised` y sin borde. Activo/hover = relleno (`accent-fill`, `surface-overlay`), sin borde lateral ni subrayado. Alto 44 px bajo `lg` y 40 px desde `lg` (medido: 44 a 375 y 800 px, 40 a 1280 px). El selector de idioma deja de ser un grupo con borde; sus botones pasan de 36 y 28 px a 44 y 40 px (lo marcó el reviewer).
- [x] Sin borde bajo el título: se quitó el `border-b` de la barra superior y el de la fila de marca del sidebar (que se alineaba con ella). `border-bottom-width` medido en 0 px en ambos. El `PageHeader` y el `<title>` no tenían borde; no se tocaron.
  - Interpretación: "el título (De la página - Astra Dev)" se leyó como la franja superior que mostraba la sección y la marca separadas del contenido por una línea. Si Faku se refería a otro elemento, avisar.
- [~] Contenido que pasa por debajo al hacer scroll: las pastillas son opacas, así que su texto siempre es legible. Entre pastillas el contenido se ve tal cual (sin velo), lo que a 1280 px se nota como ruido junto a las pastillas. Es el costo de "sin fondo". Si pesa: header no sticky, o un degradado de `surface` bajo las pastillas.
- [ ] Pastillas en el sidebar: los destinos del sidebar siguen en `rounded-md`. El pedido habla del header; no se cambió.

## Command palette (revisión de diseño)

- [x] Botón del buscador de 40 px entre `md` y `lg`: ahora 44 px bajo `lg`.
- [x] Con el cajón abierto, Esc cerraba cajón y palette a la vez: ahora la capa superior (palette) se cierra sola. Verificado a 375 px: con cajón y palette abiertos, un Esc cierra el palette y el cajón sigue abierto (`aria-expanded` true).
- [x] Teclas del pie sobre el mismo relleno: se quitó el relleno del pie.
- [x] `aria-label` de los tags sin rol, etiqueta "Escape" en inglés, `ease-out` del backdrop, excepción de scrim en `DESIGN.md`.
- [x] Estado "Sin resultados" sin caja punteada: el reviewer pidió la caja de la casa; se dejó sin caja (el panel ya es el único nivel con borde) y la excepción quedó escrita en `DESIGN.md`. Faku puede revertirlo.

## Sin cambiar (señalado por el reviewer)

- [ ] `border-r` del sidebar (divisor de columna) y `rounded-md` del botón de cierre del cajón y de los destinos del sidebar.
- [ ] `src/styles/prose.css`: `blockquote { border-left: 2px }` viene de `dev` y es una franja lateral (regla de la casa). Arreglar en otro PR.
- [ ] El motivo de EN deshabilitado vive solo en `title` de un botón `disabled`: no llega a teclado ni a táctil. Placeholder hasta M2.
