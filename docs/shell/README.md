# Shell (M0, v0.1.0)

Layout base de Astra Dev: sidebar, barra superior y área de contenido, con router y tema oscuro. Reglas visuales en [`DESIGN.md`](../../DESIGN.md).

## Rutas

| Ruta          | Página               | Estado                         |
| ------------- | -------------------- | ------------------------------ |
| `/`           | `pages/Home.tsx`     | Portada                        |
| `/docs`       | `pages/Docs.tsx`     | Índice por tag con filtro (M1) |
| `/docs/:slug` | `pages/Doc.tsx`      | Doc real o 404 de doc (M1)     |
| `/tools`      | `pages/Tools.tsx`    | Placeholder                    |
| `/roadmap`    | `pages/Roadmap.tsx`  | Placeholder                    |
| `*`           | `pages/NotFound.tsx` | 404                            |

El árbol está en `src/routes.tsx` (`createBrowserRouter` en `src/App.tsx`). La navegación (etiquetas, descripciones, íconos) vive en `src/config/nav.ts` y es la única fuente para el sidebar, la barra superior y la portada.

Para agregar una sección: una entrada en `NAV`, una ruta en `routes.tsx` y un ícono en `ICONS` de `Sidebar.tsx`. `src/routes.test.ts` falla si un ítem de `NAV` no resuelve a su propia ruta.

## Estructura

```
src/
  App.tsx                    RouterProvider
  routes.tsx                 árbol de rutas
  config/nav.ts              NAV, LANGS, navFor()
  components/shell/          Shell, Sidebar, TopBar, LangSwitch
  components/doc/            PageHeader, Summary, Collapsible, CodeBlock, Placeholder
  pages/                     una por ruta
  lib/tokens.ts              resolución de tokens y contraste (copia de adastra-site)
  lib/title.ts               useTitle()
  styles/tokens.css          GENERADO (bun run tokens)
  styles/theme.css           roles a Tailwind (@theme) y escala tipográfica
  styles/fonts.css           fuentes self-hosted
design/tokens.json           copia del DS de Ad Astra, no se edita acá
scripts/tokens.ts            genera tokens.css
```

## Tokens

```bash
bun run tokens
```

Lee `design/tokens.json` y escribe `src/styles/tokens.css` (tema Void en `:root`, Dawn en `[data-theme="light"]`, que el sitio no usa). Para actualizar: cambiar el token en el DS, copiar el `tokens.json` de `adastra-site` y volver a correr el script. `src/lib/tokens.test.ts` mide el contraste de cada par en ambos temas.

## Responsive

- `lg` (1024 px) y más: sidebar fijo de 16 rem, sticky.
- Menos de `lg`: el sidebar es un cajón sobre el contenido con scrim. Se cierra con Esc, el scrim, el botón de cerrar o al navegar. Cerrado no recibe foco.
- Probado a 375 px: sin scroll horizontal de página.

## Selector de idioma

Placeholder. ES activo, EN deshabilitado. No guarda estado ni cambia textos; la i18n llega en M2.

## Pendiente

- Resaltado de sintaxis, render de Markdown y botón de volver arriba: hechos en M1, ver [`docs-engine/README.md`](../docs-engine/README.md).
- Búsqueda léxica Ctrl+K: hecha, ver [`cmdk/README.md`](../cmdk/README.md). La búsqueda semántica y Ask Ether siguen en M3.

## Barra superior (v0.3.0)

Ya no es una barra: son pastillas flotantes sin fondo ni borde (menú bajo `lg`, migas de pan, buscador Ctrl+K, idioma). Cada pastilla lleva su relleno; el espacio entre ellas es el único separador con el contenido. Las migas salen de la ruta (`src/lib/crumbs.ts`, con test) y bajo `md` colapsan a "… / actual". Reglas en [`DESIGN.md`](../../DESIGN.md), sección "Shell".
