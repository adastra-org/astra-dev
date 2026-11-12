# Proyecto: checklist y evolución (M5, v0.10.0)

La página **Roadmap** (`/roadmap`) muestra qué está hecho, qué falta y cómo crece el código. Todo sale del server: GitHub, el plan del repo y MyChecklist. Solo la ve el staff (el repo es privado y la checklist es interna).

## De dónde sale cada dato

| Sección     | Fuente                                                                                              | Si la fuente falla                                             |
| ----------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Estado      | Totales del plan, de issues/PRs y de commits                                                        | Cada tarjeta queda en `—`; el resto de la página sigue         |
| Checklist   | `docs/plan/README.md` de la rama configurada, milestones de GitHub (por prefijo `Mx`) y MyChecklist | Aviso con Reintentar; se sigue sirviendo la última copia buena |
| Evolución   | Issues, PRs y commits de los últimos 90 días, y milestones para el burndown                         | Aviso con Reintentar; la sección no se vacía                   |
| Complejidad | `docs/project/complexity.json` del repo                                                             | "Todavía no hay serie" (no es un error)                        |

Nada se guarda en el navegador: la página solo pide `project { checklist, evolution, complexity }` por GraphQL y pinta la respuesta. El detalle del server está en [server/README.md](../server/README.md).

## Checklist

- **Plan.** `server/src/project/plan.ts` lee `docs/plan/README.md` en GitHub y arma un grupo por milestone (`## M5 — Título (0.10.0)`) con sus ítems: `[ ]` pendiente, `[~]` parcial, `[x]` hecho. Los ítems que van después de un párrafo quedan en un grupo con ese párrafo como etiqueta. El archivo se lee en cada refresco de caché, así que tickear el plan no necesita deploy.
- **Milestones de GitHub.** Los que empiezan con `M5` (o `M4:`…) se enlazan con el milestone del plan; muestran abiertos/cerrados, vencimiento y enlace.
- **MyChecklist** (`checklist.wefaber.net`). Adaptador de solo lectura por Code Mode (`POST /codemode/execute`) con un token `mck_…` en modo `read`. Se elige una lista por nombre (`MYCHECKLIST_LIST`); los ítems de primer nivel son grupos y sus hijos, los checkboxes. Los que no tienen hijos van a "Sin grupo".
  - El script del servidor viaja como código al sandbox de MyChecklist; el nombre de la lista entra como JSON, nunca concatenado.
  - Sin token, la fuente queda `disabled` y la página lo dice; un fallo de red o de la API queda `error`, y una lista inexistente, `not_found`. Nunca lanza: el resto de la checklist se pinta igual.

## Evolución

`server/src/project/evolution.ts` es puro: recibe issues, PRs, commits y milestones, y devuelve la serie diaria (fechas UTC) y el burndown.

| Dato        | Cómo                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Diario      | Abiertos, cerrados, commits por día e issues abiertos al cierre de cada día                             |
| Totales     | Issues abiertos/cerrados, PRs abiertos/mergeados y commits dentro de la ventana                         |
| Burndown    | Issues abiertos por día del milestone elegido (o del único abierto) y una recta ideal al vencimiento    |
| Ventana     | 7, 30 o 90 días; el máximo es 90. Los commits se piden con `since`, los issues se truncan a 1.000       |
| `truncated` | `true` si el repo tiene más issues/PRs/commits de los que el server lee: se avisa, no se finge el total |

La primera carga pide todas las páginas; después el refresco usa `If-None-Match`, así que un repo sin cambios cuesta un `304` (no cuenta contra el rate limit de GitHub).

## Complejidad

`bun run complexity` mide el repo desde objetos de git (nunca desde el working tree) y agrega o reemplaza el punto del día en `docs/project/complexity.json`:

| Campo      | Qué es                                                    |
| ---------- | --------------------------------------------------------- |
| `files`    | Archivos versionados en ese commit                        |
| `lines`    | Líneas de código, estilos, scripts y configuración        |
| `docLines` | Líneas de Markdown                                        |
| `churn`    | Líneas agregadas + borradas en los 7 días hasta esa fecha |
| `sha`      | Commit medido                                             |

```bash
bun run complexity                     # punto de HEAD, o lo reemplaza si ya existe el del día
bun run complexity -- --backfill       # un punto por semana ISO de historia, más HEAD
bun run complexity -- --backfill --step daily
```

El archivo se commitea: la página lo lee de la rama, no lo calcula en el server. Sin serie, la sección explica cómo generarla.

## Acceso y seguridad

- `project` es **staff only**: anónimo recibe `unauthenticated`, cualquier otro rol `staff_required`. El chequeo va una vez, en el campo `project`; los subcampos cargan por separado para que una fuente caída no blanquee la página.
- El token de GitHub es de **solo lectura** y solo viaja en el header `Authorization` a `api.github.com`; no se loguea, no se devuelve y no aparece en errores. Sin token, el módulo queda apagado (`project_unavailable`).
- El de MyChecklist es `mck_…` en modo `read` y exige `https` (o loopback en desarrollo). Si falta, la sección de checklist externa queda `disabled`.
- Rate limit por viewer (`RATE_PROJECT_VIEWER_PER_MIN`, 30 por minuto).
- Los datos no son por viewer: es el mismo repo para todo el staff, y se cachean en el proceso por `PROJECT_CACHE_TTL_SECONDS` (300 s).

## Variables de entorno

| Variable                      | Defecto                         | Notas                                              |
| ----------------------------- | ------------------------------- | -------------------------------------------------- |
| `ASTRA_GITHUB_TOKEN`          | —                               | **Secreto**. Sin él, el módulo no se enciende      |
| `PROJECT_REPO`                | `adastra-org/astra-dev`         | `owner/name`                                       |
| `PROJECT_REF`                 | `dev`                           | Rama de la que se leen plan, complejidad y commits |
| `PROJECT_PLAN_PATH`           | `docs/plan/README.md`           | Relativo al repo                                   |
| `PROJECT_COMPLEXITY_PATH`     | `docs/project/complexity.json`  | Relativo al repo                                   |
| `PROJECT_CACHE_TTL_SECONDS`   | 300                             | 10 a 3600                                          |
| `RATE_PROJECT_VIEWER_PER_MIN` | 30                              | Ventana deslizante de 60 s                         |
| `GITHUB_API_URL`              | `https://api.github.com`        | Para pruebas con un GitHub falso                   |
| `MYCHECKLIST_URL`             | `https://checklist.wefaber.net` | `https` si hay token                               |
| `MYCHECKLIST_TOKEN`           | —                               | **Secreto**. `mck_…` en modo `read`                |
| `MYCHECKLIST_LIST`            | `Ad Astra`                      | Lista que se muestra                               |

Un valor inválido hace fallar el arranque con el listado de problemas. En el VPS van en `~/deploy/env/astra-dev.env` (modo 600).

## Archivos

| Archivo                             | Qué hace                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `server/src/project/github.ts`      | Cliente REST de solo lectura, con timeout, paginado y ETag                    |
| `server/src/project/plan.ts`        | Parser del plan (milestones y checkboxes)                                     |
| `server/src/project/evolution.ts`   | Serie diaria, totales y burndown (puro)                                       |
| `server/src/project/complexity.ts`  | Valida la serie commiteada; fuera de forma, `null`                            |
| `server/src/project/mychecklist.ts` | Adaptador de Code Mode y agrupado de ítems                                    |
| `server/src/project/service.ts`     | Caché por TTL, permisos y rate limit                                          |
| `server/src/project/schema.ts`      | GraphQL: `project.checklist`, `project.evolution(days)`, `project.complexity` |
| `scripts/project/complexity.ts`     | Mide el repo desde git y escribe la serie                                     |
| `src/pages/Roadmap.tsx`             | Página `/roadmap`                                                             |
| `src/components/project/`           | Checklist, evolución, complejidad y gráficos                                  |
| `docs/project/complexity.json`      | Serie commiteada                                                              |

## Estado de verificación

- **Verificado con tests**: parser del plan, agrupado de MyChecklist, cálculo de evolución y burndown, cliente de GitHub (paginado, ETag, timeout, errores), caché con copia vieja, permisos, rate limit y el script de complejidad. `bun run check` en verde.
- **No verificado contra los servicios reales**: no había token de GitHub ni de MyChecklist al escribir esto. El adaptador de MyChecklist se probó contra un `fetch` falso con la forma documentada en su repo (ADR 0010 y 0013). Antes de darlo por cerrado hay que correrlo en el VPS con los tokens reales y mirar una lista y un milestone reales.
- **GitHub Projects**: no se usa la API de Projects (v2). El checklist se apoya en el plan del repo y en milestones de issues. Si hace falta el tablero de WePanel, es otro adaptador.

## Límites conocidos

- La caché es por proceso y los dos slots (blue/green) no la comparten; durante un deploy se paga un refresco por slot.
- El tope de lectura es 1.000 issues, 500 PRs y 1.000 commits; pasado eso, `truncated` avisa.
- La ventana máxima es 90 días: no hay histórico anual en la página (sí en `complexity.json` si se hace backfill).
- Sin MyChecklist, la checklist externa queda vacía con `status: disabled`; no se cae la página.
