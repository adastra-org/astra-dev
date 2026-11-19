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

| #   | Qué                                                                                                                                           | Estado                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | Importador, conversión de shortcodes, overrides, pruebas                                                                                      | hecha                                                                        |
| 2   | CFX como tercera fuente                                                                                                                       | hecha (en 1)                                                                 |
| 3   | Sitio: páginas y sidebar de natives por namespace (no un chunk de Vite por native)                                                            | pendiente                                                                    |
| 4a  | Índice del server: un fragmento por native, búsqueda exacta por nombre/hash, `searchDocs(kind)`, `native(q)`, natives en el contexto del chat | hecha                                                                        |
| 4b  | Embeddings offline (PC o Cloudflare) subidos al VPS                                                                                           | hecha (código); falta la prueba de compatibilidad contra el embedder del VPS |
| 5   | Export a WeGraph y acceso en Code Mode                                                                                                        | pendiente                                                                    |

### Fase 4a: índice con natives

Detalle en [server/README.md](../server/README.md#índice-semántico). Resultado con el corpus real (índice por palabras clave): 338 docs + 7.326 natives = 10.254 fragmentos, ~10 MB, consultas en 3-7 ms. `GetEntityCoords`, `SET_VEHICLE_DOOR_OPEN` y `0xBB75D38B` devuelven el native exacto primero; "open the door of a vehicle" encuentra `SET_VEHICLE_DOOR_OPEN` por palabras. Una pregunta en español contra docs en inglés **no** funciona por palabras clave: eso lo resuelve la fase 4b (semántica multilingüe).

Cambio en el importador: los slugs de natives no llevan el `_` inicial (1.970 natives sin nombre empiezan por `_`); si dos chocan, el nombre sin `_` conserva el slug y el otro suma `-2`.

`deploy.yml` corre `bun run import` antes de `bun run index`.

### Fase 4b: embeddings fuera del VPS

Decisión: los vectores se calculan en la PC de Faku o en Cloudflare Workers AI y se suben al VPS. El server solo cambia en cómo lee el índice; quién lo genera es indistinto.

**Formato (índice v3)**: `index.json` (solo texto, ~10 MB) más `index.vec` (Float32 little-endian, 256 dims × 10.254 fragmentos = 10,5 MB). El JSON lleva `vectors: {file, bytes, hash}`; el server rechaza un `.vec` de otra generación (hash) o truncado. Cargar el par tarda ~130 ms.

**Reutilización**: `REUSE_FROM=<index.json previo>` toma los vectores de cada fragmento cuyo texto embebido no cambió (clave = hash del prompt de documento) y solo embebe el resto. Un doc editado nunca recibe un vector viejo; un cambio de prefijos de tarea los invalida todos.

**Puerta de compatibilidad**: los vectores de documento (PC/Cloudflare) y la consulta (embebida en el VPS) deben ser intercambiables. Un índice ajeno solo se reutiliza si su `model` está en `EMBEDDER_ACCEPT_MODELS`; se declara ahí después de pasar `bun run embed:compat` (50 fragmentos reales + 10 consultas, coseno mínimo ≥ 0,99, mismo truncado a 256). Si no pasa: embeber también la consulta en Cloudflare, o generar el índice con el mismo GGUF en llama.cpp.

Flujo (PC o Cloudflare):

```bash
# 1. Compatibilidad (A = embedder del VPS por túnel/SSH a 127.0.0.1:8891, B = candidato)
cd server
EMBEDDER_URL=http://127.0.0.1:8891/v1/embeddings COMPAT_URL=https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1/embeddings COMPAT_MODEL=@cf/google/embeddinggemma-300m COMPAT_TOKEN=<token> bun run embed:compat

# 2. Generar (Cloudflare; EMBEDDER_TOKEN en el entorno, nunca en el repo)
EMBEDDER_URL=https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1/embeddings EMBEDDER_MODEL=@cf/google/embeddinggemma-300m EMBEDDER_TOKEN=<token> EMBED_BATCH=50 bun run index

# 3. Subir el par al VPS
scp data/index.json data/index.vec <vps>:/home/hermes/deploy/index-prebuilt/
```

4. En el entorno `development` de GitHub: variable `EMBEDDER_ACCEPT_MODELS=@cf/google/embeddinggemma-300m`. `deploy.yml` usa `~/deploy/index-prebuilt/index.json` si existe y copia `index.vec` al bundle; `astra-dev.sh` rechaza un bundle semántico sin `index.vec`.

- Los identificadores (`SET_VEHICLE_DOOR_OPEN`, hashes) no se buscan bien por embeddings: el índice combina coincidencia exacta de nombre/hash con la semántica (4a).
- `EMBEDDER_TOKEN` exige `https` (salvo loopback), se manda como `Authorization: Bearer` y no se loguea (`describeConfig` solo dice `hasToken`). El build reintenta 429/5xx/red con backoff (`EMBED_RETRIES`, 3).
- Verificado con el corpus real (10.254 fragmentos) y un embedder simulado: generar 4,7 s, reutilizar con el embedder caído deja el índice semántico con el `.vec` idéntico byte a byte; sin el modelo en `EMBEDDER_ACCEPT_MODELS` cae a keyword-only con aviso.
- **No verificado**: contra Cloudflare real (el endpoint compatible con OpenAI y el nombre del modelo salen de su documentación, sin token no se probó) ni contra el embedder del VPS (la prueba de compatibilidad corre donde ambos son alcanzables). Es el paso pendiente antes de poner el modelo en `EMBEDDER_ACCEPT_MODELS`.

### Fase 5: WeGraph y Code Mode

WeGraph (`wegraph-work/graph-live`) expone hoy tools MCP clásicas (`search_graph`, `get_node`, `query_org_graph`...). **No tiene Code Mode todavía** (no hay rastro en su código ni docs). Code Mode significa que el agente no llama muchas tools sueltas: escribe código contra una API tipada y la ejecuta en un sandbox, con solo dos tools (`search` para descubrir la API y `execute` para correr el código), como hace el MCP de Cloudflare.

Diseño propuesto, para decidir antes de implementar:

- **Nodos**: `native` (por `id`), `namespace`, `doc`, `event`, `concept`. **Aristas**: `belongs_to` (native → namespace), `see_also` (native → native, de `seeAlso`), `mentions` (doc → native, de `nativeRefs`), `links_to` (doc → doc), `overrides` (nota de Astra → native), `redefines` (cfx → gta).
- **API tipada generada** desde `types.ts`: `natives.get(nameOrHash)`, `natives.search(q, {ns, apiset})`, `graph.neighbors(id, edge)`, `docs.get(slug)`. El agente compone: "traé los natives de VEHICLE que mencionan puertas y sus ejemplos" en una sola ejecución en vez de decenas de tool calls.
- El export de esta fase es una función pura del corpus (`corpus → {nodes, edges}`), versionada con el sha de las fuentes, para entrar por el flujo de seeds/`propose_update` de WeGraph.
- Antes de escribirlo hay que leer el esquema real de seeds y el versionado semver de `graph-live` (ADR 0003), porque el corpus entero (≈7.700 nodos) es mucho más grande que lo que carga hoy.

## Pruebas

`bun test scripts/import`: joaat contra hashes reales, parser de natives (firma, hashes, parámetros, anotaciones `cs_type`, encabezado vacío o atrasado, CFX sin hash), shortcodes y enlaces (incluido código y escapados), colisiones GTA/CFX, overrides, archivos rotos sin tapar al resto, determinismo y validación de `content-sources.json`.
