# Importador de natives y docs de FiveM (v0.5.0)

Trae el contenido de tres repos públicos de `citizenfx` al sistema de Astra Dev, normalizado, para que lo consuman el sitio, el índice de Ask Ether y el grafo de WeGraph. Estado: **fase 1 hecha** (importador + pruebas). El resto está en [Fases](#fases).

## Fuentes

Fijadas por sha en [`content-sources.json`](../../content-sources.json); nunca se sigue una rama a ciegas.

| Nombre        | Repo                                    | Qué se toma                           | Cantidad |
| ------------- | --------------------------------------- | ------------------------------------- | -------- |
| `natives`     | `citizenfx/natives`                     | `<NS>/<Nombre>.md` (natives de GTA)   | 6.437    |
| `cfx-natives` | `citizenfx/fivem` (`ext/native-decls`)  | natives de CFX (client/server/shared) | 889      |
| `fivem-docs`  | `citizenfx/fivem-docs` (`content/docs`) | manuales y referencia (Hugo)          | 333      |

`citizenfx/natives` **solo trae los natives de GTA V**. Los de CFX (`GetPlayerIdentifier`, `TriggerClientEvent`...) viven en `fivem/ext/native-decls`, por eso es una fuente aparte. CFX redefine ~75 natives de GTA con el mismo nombre (variantes de servidor): en esos casos ambos llevan sufijo en el slug (`-gta`, `-cfx-server`) y `native_link` apunta al de GTA.

## Uso

```bash
bun run import                      # descarga las fuentes en .cache/import y regenera content/generated/
bun run import --local natives=DIR  # usa una carpeta local en vez de descargar (repetible)
bun run import --lenient            # no falla por archivos que no se pueden convertir
bun run import:update               # sube cada fuente al sha actual de su rama; revisar el diff
```

La descarga es un checkout superficial y parcial por sha (`fivem-docs` pesa 365 MB; se bajan ~4 MB). Tarda ~16 s en frío.

`content/generated/` y `.cache/` están en `.gitignore`: el corpus se regenera, no se commitea. Lo que sí va a git es `content-sources.json` (qué versión de upstream usamos) y `content/overrides/`.

## Salida (`content/generated/`)

| Archivo                         | Contenido                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `manifest.json`                 | shas de las fuentes, conteos, nota de licencia                                                    |
| `natives/index.json`            | una línea por native: `id`, `slug`, `name`, `luaName`, `ns`, `apiset`, `group`, `hashes`, resumen |
| `natives/<fuente>/<grupo>.json` | natives completos. GTA por namespace (`gta/vehicle.json`), CFX por apiset (`cfx/server.json`)     |
| `docs/<slug>.md`                | doc ya convertido, con el frontmatter de Astra (`title`, `summary`, `tags`, `since`, `lang`)      |
| `docs/index.json`               | metadatos de cada doc + `nativeRefs`, `links`, `url` original y `upstream`                        |

Forma de un native: [`scripts/import/types.ts`](../../scripts/import/types.ts). Puntos que importan al consumirlo:

- **`id`** = `<fuente>:<NOMBRE>` (`gta:SET_VEHICLE_DOOR_OPEN`). Es la clave del grafo.
- **`hashes`**: 64 y 32 bits en mayúsculas. En CFX el hash de 32 bits es el joaat del nombre (se calcula; las pruebas lo contrastan con hashes reales de la fuente).
- **`seeAlso`**: enlaces `[X](#_0x…)` del texto, resueltos a ids (841 aristas; 10 hashes sin destino quedan en `unresolved`).
- **El nombre sale de la firma**, no del encabezado: la fuente tiene encabezados vacíos o atrasados (`## _0xE26C…`); el encabezado viejo pasa a `aliases`.
- **`astraNotes`**: capa propia, ver abajo.

Los docs de fivem-docs pierden los shortcodes de Hugo: `alert` pasa a cita, `native_link` a enlace `/natives/<slug>` (y se registra en `nativeRefs`), `code` se inlinea desde `static/examples`, `rmv`/`rmv2` toman su valor de `static/`, `youtube`/`video`/`forum_topic` pasan a enlaces, `article-nav`/`steps` se descartan. Los enlaces entre docs se reescriben a slugs propios (`fivem-<ruta>`), también por `aliases`; los que no existen apuntan a `docs.fivem.net`. Un shortcode desconocido avisa y se quita. Los `.md` vacíos de la fuente (7 hoy) se omiten con aviso.

## Capa propia (overrides)

`content/overrides/natives/<Nombre>.md` (por ejemplo `SetVehicleDoorOpen.md` o `SET_VEHICLE_DOOR_OPEN.md`): el cuerpo Markdown se guarda en `astraNotes`. La fuente no se toca y la nota sobrevive a `import:update`. Un override sin native avisa. Esto cierra el segundo ítem de M2 del plan.

## Licencia

Ninguno de los tres repos declara archivo de licencia (GitHub no detecta ninguna). Es contenido público, y cada registro conserva su procedencia (`upstream`, shas en el manifest). **Decisión de Faku (2026-11-12): se asume abierta**, así que no bloquea publicar el contenido. Se mantiene la atribución y el enlace al original en cada página, y queda pendiente enviar el mail a los mantenedores de `citizenfx` para tener confirmación escrita.

Borrador para el mail:

> Subject: Using citizenfx/natives and fivem-docs content in a community dev-docs site
>
> Hi, we run Ad Astra, a FiveM roleplay server, and are building an internal/community docs site that indexes and searches the content of `citizenfx/natives`, `citizenfx/fivem` (`ext/native-decls`) and `citizenfx/fivem-docs`, with semantic search and Spanish translations. Content is attributed and linked back to the original page. None of the repositories include a license file: could you confirm we may reuse the content this way, and how you would like it attributed? Thanks.

## Fases

| #   | Qué                                                                                                                                           | Estado       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | Importador, conversión de shortcodes, overrides, pruebas                                                                                      | hecha        |
| 2   | CFX como tercera fuente                                                                                                                       | hecha (en 1) |
| 3   | Sitio: páginas y sidebar de natives por namespace (no un chunk de Vite por native)                                                            | pendiente    |
| 4a  | Índice del server: un fragmento por native, búsqueda exacta por nombre/hash, `searchDocs(kind)`, `native(q)`, natives en el contexto del chat | hecha        |
| 4b  | Embeddings offline (PC o Cloudflare) subidos al VPS                                                                                           | pendiente    |
| 5   | Export a WeGraph y acceso en Code Mode                                                                                                        | pendiente    |

### Fase 4a: índice con natives

Detalle en [server/README.md](../server/README.md#índice-semántico). Resultado con el corpus real (índice por palabras clave): 338 docs + 7.326 natives = 10.254 fragmentos, ~10 MB, consultas en 3-7 ms. `GetEntityCoords`, `SET_VEHICLE_DOOR_OPEN` y `0xBB75D38B` devuelven el native exacto primero; "open the door of a vehicle" encuentra `SET_VEHICLE_DOOR_OPEN` por palabras. Una pregunta en español contra docs en inglés **no** funciona por palabras clave: eso lo resuelve la fase 4b (semántica multilingüe).

Cambio en el importador: los slugs de natives no llevan el `_` inicial (1.970 natives sin nombre empiezan por `_`); si dos chocan, el nombre sin `_` conserva el slug y el otro suma `-2`.

`deploy.yml` corre `bun run import` antes de `bun run index`.

### Fase 4b: embeddings fuera del VPS

Decisión: los vectores se calculan en la PC de Faku o en Cloudflare Workers AI y se suben al VPS. El server ya carga un `index.json` con vectores; solo cambia quién lo genera.

- **Riesgo a cerrar antes**: los vectores de documento y la consulta (que se embebe en el VPS con el embedder local) deben venir del mismo modelo y los mismos prefijos de tarea. Prueba de compatibilidad: embeber 50 textos con ambos y exigir coseno ≥ 0,99 entre pares. Si no llega, la consulta también se embebe en Cloudflare o el índice se genera con llama.cpp local con el mismo GGUF que el VPS.
- ~7.300 natives + ~330 docs ≈ 8.000-10.000 fragmentos. A 256 dimensiones en JSON son decenas de MB: conviene guardar los vectores binarios (Float32 en base64 o archivo aparte) y no en el `index.json` de texto.
- `deploy.yml` hoy genera el índice en el runner con el embedder local. Hay que permitir que consuma un índice prebuilt (artefacto) cuando exista.
- Los identificadores (`SET_VEHICLE_DOOR_OPEN`, hashes) no se buscan bien por embeddings: el índice combina coincidencia exacta de nombre/hash con la semántica.

### Fase 5: WeGraph y Code Mode

WeGraph (`wegraph-work/graph-live`) expone hoy tools MCP clásicas (`search_graph`, `get_node`, `query_org_graph`...). **No tiene Code Mode todavía** (no hay rastro en su código ni docs). Code Mode significa que el agente no llama muchas tools sueltas: escribe código contra una API tipada y la ejecuta en un sandbox, con solo dos tools (`search` para descubrir la API y `execute` para correr el código), como hace el MCP de Cloudflare.

Diseño propuesto, para decidir antes de implementar:

- **Nodos**: `native` (por `id`), `namespace`, `doc`, `event`, `concept`. **Aristas**: `belongs_to` (native → namespace), `see_also` (native → native, de `seeAlso`), `mentions` (doc → native, de `nativeRefs`), `links_to` (doc → doc), `overrides` (nota de Astra → native), `redefines` (cfx → gta).
- **API tipada generada** desde `types.ts`: `natives.get(nameOrHash)`, `natives.search(q, {ns, apiset})`, `graph.neighbors(id, edge)`, `docs.get(slug)`. El agente compone: "traé los natives de VEHICLE que mencionan puertas y sus ejemplos" en una sola ejecución en vez de decenas de tool calls.
- El export de esta fase es una función pura del corpus (`corpus → {nodes, edges}`), versionada con el sha de las fuentes, para entrar por el flujo de seeds/`propose_update` de WeGraph.
- Antes de escribirlo hay que leer el esquema real de seeds y el versionado semver de `graph-live` (ADR 0003), porque el corpus entero (≈7.700 nodos) es mucho más grande que lo que carga hoy.

## Pruebas

`bun test scripts/import`: joaat contra hashes reales, parser de natives (firma, hashes, parámetros, anotaciones `cs_type`, encabezado vacío o atrasado, CFX sin hash), shortcodes y enlaces (incluido código y escapados), colisiones GTA/CFX, overrides, archivos rotos sin tapar al resto, determinismo y validación de `content-sources.json`.
