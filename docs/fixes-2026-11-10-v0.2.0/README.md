# Correcciones 2026-11-10 (v0.2.0)

Revisión de Faku sobre el PR del motor de docs. Marcas: `[ ]` pendiente, `[~]` parcial (con nota), `[x]` hecho y verificado en el navegador (escritorio 1440 px y 375 px; el tema es solo oscuro). Reglas escritas en [`DESIGN.md`](../../DESIGN.md), sección "Surfaces and text (explicit rules)".

## Sidebar

- [x] El ítem seleccionado ya no usa borde izquierdo: fondo `surface-raised` + texto `ink`, tanto en destinos como en docs anidados. Se quitó también la guía vertical de la lista de docs. (`Sidebar.tsx`; `border-left-width` medido en 0 px; capturas a 1440 y 375)
- [x] La sección de versión ya no lleva borde superior; se separa por espacio. (`border-top-width` 0 px)

## Texto y contenedores

- [x] Cadena de bordes anidados: un borde por nivel. `Collapsible` pierde el divisor interno; `CodeBlock` pierde el divisor de cabecera; el código, el `pre` anidado y el código en línea dentro de `details`, `Resumen` o tabla quedan sin borde; los chips de tags son relleno, sin borde (vivían dentro de tarjetas con borde). (`prose.css`, `Collapsible`, `CodeBlock`, `TagList`; comprobado con estilos calculados y capturas)
- [x] `Resumen` usaba una franja izquierda de acento (`border-l-4`): ahora borde completo `border-accent`. No estaba en la lista, pero es la misma regla de la casa.
- [x] Texto cortado en seco: el código en línea es `white-space: nowrap` (antes se partía en los `-` de los slugs); se quitó `overflow-wrap: anywhere` de prosa, títulos y asuntos del historial. Los títulos usan `text-wrap: balance`; los párrafos, `pretty`. Un código en línea de más de 36 caracteres sin espacios (`code-long`, lo marca el build) puede partirse como último recurso: el JSON de `flujo-de-deploy` desbordaba la página a 375 px. Medido en los 5 docs a 375 px con todas las secciones abiertas: 0 tokens partidos, `scrollWidth` 375. No hay `break-all` ni `word-break` en el repo. (`markdown.ts` + test)
- [x] Prosa justificada: `.doc-prose p` con `text-align: justify`, `hyphens: manual`, `lang` del doc en el `<article>`. Verificado a 1000 y 1440 px.
  - Decisión: bajo `md` (768 px) queda `start`; la columna de unos 38 caracteres abre huecos al justificar. Documentado en `DESIGN.md`.
- [~] Secciones plegables animadas: alto + opacidad con `::details-content`, `interpolate-size`, `--duration-panel` (180 ms) y `--ease-out-brand` (nuevos en `theme.css`), también al cerrar; el chevron usa la misma duración; sin animación con `prefers-reduced-motion`; el hash que abre una sección vuelve a alinear el scroll al terminar. Verificado: la regla carga, el chevron anima 180 ms, una lectura a mitad de cierre dio un alto intermedio (284 px entre 418 y 46) y la sección abre y muestra su contenido a 375 px. **No verificado**: el cuadro a cuadro de apertura y cierre completos (el panel del navegador no renderiza frames de forma continua) ni `prefers-reduced-motion` ni Firefox/Safari (abren al instante por diseño). Probar a mano en Chrome.
- [x] Guía de secciones (TOC). Qué se vio: a `xl` (1440 px) el TOC fijo no crece ni se mueve al abrir una sección (alto 196 px, `top` 80 px antes y después). La parte inestable era la de menos de `xl`: un bloque plegable ("En esta página") que al abrirlo crecía como desplegable y empujaba el contenido. Ahora es una fila de chips de altura fija (48 px) con desplazamiento horizontal. El TOC fijo también pierde el borde lateral: el activo se marca con fondo y color. (`Toc.tsx`)

## Proceso

- [x] Reglas explícitas en `DESIGN.md`. El README del DS (`adastra-site/docs/brand/README.md`) no las trae; la fuente son las reglas de la casa ("Surfaces and text").
- [x] Enlazado desde `docs/README.md`.
- [x] Reviewer `wefaber-house:design-conformance-reviewer` (dos pasadas, 0 bloqueantes). Aplicado: duraciones del drawer y de las transiciones de color a los tokens (`--duration-panel` / `--duration-fast`), icono del destino activo en `accent`, hover del TOC sin el mismo fondo que el activo, constante nombrada en `reveal.ts`, `DESIGN.md` (Resumen con borde completo; escala de duraciones documentada como propia de `theme.css`).
  - Descartado: "el borde del código en línea anidado no se quita por especificidad". Medido con estilos calculados: dentro de `details` y de tabla el borde es transparente (los dos selectores empatan en especificidad y el posterior gana).
  - Pendiente: chips del índice móvil sin estado activo (la fila no es fija en pantalla, resaltar no aporta); duraciones fuera de `design/tokens.json` (mover al DS es decisión de Faku).

## Pendiente / a revisar

- [ ] Con un doc activo, el destino "Documentación" y el doc quedan ambos con fondo. Se dejó así (contexto de sección); si pesa, `end` en el destino.
- [ ] Animación de plegables: prueba manual en Chrome (ver arriba).
