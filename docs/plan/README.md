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
- [ ] Rate limit y caché de consultas.

Estado del server de Ask Ether (v0.4.0, [server/README](../server/README.md)). Mitad servidor hecha; falta la UI del chat y verificar contra el embedder real y las cuentas reales. Se ticka el ítem de arriba cuando esté completo (servidor + UI):

- [~] Índice de embeddings: `bun run index` y degradado a palabras clave verificados; el índice semántico real **no** (el embedder solo existe en el VPS). `deploy.yml` lo regenera, sin aplicar.
- [~] Búsqueda en lenguaje natural: `searchDocs` (GraphQL) y recuperación del chat verificados con embedder simulado; falta el ranking con el embedder real.
- [~] Respuesta redactada por LLM con citas: `POST /chat` (SSE, sin herramientas, citas validadas, rechazo fuera de la doc) verificado con tests y a mano contra DeepSeek; falta el panel en la UI.
- [~] Rate limit y caché: rate limit por viewer e IP y presupuesto diario de tokens hechos (en memoria); **falta la caché**.
- [~] Permisos por `Viewer`: mapeo del payload real de cuentas (`staff` por `role`, `subscriber` por entitlement `tebex-subscriber` vigente) probado con fixtures; falta probarlo contra el endpoint desplegado.

## M4 — Sandbox de código (0.5.0)

Es código no confiable del usuario: revisión de seguridad antes de merge.

- [ ] Decidir runtime (ver decisiones abiertas).
- [ ] Ejecución aislada con límites de tiempo y memoria; sin red ni filesystem.
- [ ] Salida: stdout, errores, tiempo de ejecución.
- [ ] Lint y format del snippet (Lua).
- [ ] Botón "Ejecutar" en bloques de código marcados en el Markdown.

## M5 — Proyecto: checklist y evolución (0.6.0)

- [ ] Integración MyChecklist (`checklist.wefaber.net`) y GitHub Projects, patrón de WePanel.
- [ ] Panel de evolución: issues, commits, burndown (API de GitHub, caché en server).
- [ ] Complejidad: métrica por repo (líneas, archivos, churn) con serie temporal.
- [ ] Más adelante: WeGraph para pesos y relaciones entre decisiones.

## Decisiones abiertas

1. **Sitio estático o con server.** Recomendado: estático (docs generadas en build) más un server mínimo solo para Ask Ether y sandbox. Simplifica M0-M2.
2. **Runtime del sandbox.** Lua es el lenguaje de los resources de FiveM. Opciones: Lua compilado a WASM en el navegador (aísla del server, sin costo de infra) o contenedor Podman rootless con límites (más fiel, más superficie de ataque). Recomendado: WASM primero.
3. **Dónde vive el contenido.** Recomendado: en este repo (`content/`), así el historial es el de git.
4. **Acceso.** Público o solo staff. Afecta rate limit de Ask Ether.

## Fuera de alcance por ahora

- Apolo y WeGraph para hábitos del personal: otro producto.
- Ether dentro del servidor de juego.
