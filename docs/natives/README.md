# Natives publicados (M2)

Los 7.326 natives del importador ([../import/README.md](../import/README.md)) se publican en el sitio bajo `/natives`. Cada uno tiene su página; la búsqueda por nombre o hash está en la página de natives y en el palette (Ctrl+K).

## Rutas

| Ruta                 | Página                                                             |
| -------------------- | ------------------------------------------------------------------ |
| `/natives`           | Buscador por nombre o hash y lista de namespaces (GTA V y CFX)     |
| `/natives/ns/:group` | Natives de un namespace, con filtro                                |
| `/natives/:slug`     | Un native: firma, ejemplo, notas de Astra, descripción, parámetros |

## Cómo se construye

`scripts/natives/plugin.ts` (plugin de Vite) emite archivos estáticos y la app pide solo lo que abre:

- `virtual:astra-natives`: grupos y total. Entra al bundle principal (~50 filas).
- `/data/natives/index.json`: índice de búsqueda en tuplas, se pide al buscar o listar.
- `/data/natives/<slug>.json`: la página de un native, con secciones ya renderizadas.

Cada native se convierte en Markdown y pasa por el mismo motor que un doc (`scripts/natives/render.ts`), así que `DocSection`, el TOC y el resaltado son los mismos.

Entradas: `content/generated/` (salida del importador, no versionada), `content/overrides/natives/` (notas de Astra) y `content/translations/es/` (traducciones). Sin `content/generated` el sitio se construye sin natives y avisa; con `REQUIRE_GENERATED=1` (lo pone el deploy) falla.

## Notas de Astra

Un archivo `content/overrides/natives/<NombreLua>.md` agrega una sección propia al native, aparte del original (que no se toca). La página muestra la etiqueta "Con notas de Astra". Hoy hay dos: `GetEntityCoords` y `SetVehicleDoorOpen`.

## Idioma

Un native con traducción ES (ver [../translate/README.md](../translate/README.md)) se muestra en el idioma de la interfaz; `?lang=en|es` manda sobre el selector. Si no hay traducción, se ve el original en inglés. Límite conocido: el resumen del índice (lista y buscador) es el traducido cuando existe, no hay uno en inglés aparte.

## Verificación

- `bun run build` genera las páginas (7.326 + índice). Verificado.
- Tests de consulta y de rutas en `src/lib/natives/` y `src/routes.test.ts`.
- Pasada en navegador (escritorio y 375 px): pendiente.
