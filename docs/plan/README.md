# Plan — Astra Dev

Estimaciones en días de trabajo efectivo de una persona con asistencia de Claude. Cada milestone cierra con `bun run check` verde, PR y deploy verificado.

## Orden

Se prioriza lo que entrega valor visible rápido: sitio publicado, luego contenido, luego búsqueda. El sandbox va tarde porque es lo más riesgoso.

| #   | Milestone                       | Versión | Estimación | Depende de |
| --- | ------------------------------- | ------- | ---------- | ---------- |
| M0  | Base y deploy                   | 0.1.0   | 1 día      | —          |
| M1  | Motor de docs                   | 0.2.0   | 3-4 días   | M0         |
| M2  | Contenido y traducción          | 0.3.0   | 2-3 días   | M1         |
| M3  | Ask Ether (búsqueda semántica)  | 0.4.0   | 3 días     | M2         |
| M4  | Sandbox de código               | 0.5.0   | 5-7 días   | M1         |
| M5  | Proyecto: checklist y evolución | 0.6.0   | 3 días     | M0         |

M4 y M5 son independientes de M2/M3 y pueden correr en paralelo.

## M0 — Base y deploy (0.1.0)

- [ ] Tokens del DS de Ad Astra (`design/tokens.json` copiado del DS, nunca editado acá) y `DESIGN.md` que extiende el de `adastra-site`.
- [ ] Shell: layout con sidebar, router, tema oscuro.
- [ ] Repo `adastra-org/astra-dev` en GitHub, ramas `main` + `dev`, branch protection.
- [ ] Nginx `development.adastrarp.com` + workflow `deploy.yml` en el runner `adastra-org`, blue/green, health check 200 real.
- [ ] `ARCHITECTURE.md` del proyecto.

## M1 — Motor de docs (0.2.0)

- [x] Docs en Markdown con frontmatter (título, tags, `related`, `since`). Validado en build; detalle en [`docs-engine/README.md`](../docs-engine/README.md).
- [x] Render con estilos del DS; bloques de código con resaltado (shiki en build, colores por roles) y botón Copiar.
- [x] Historial de cambios por documento (git log del archivo, mostrado en la página). Verificado en dev; `deploy.yml` usa `fetch-depth: 0`, falta comprobarlo en el primer deploy real.
- [x] Referencias cruzadas: `related` en frontmatter + backlinks calculados en build ("Relacionados" y "Usada por"). Los backlinks salen solo de `related`; "uso específico para Y" queda para M2.
- [x] Vista TDA: resumen arriba, secciones colapsables, ejemplo mínimo primero.

## M2 — Contenido y traducción (0.3.0)

- [x] Importar natives desde `citizenfx/natives`, los natives de CFX (`fivem/ext/native-decls`) y `fivem-docs`: importador (7.326 natives, 333 docs, [import/README.md](../import/README.md)) y publicación en el sitio bajo `/natives` ([natives/README.md](../natives/README.md)). Build verificado; falta la pasada en navegador.
- [x] Capa propia: notas de Astra sobre cada native (`content/overrides/natives/`, sin tocar la fuente).
- [~] Traducción ES vía `ds.ts` (deepseek-flash), revisada; marcar `translated: auto|reviewed`: pipeline hecho y probado ([translate/README.md](../translate/README.md)); **sin traducciones generadas** (la cuenta de DeepSeek no tiene saldo) y sin revisar.
- [x] i18n EN/ES en la UI y selector de idioma ([i18n/README.md](../i18n/README.md)). Tests de paridad y de render; falta la pasada en navegador.

## M3 — Ask Ether (0.4.0)

- [x] Búsqueda léxica sin IA: command palette Ctrl+K público (docs por título, resumen y tags, destinos, encabezados), publicado como 0.3.0. Detalle y extensión para IA en [`cmdk/README.md`](../cmdk/README.md). Verificado en navegador (escritorio y 375 px).
- [ ] Índice de embeddings de todas las docs (WeKit `embed_text`), regenerado en build.
- [ ] Búsqueda en lenguaje natural: query a embedding, top-k, resultados con extracto.
- [ ] Respuesta redactada por LLM sobre los resultados (componente Ask Ether de WeKit), con citas a las páginas.
- [x] Rate limit y caché de consultas: rate limit por viewer e IP, presupuesto diario y caché de respuestas (v0.8.0). Ver [server/README.md](../server/README.md#caché-de-respuestas-v080).

Estado de Ask Ether: servidor (v0.4.0, [server/README](../server/README.md)) y panel del chat (v0.8.0, [ask/README](../ask/README.md)) hechos y verificados en local. **Falta verificar contra el embedder real y las cuentas reales** (solo existen en el VPS), por eso los ítems de índice, búsqueda y permisos siguen en `[~]` y los ítems de arriba (índice, búsqueda, respuesta) siguen sin tickear:

- [~] Índice de embeddings: `bun run index` y degradado a palabras clave verificados; el índice semántico real **no** (el embedder solo existe en el VPS). `deploy.yml` lo regenera, sin aplicar.
- [~] Búsqueda en lenguaje natural: `searchDocs` (GraphQL) y recuperación del chat verificados con embedder simulado; falta el ranking con el embedder real.
- [x] Respuesta redactada por LLM con citas: `POST /chat` (SSE, sin herramientas, citas validadas, rechazo fuera de la doc) verificado con tests y contra DeepSeek, y panel del chat (citas como enlaces a las páginas, rechazo, límites, estados, teclado, 375 px) verificado en el navegador. El componente Ask Ether de WeKit no existe: ver [ask/README](../ask/README.md#decisión-componentes-propios).
- [x] Rate limit y caché: rate limit por viewer e IP, presupuesto diario de tokens y caché de respuestas, todo en memoria del proceso (límite conocido: no se comparte entre slots).
- [~] Permisos por `Viewer`: mapeo del payload real de cuentas (`staff` por `role`, `subscriber` por entitlement `tebex-subscriber` vigente) probado con fixtures; falta probarlo contra el endpoint desplegado.

## M4 — Sandbox de código (0.5.0)

Es código no confiable del usuario: revisión de seguridad antes de merge. Detalle en [sandbox/README.md](../sandbox/README.md). Publicado como v0.9.0.

- [x] Decidir runtime: Lua 5.4 en WASM (wasmoon) en un Web Worker, sin server ni contenedor.
- [x] Ejecución aislada con límites de tiempo, memoria, instrucciones y salida; sin red ni filesystem.
- [x] Salida: stdout, errores con línea, tiempo de ejecución, límites alcanzados y crashes.
- [x] Lint y format del snippet (Lua): luaparse con reglas propias y StyLua `CfxLua`.
- [x] Página `/tools` con el playground de Lua (editor, Ejecutar, Revisar, Formatear) y la lista de herramientas que vienen (mapeo, vehículos, conversión de assets). v0.10.1.
- [~] Botón "Ejecutar" en bloques de código marcados en el Markdown (```lua run): implementado con Revisar, Formatear y panel de salida; revisión de seguridad de código hecha ([sandbox/README.md](../sandbox/README.md#revisión-de-seguridad-2026-11-12)), **falta que la repita una persona y la pasada en navegador real** antes de merge.

## M5 — Proyecto: checklist y evolución (0.6.0)

- [~] Integración MyChecklist (`checklist.wefaber.net`) y GitHub Projects, patrón de WePanel. Checklist del plan (`docs/plan/README.md`), milestones de GitHub y lista de MyChecklist por Code Mode hechos y probados con fixtures. GitHub verificado en vivo contra `adastra-org/astra-dev` (2026-11-12); **MyChecklist sin verificar contra el servicio real** (sin token). No se usa la API de GitHub Projects: ver [project/README.md](../project/README.md).
- [x] Panel de evolución: issues, commits, burndown (API de GitHub, caché en server por TTL con ETag y copia vieja). Página `/roadmap` solo para staff.
- [x] Complejidad: métrica por repo (líneas, archivos, churn) con serie temporal en `docs/project/complexity.json`, generada por `bun run complexity`.
- [ ] Más adelante: WeGraph para pesos y relaciones entre decisiones.

## Decisiones abiertas

1. **Sitio estático o con server.** Recomendado: estático (docs generadas en build) más un server mínimo solo para Ask Ether y sandbox. Simplifica M0-M2.
2. **Runtime del sandbox.** Lua es el lenguaje de los resources de FiveM. Opciones: Lua compilado a WASM en el navegador (aísla del server, sin costo de infra) o contenedor Podman rootless con límites (más fiel, más superficie de ataque). Recomendado: WASM primero.
3. **Dónde vive el contenido.** Recomendado: en este repo (`content/`), así el historial es el de git.
4. **Acceso.** Público o solo staff. Afecta rate limit de Ask Ether.

## Fuera de alcance por ahora

- Apolo y WeGraph para hábitos del personal: otro producto.
- Ether dentro del servidor de juego.
