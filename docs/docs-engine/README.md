# Motor de docs (M1, v0.2.0)

Los documentos son archivos Markdown en `content/docs/`. Un plugin de Vite los valida y renderiza en el build; la app solo pinta el resultado. No hay servidor ni base de datos: el historial de cada doc es el `git log` de su archivo.

## Cómo agregar un doc

1. Crea `content/docs/<slug>.md`. El nombre sin `.md` es el slug y la URL (`/docs/<slug>`). Minúsculas, números y guiones; único en todo `content/docs` (las subcarpetas organizan, no forman parte del slug).
2. Escribe el frontmatter (abajo) y el cuerpo.
3. Corre `bun run check`. Un frontmatter inválido o un slug repetido rompe el build y el mensaje dice qué archivo y qué campo.
4. Abre `bun run dev` y revisa `/docs/<slug>`: el servidor recarga al guardar.

Plantilla mínima:

```md
---
title: Dibujar texto en pantalla
summary: Qué hace, cuándo usarlo y el error más común, en dos o tres líneas.
tags: [natives]
related: [glosario]
since: 0.2.0
---

Una o dos frases de contexto.

## Ejemplo mínimo

(el código más corto que funciona)

## Detalle

Explicación, parámetros y notas.
```

## Frontmatter

| Clave     | Tipo            | Obligatoria | Notas                                                                     |
| --------- | --------------- | ----------- | ------------------------------------------------------------------------- |
| `title`   | texto           | sí          | Título de la página y del sidebar                                         |
| `summary` | texto           | sí          | Recuadro "Resumen" arriba de todo y tarjeta del índice. Una a tres líneas |
| `tags`    | lista de textos | sí (≥ 1)    | `^[a-z0-9]+(-[a-z0-9]+)*$`. El **primer tag** es el grupo del índice      |
| `related` | lista de slugs  | no          | Slugs de otros docs. De acá salen "Relacionados" y los backlinks          |
| `since`   | texto `X.Y.Z`   | sí          | Versión desde la que aplica                                               |
| `lang`    | `es` \| `en`    | no          | Por defecto `es`                                                          |

- Una clave que no esté en la tabla falla (un typo no pasa en silencio).
- Es YAML: un valor con `: ` (dos puntos y espacio) va entre comillas.
- Etiquetas con tilde para mostrar: `src/config/tags.ts` (`diseno` se muestra "Diseño"). Un tag sin entrada se muestra con mayúscula inicial.

## Qué hace el build

| Qué                  | Cómo                                                                                                     | Falla o avisa                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Validación           | `scripts/docs/loader.ts` + `frontmatter.ts`: frontmatter tipado, slug del nombre de archivo              | **Falla** con frontmatter inválido, slug duplicado o `#` en el cuerpo |
| `related` roto       | `scripts/docs/backlinks.ts`                                                                              | **Avisa** (slug inexistente o el propio doc)                          |
| Enlaces internos     | `[x](/docs/slug)` en el cuerpo                                                                           | **Avisa** si el slug no existe                                        |
| Markdown a secciones | `scripts/docs/markdown.ts` (`marked`): intro, secciones por `##`, índice, anclas                         | HTML crudo se escapa                                                  |
| Resaltado            | `scripts/docs/highlight.ts` (`shiki`, motor JS): colores por variables `--code-token-*` mapeadas a roles | Lenguaje desconocido: texto plano                                     |
| Historial            | `scripts/docs/history.ts`: `git log --follow` por archivo (sha corto, fecha, asunto)                     | Sin git o clon superficial: la página lo indica                       |
| Backlinks            | Se invierte `related` en el build ("Usada por")                                                          | —                                                                     |

Módulos virtuales (`scripts/docs/plugin.ts`):

- `virtual:astra-docs`: metadatos de todos los docs y un `loaders` con un `import()` por slug. Entra al bundle principal (lo usan el sidebar y el índice).
- `virtual:astra-doc/<slug>`: secciones, índice e historial de un doc. Un chunk por documento, se carga al abrir la página.

Lenguajes resaltados: `lua`, `bash`, `typescript`, `tsx`, `javascript`, `json`, `yaml`, `markdown`, `sql`, `css`, `html`, `diff`, `toml`, `csharp` (y sus alias `sh`, `ts`, `js`, `yml`, `md`, `cs`). Para agregar uno, súmalo a `LANGS` en `highlight.ts`.

Un bloque `lua` con el flag `run` en la línea del fence (` ```lua run `) se marca como ejecutable y la página muestra Ejecutar, Revisar y Formatear ([sandbox](../sandbox/README.md)). El idioma se sigue leyendo de la primera palabra del fence; el flag solo se mira en `lua`.

## Vista TDA

Pensada para leer en medio de una tarea:

1. **Resumen primero**: el `summary` del frontmatter va en un recuadro antes de cualquier sección.
2. **Ejemplo mínimo primero**: la sección `## Ejemplo mínimo` se sube justo después de la introducción y va siempre abierta, esté donde esté en el archivo. Ver la convención abajo.
3. **Secciones largas plegadas**: cada `##` de más de 120 palabras (`COLLAPSE_WORDS` en `markdown.ts`) llega cerrada y se abre con un clic, animando alto y opacidad (sin animación con `prefers-reduced-motion`); las cortas se muestran directas.
4. **Índice**: columna fija a la derecha desde 1280 px; debajo, una fila de chips con desplazamiento horizontal, de altura fija. Nunca crece ni empuja el contenido al abrir una sección. Se omite con menos de tres entradas.
5. **Al final**: Relacionados, Usada por e Historial de cambios (plegado).

Un enlace con ancla (`/docs/x#seccion`) abre las secciones plegadas que contienen el encabezado.

### Convención "ejemplo mínimo"

- El título es exactamente `## Ejemplo mínimo` (se compara sin tildes ni mayúsculas).
- Contiene el fragmento más corto que funciona, normalmente un bloque de código, con una línea de contexto como máximo.
- La explicación va en las secciones siguientes, no en esta.
- Si el doc no tiene nada que ejecutar (un glosario), no se escribe la sección.

## Estructura

```
content/docs/*.md             contenido (ver content/README.md)
scripts/docs/
  frontmatter.ts              separación y validación del frontmatter
  loader.ts                   carga de content/docs, slugs, backlinks, enlaces rotos
  backlinks.ts                backlinks y avisos de related
  history.ts                  git log por archivo
  markdown.ts                 Markdown a secciones (marked)
  highlight.ts                resaltado (shiki)
  plugin.ts                   plugin de Vite (módulos virtuales)
  docs.test.ts                pruebas del motor
scripts/test-setup.ts         sirve virtual:astra-docs en bun test
src/lib/docs/types.ts         tipos compartidos build / app
src/lib/docs.ts               acceso a los módulos virtuales
src/lib/docs-query.ts         agrupar por tag, filtrar, resolver slugs
src/components/doc/           DocSection, Toc, DocFooter, CodeBlock, Collapsible, Summary, TagList, BackToTop
src/pages/Docs.tsx            índice agrupado por tag con filtro
src/pages/Doc.tsx             página de un doc (y 404 de doc)
src/styles/prose.css          estilos del contenido y colores del resaltado
```

## Historial y CI

El historial usa `git log --follow` sobre cada archivo. Un clon superficial lo truncaría y mentiría, así que el build lo detecta (`git rev-parse --is-shallow-repository`) y la página dice que no está disponible en vez de mostrar una lista incompleta. `deploy.yml` hace `actions/checkout` con `fetch-depth: 0` para que el sitio publicado tenga el historial completo.

Un archivo recién creado, sin commits, muestra "Este archivo todavía no tiene commits".

## Pruebas

`bun test` cubre el loader (frontmatter válido e inválido, slugs duplicados, claves desconocidas), el cálculo de backlinks, el parseo de `git log` y la degradación del historial, el render de Markdown (secciones, ejemplo mínimo, anclas, HTML crudo escapado, enlaces), el filtro del índice y el contraste de los colores del resaltado. Una prueba valida además todos los docs reales de `content/docs`.

## Límites conocidos

- Un solo nivel de agrupación (primer tag) y listas completas en el sidebar: con miles de docs (natives, M2) habrá que paginar o agrupar el sidebar.
- Los backlinks salen solo de `related`, no de enlaces en el cuerpo.
- El bloque de código anidado (dentro de una lista o cita) se resalta pero no lleva botón Copiar.
- `lang` se valida y se guarda; el selector de idioma llega en M2.
