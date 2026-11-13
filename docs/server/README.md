# Server de Ask Ether (M3, v0.4.0; caché de respuestas v0.8.0)

Mitad servidor del chat de solo lectura sobre la documentación. Vive en [`server/`](../../server/) como paquete Bun aparte (su propio `package.json` y `bun.lock`). La UI (panel del chat, entrada en la paleta Ctrl+K) está en [ask/README.md](../ask/README.md) y consume los endpoints de abajo.

```
browser ──► nginx ──► /api/*  ──► astra-dev@<slot> (Bun, 127.0.0.1:4101|4102)
                                    ├─ GET  /health, /ready
                                    ├─ POST /graphql          viewer, searchDocs (público, con rate limit por IP)
                                    └─ POST /chat   (SSE)     requiere subscriber o staff
                                          │
                          viewer ◄────────┤  GET {accounts}/api/auth/viewer  (cookie de sesión de .adastrarp.com)
                          retrieval ◄─────┤  data/index.json  (+ embedder local 127.0.0.1:8891 para la consulta)
                          LlmProvider ◄───┘  DeepSeek flash por defecto. Sin herramientas
```

nginx quita el prefijo: el navegador llama `/api/chat`, el server recibe `/chat`.

## Seguridad primero: qué NO puede hacer el chat

El chat público **nunca** se conecta a Ether/Hermes (tiene shell y sudo en el VPS). Es una completion con contexto recuperado y **sin herramientas**:

- `LlmProvider` solo recibe `messages` y un tope de salida (`server/src/llm/provider.ts`). No existe `tools`, `functions` ni nada equivalente en la interfaz ni en la llamada a DeepSeek; un test lo verifica.
- El server no ejecuta nada ni lee archivos a pedido del usuario. Sus únicos destinos de red son el LLM (`LLM_BASE_URL`), el embedder local y el servicio de cuentas (`ACCOUNTS_BASE_URL`), los tres fijados por entorno, nunca por la petición.
- Los secretos (`DEEPSEEK_API_KEY`) viven en `~/deploy/env/astra-dev.env`, no en el repo ni en el navegador, y no se loguean.

## Modelo de amenazas y defensas

| Amenaza                                                                                              | Defensa                                                                                                                                                                         | Test                                |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Texto recuperado (doc, PR futura) con instrucciones                                                  | Va dentro de `<fuente>` escapado (`<` y `&`), nunca en el mensaje de sistema. El system prompt es constante y dice que `<contexto>`, `<historial>` y `<pregunta>` son dato      | `injection.test.ts`                 |
| Romper las etiquetas (`</fuente></contexto>`) o los atributos (`slug="..."`)                         | Escape de todo texto no confiable, incluidos los metadatos                                                                                                                      | `injection.test.ts`                 |
| Cliente falsifica turnos `system`/`assistant` en el historial                                        | Solo se aceptan `user`/`assistant`, últimos N turnos con tope de caracteres, y se aplanan como texto citado dentro de `<historial>`: nunca se reenvían como roles reales        | `injection.test.ts`                 |
| Caracteres invisibles o bidi para esconder instrucciones                                             | `cleanText` los elimina                                                                                                                                                         | `injection.test.ts`                 |
| El modelo inventa fuentes o enlaces                                                                  | Las fuentes las decide el server (las recuperadas); `cited` solo conserva `[n]` que existen. El prompt prohíbe URLs                                                             | `chat.test.ts`, `injection.test.ts` |
| Pregunta fuera de la documentación                                                                   | Sin resultados: rechazo fijo sin llamar al modelo. Con resultados: el prompt exige la frase de rechazo si no alcanza; `done.refused` lo marca                                   | `chat.test.ts`                      |
| Costos / abuso                                                                                       | Tope de pregunta, historial, contexto y salida (en caracteres y en tokens), rate limit por viewer y por IP, presupuesto diario de tokens por viewer y global                    | `limits.test.ts`, `chat.test.ts`    |
| CSRF y lectura cross-site con cookie (`/chat`, `/graphql`; el CORS por defecto de Yoga está apagado) | `Origin` presente debe estar en `ALLOWED_ORIGINS`, y `Content-Type: application/json` obligatorio                                                                               | `permissions.test.ts`               |
| Falsificar la IP para evadir el límite                                                               | nginx sobrescribe `X-Real-IP`; el server solo lo lee con `TRUST_PROXY=true` (por defecto solo en producción)                                                                    | `limits.test.ts`                    |
| Cuentas caído                                                                                        | Falla cerrado: 503 `viewer_unavailable`, el modelo no se llama                                                                                                                  | `permissions.test.ts`               |
| Stub de desarrollo en producción                                                                     | `ASTRA_DEV_VIEWER` se ignora si `NODE_ENV=production` (y se loguea un aviso). Producción tampoco arranca con `LLM_PROVIDER=fake` ni sin `DEEPSEEK_API_KEY`                      | `permissions.test.ts`               |
| Fuga en logs                                                                                         | Una línea JSON por request con ids, rol, modo, conteos, estado y duración. **Nunca** pregunta, respuesta, cookies ni tokens (el logger descarta esas claves). La IP va hasheada | `chat.test.ts`                      |

**Lo que sigue siendo cierto:** un modelo puede equivocarse o ser persuadido dentro de lo que ve; las defensas acotan qué ve y qué puede hacer con ello (nada más que producir texto). **La UI debe renderizar la respuesta como Markdown sin HTML crudo**, sin cargar imágenes ni abrir enlaces que escriba el modelo; el modelo tiene prohibido emitirlos, pero no se confía en eso.

## Endpoints

| Ruta       | Método | Acceso                       | Qué                                                                                                                                                                                                                                                                          |
| ---------- | ------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`  | GET    | público (loopback en deploy) | `{"ok":true}`                                                                                                                                                                                                                                                                |
| `/ready`   | GET    | idem                         | `{ok, sha, version, slot, index:{chunks, semantic, model, builtAt, sourceHash}, llm}`. **503** si el índice no cargó                                                                                                                                                         |
| `/graphql` | POST   | público                      | `viewer { … }`, `searchDocs(q, limit, kind) { mode degraded hits { kind slug title heading anchor path excerpt score } }` (`kind`: `doc` o `native`), `native(q) { id name luaName ns apiset source hashes signature path }` (búsqueda exacta por nombre, nombre Lua o hash) |
| `/chat`    | POST   | `subscriber` o `staff`       | Cuerpo `{question, history?, memories?, lang?}`. Respuesta SSE                                                                                                                                                                                                               |

`/graphql` no expone el texto completo de los fragmentos (solo extracto). `q` tiene tope de 200 caracteres y `limit` de 10.

### `POST /chat`

Cuerpo: `{"question": "texto", "history": [{"role":"user|assistant","content":"..."}], "memories": ["preferencia"]}`. Errores previos al stream son JSON `{"error":{"code","message","retryAfter?"}}` con el estado HTTP; una vez que empieza el stream, un fallo llega como evento `error`.

| Estado | `code`                  | Cuándo                                                                                          |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------------- |
| 400    | `bad_request`           | JSON inválido, `question` vacía o no texto, `memories` mal formado o sobre sus topes, tipo MIME |
| 401    | `unauthenticated`       | Sin sesión                                                                                      |
| 403    | `subscription_required` | Con sesión pero rol `public`                                                                    |
| 403    | `forbidden_origin`      | `Origin` no permitido                                                                           |
| 413    | `payload_too_large`     | Cuerpo sobre `CHAT_MAX_BODY_BYTES`                                                              |
| 429    | `rate_limited`          | Rate limit (cabecera `Retry-After`)                                                             |
| 429    | `budget_exceeded`       | Presupuesto diario de tokens (resetea 00:00 UTC)                                                |
| 502    | `llm_unavailable`       | (como evento `error` dentro del stream)                                                         |
| 503    | `viewer_unavailable`    | Cuentas no responde                                                                             |
| 503    | `index_unavailable`     | `data/index.json` ausente o inválido                                                            |

**`memories` (opcional, v0.16.0).** Lista de preferencias del usuario que el cliente guarda en su navegador y manda con cada pregunta. Validación estricta, sin recorte silencioso: tiene que ser un array de strings, como mucho 12, cada una de 1 a 280 caracteres (después de limpiar caracteres invisibles y de control), 2000 caracteres entre todas. Ausente, `null` o `[]` equivale a no mandar nada; cualquier otra forma o exceso es `400 bad_request` antes de buscar o llamar al modelo. Los topes valen también para `owner` (son el formato del campo, no una política de uso); `CHAT_MAX_BODY_BYTES` sigue aplicando al cuerpo completo.

- Van al modelo en un bloque propio `<memorias>` (una línea `- texto` por memoria, escapado con `escapeData`), entre `<entorno>` y `<contexto>`. Son dato del usuario: la regla 9 del prompt dice que solo adaptan tono y formato, no son fuentes citables y no cambian las reglas.
- **No se cachean**: con memorias la respuesta ni se lee ni se guarda en la caché (la clave no las incluye a propósito).
- **No se loguean**: el log de la request lleva solo `memories: <cantidad>`; ni el log ni `usage_events` tienen el texto. Probado en `server/tests/memories.test.ts`.
- No cuentan para `CHAT_CONTEXT_MAX_CHARS` (eso recorta fuentes): se suman aparte, como mucho 2000 caracteres (unos 700 tokens).

Eventos SSE (`Content-Type: text/event-stream`, `X-Accel-Buffering: no`, `X-Request-Id`):

```
event: meta     data: {"requestId":"…","mode":"semantic|keyword","degraded":false,"contextWindow":65536}   (contextWindow: `LLM_CONTEXT_WINDOW`; el cliente lo muestra como presupuesto)
event: step     data: {"step":{"id":"history|search|gate|cache","ms":12,…}}   (0 a 4, antes de `sources`)
event: thinking data: {"text":"…"}                      (solo staff, entre `sources` y los `delta`)
event: sources  data: {"sources":[{"n":1,"slug":"…","title":"…","heading":"…","anchor":"…","path":"/docs/slug#anchor","excerpt":"…","score":0.71}]}
event: delta    data: {"text":"…"}                      (muchos)
event: done     data: {"cited":[1,2],"refused":false,"truncated":false,"cached":true,"usage":{"inputTokens":…,"outputTokens":…},"usageEstimated":false}   (`cached` solo si salió de la caché; `usageEstimated` true cuando el proveedor no informó uso)
event: error    data: {"code":"llm_unavailable","message":"…"}   (en lugar de done)
```

`step` cuenta lo que hizo el pipeline antes del modelo, solo con números y tiempos (nunca contenido): `history` (`usedHistory`), `search` (`mode`, `docs`, `natives`), `gate` (`kept`, `total`) y `cache` (la respuesta salió de la caché; se suma a los pasos de la búsqueda). Lo ve cualquier viewer. `thinking` es el razonamiento que el proveedor expone (`reasoning_content`); el server lo reenvía **solo a `staff`**, hasta `CHAT_MAX_THINKING_CHARS`, y nunca entra a la respuesta, a la caché ni al historial. Un cliente viejo ignora los dos eventos. La búsqueda ocurre antes de abrir el stream, así que los `step` llegan juntos al empezar; lo que se ve en vivo durante la espera es el razonamiento y el estado "escribiendo".

La respuesta cita con `[n]`; `n` indexa `sources`. `path` es el enlace al sitio (`slug` + ancla del encabezado). Idioma: español por defecto, inglés si la pregunta está en inglés.

## Permisos

`Viewer = { id, handle, role: 'public' | 'subscriber' | 'staff' | 'owner', emailVerified, entitlements: [{ kind, validUntil }] }`, resuelto por el puerto `ViewerPort` (`server/src/viewer.ts`). El contrato de cuentas está en `docs/accounts/README.md` de `adastra-site` (PR #21):

- **`HttpViewerPort`** (producción): reenvía solo la cabecera `Cookie` a `GET {ACCOUNTS_BASE_URL}{ACCOUNTS_VIEWER_PATH}` (por defecto `https://adastrarp.com/api/auth/viewer`). `401/403/404` = anónimo. Error de red o 5xx = `viewer_unavailable`. Caché en memoria de 5 s por cookie (cuentas pide pocos segundos como máximo: una sesión o entitlement revocado puede seguir 5 s).
- **`DevStubViewerPort`**: `ASTRA_DEV_VIEWER=public|subscriber|staff`. Ignorado en producción.

Respuesta real de cuentas y cómo se mapea (`parseViewer`, falla cerrado):

```
200 { "id": "…", "handle": "ana", "role": "member", "emailVerified": true,
      "entitlements": [ { "kind": "tebex-subscriber", "validUntil": "2026-12-10T00:00:00.000Z" } ] }
401 { "error": "…" }      sin cookie, sesión inválida o vencida, cuenta suspendida
```

| Condición                                                                                                                                                              | `role` del Viewer |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `role === 'staff'`                                                                                                                                                     | `staff`           |
| entitlement `kind === 'tebex-subscriber'` con `validUntil` `null` o futura                                                                                             | `subscriber`      |
| todo lo demás: `member` sin entitlement, entitlement vencido o con fecha ilegible, otros `kind`, otros valores de `role`, entitlements como texto, payload mal formado | `public`          |

Cuentas solo lista entitlements activos; aun así se descartan los vencidos. `emailVerified` se conserva pero el acceso al chat no depende de él.

> El contrato sale del doc de cuentas (PR #21 de `adastra-site`, aún abierto). Si cambia, solo cambia `parseViewer`.

Hoy `subscriber`, `staff` y `owner` pueden chatear. `staff` read-write queda para cuando haya herramientas de escritura (no las hay: el chat es de solo lectura).

### Dashboard de IA (v0.14.0)

`aiUsage(days)` (GraphQL, solo `owner`) devuelve los agregados del registro de uso: totales, tokens y GPU por día, por modelo, top 10 de usuarios y resultados. Errores: `unauthenticated`, `owner_required`, `usage_unavailable` (sin `USAGE_DB_PATH`). `days` va de 1 a 180. La página es `/dashboard`, ver [chat/README.md](../chat/README.md).

### Rol `owner` (v0.13.0)

`owner` no viene de cuentas: es un rol del server que exige dos cosas a la vez, `OWNER_IDS` (ids separados por comas) **y** `role: staff` en cuentas (`OwnerOverlayViewerPort`, sobre el puerto de cuentas). Quitar staff en cuentas revoca owner dentro de la caché de 5 s; `OWNER_IDS` vacío = nadie es owner; una entrada mal formada hace fallar el arranque. `owner` implica todo lo de staff (`atLeast(role, 'staff')`, un solo helper para los chequeos).

Qué se saltea, decidido en un solo lugar (`server/src/policy.ts`, `policyFor`):

| Límite                                                                                         | Owner                                               | Resto   |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------- |
| Rate limits (chat por viewer e IP, search, project)                                            | no aplican                                          | aplican |
| Presupuesto diario de tokens, por viewer y global                                              | no aplica, y sus tokens no consumen el de los demás | aplica  |
| `CHAT_MAX_QUESTION_CHARS`, `CHAT_MAX_HISTORY_*`, `CHAT_MAX_OUTPUT_*`, `CHAT_CONTEXT_MAX_CHARS` | techos altos fijos (`OWNER_CHAT_SETTINGS`)          | aplican |
| `CHAT_MAX_BODY_BYTES`                                                                          | aplica (protege al server)                          | aplica  |
| Circuito del embedder (30 s) y caché                                                           | aplican                                             | aplican |

El único freno del owner es `OWNER_MAX_ROUNDS` (8): rondas internas (herramientas, subagents) en un mensaje antes de pedir confirmación para seguir. El contador y el evento SSE `confirm` llegan con las fases 2 y 5; hoy solo existe en la política. Ver [chat/README.md](../chat/README.md).

### Registro de uso (v0.13.0)

Con `USAGE_DB_PATH` el server guarda una fila por request de `/chat` en SQLite (`server/src/usage/`, WAL, compartido por blue y green): quién (id, handle, rol), proveedor y modelo, si hubo fallback, tokens, `ttft_ms`, duración, `gen_tps`, resultado (`ok`, `cached`, `refused`, `rate_limited`, `budget_exceeded`, …), caché, `gpu_ms` (solo modelos locales, de los `timings` de llama.cpp) y costo estimado (solo DeepSeek). **Nunca** la pregunta, la respuesta, fragmentos, IP ni secretos. Las peticiones anónimas no se registran. Las filas se encolan en memoria y se escriben por lotes en una transacción (cada 250 ms o 100 filas, y al apagar el server), así que la escritura no está en la ruta de la request; si el disco se traba, la cola tiene tope (5.000) y descarta las más viejas contándolas. Un fallo de escritura nunca rompe la respuesta. El handler solo conoce la interfaz `UsageSink`: cambiar SQLite por otro almacén (Postgres, un colector HTTP) no toca el chat. Se purga a los `USAGE_RETENTION_DAYS` al arrancar.

## Índice semántico

```bash
cd server && bun run index        # o: bun --cwd server run index
```

Lee `content/docs/**/*.md` (`DOCS_DIR`) y el corpus del importador en `content/generated/` (`GENERATED_DIR`; los docs de fivem-docs y los natives, ver [import/README.md](../import/README.md); correr `bun run import` en la raíz antes. Si no existe, el índice sale solo con docs y avisa). Parte cada doc por encabezado (`##` y `###`, con la introducción y el `summary` como primer fragmento; bloques largos se parten por bloque), arma **un fragmento por native** y escribe `server/data/index.json` (`INDEX_PATH`, ignorado por git) más, si es semántico, `server/data/index.vec` con los vectores (Float32, orden de `chunks`, `dims` por fragmento; el hash del `.vec` está en el JSON y el server rechaza un par de generaciones distintas):

```
{ version: 3, builtAt, sourceHash, model, dims, semantic, vectors: { file, bytes, hash } | null,
  chunks: [{ id, kind, native?, slug, title, heading, anchor, text, excerpt }] }
```

- `kind` es `doc` (página bajo `/docs`, con `anchor`) o `native` (página `/natives/<slug>`, sin ancla). Un fragmento `native` lleva `native`: `id`, nombre, nombre Lua, `ns`, `apiset`, hashes, alias y firma. El texto empieza por los nombres y la firma, que es lo que se busca, y se corta a 2400 caracteres (los ejemplos largos primero).
- Con 7.326 natives el índice completo tiene ~10.000 fragmentos y ~10 MB sin vectores. Se genera en menos de 1 s por palabras clave.

- Los vectores salen de `@wefaber/embed` (`EmbedderClient`), truncados (Matryoshka) a `EMBEDDER_DIMS` (256) y normalizados. Documento y consulta usan los prefijos de tarea de EmbeddingGemma (`server/src/index/prompts.ts`); si cambia el modelo, se cambian ahí y se regenera.
- Los vectores pueden calcularse fuera del VPS (PC o Cloudflare) y reutilizarse con `REUSE_FROM`, `EMBEDDER_TOKEN` y `EMBEDDER_ACCEPT_MODELS`: ver [import/README.md, fase 4b](../import/README.md#fase-4b-embeddings-fuera-del-vps). `bun run embed:compat` compara dos embedders.
- **El embedder es local al VPS** (`http://127.0.0.1:8891/v1/embeddings`, unidad `embedder`). En otra máquina no responde: el índice sale **solo por palabras clave** (`semantic: false`), con un aviso, y el build **no falla**. Regenerarlo en el VPS (lo hace `deploy.yml`, el runner vive ahí) lo deja semántico.
- `anchor` es el id del encabezado en la página renderizada. El test `scripts/docs/chunk-parity.test.ts` obliga a que coincida con el algoritmo del motor de docs.
- El server carga el índice una vez al arrancar. Un doc nuevo requiere regenerar y desplegar (el deploy ya lo hace).

**Natives por nombre o hash** (`server/src/index/lookup.ts`): los embeddings y BM25 son malos con identificadores, así que un native nombrado en la consulta se busca aparte y va **primero**, con `score: 1`, aunque el embedder esté caído. Coincide por nombre canónico, nombre Lua (`GetEntityCoords` = `GET_ENTITY_COORDS`), alias y hash de 64 o 32 bits. Una consulta de un solo token coincide por cualquier nombre (`wait`); dentro de una frase solo cuentan hashes e identificadores (con `_` o camelCase), para que "wait for the resource" no fije el native `WAIT`. Si GTA y CFX comparten nombre salen los dos, GTA primero. El tokenizador de BM25 separa camelCase, así que "open the door of a vehicle" encuentra `SetVehicleDoorOpen` por palabras.

**Docs y natives por separado**: ~7.000 natives desplazarían a los docs de cualquier ranking conjunto. `Retriever.searchMany` hace una sola incrustación de la consulta y arma un ranking por tipo (`kind`); el chat pide `CHAT_TOP_K` docs más `CHAT_NATIVES_TOP_K` natives (3 por defecto, 0 = solo docs). El `<fuente>` del prompt lleva `tipo="doc|native"`.

**Recuperación** (`server/src/index/search.ts`): coseno top-k con el embedder; si el embedder falla o tarda más de `EMBEDDER_TIMEOUT_MS`, o el índice no tiene vectores, o nada supera `CHAT_MIN_SEMANTIC_SCORE`, cae a BM25 por palabras clave (sin tildes, con plurales, título y encabezado pesan más). Tras un fallo del embedder se lo salta 30 s para no sumar timeouts. `meta.degraded` y `mode` informan qué pasó. Nunca lanza.

## Caché de respuestas (v0.8.0)

`server/src/chat/cache.ts`. Una pregunta repetida sobre las mismas fuentes se responde sin llamar al modelo y sin gastar presupuesto de tokens.

- **Clave** (SHA-256): rol del viewer + pregunta normalizada (minúsculas, sin tildes ni signos, espacios simples) + historial normalizado + **ids de los fragmentos** que entrarían en el prompt, en orden. Si dos viewers pueden ver contexto distinto (hoy no: todos los roles con chat ven el mismo corpus), las claves difieren y nunca comparten respuesta; la caída a palabras clave también cambia los ids y por tanto la clave.
- **Qué se guarda**: solo respuestas completas y correctas. Un error del modelo o una respuesta cortada por longitud **no** se cachean.
- **Acotada**: TTL (`CHAT_CACHE_TTL_SECONDS`, 3600) y máximo de entradas con descarte del menos usado (`CHAT_CACHE_MAX_ENTRIES`, 500). `0` en cualquiera la apaga.
- **Un acierto sigue contando** para el rate limit por viewer e IP, y repite el stream SSE (`meta`, `sources`, `delta`, `done` con `cached: true` y uso 0), así el cliente no distingue el camino.
- El log de la petición lleva `cache: hit|miss`. Pregunta y respuesta siguen sin loguearse; las claves son hashes y viven solo en memoria.

## Variables de entorno

Todas con valor por defecto salvo las marcadas. En el VPS van en `~/deploy/env/astra-dev.env` (modo 600, formato `CLAVE=valor`).

| Variable                                                                         | Defecto                                                         | Notas                                                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                       | (la unidad pone `production`)                                   | En producción: sin stub de viewer, sin proveedor `fake`, key obligatoria                                        |
| `DEEPSEEK_API_KEY`                                                               | — **obligatoria en producción**                                 | Secreto                                                                                                         |
| `ACCOUNTS_BASE_URL`                                                              | `https://adastrarp.com`                                         | Servicio de cuentas (adastra-site)                                                                              |
| `ALLOWED_ORIGINS`                                                                | `https://development.adastrarp.com`                             | Coma separada. En dev suma `localhost:5173`                                                                     |
| `ASTRA_SLOT`                                                                     | `dev` (la unidad pone `blue`/`green`)                           | Define el puerto: blue 4101, green 4102, otro 4100                                                              |
| `PORT`, `HOST`                                                                   | por slot, `127.0.0.1`                                           | Solo loopback                                                                                                   |
| `TRUST_PROXY`                                                                    | `true` en producción                                            | Confía en `X-Real-IP` de nginx                                                                                  |
| `INDEX_PATH`, `BUILD_INFO_PATH`                                                  | `data/index.json`, `build.json`                                 | `build.json` lo escribe el deploy (sha, versión)                                                                |
| `EMBEDDER_URL`, `EMBEDDER_MODEL`, `EMBEDDER_TIMEOUT_MS`                          | `127.0.0.1:8891/v1/embeddings`, `embeddinggemma-2`, 2500        | Local al VPS                                                                                                    |
| `EMBEDDER_DIMS`                                                                  | 256                                                             | Cambiarlo exige regenerar el índice                                                                             |
| `EMBEDDER_TOKEN`                                                                 | —                                                               | Secreto. Bearer para un embedder hospedado (Cloudflare). Exige https                                            |
| `EMBEDDER_ACCEPT_MODELS`                                                         | — (siempre incluye `EMBEDDER_MODEL`)                            | Modelos cuyos vectores se aceptan de un índice ajeno (tras `embed:compat`)                                      |
| `LLM_CONTEXT_WINDOW`                                                             | 65536 (`local`: 8192); 1024 a 2000000                           | Ventana del modelo en tokens. Va en `meta` y alimenta el medidor de `/ask`; confirmar el valor real de DeepSeek |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_MS`                    | `deepseek`, `https://api.deepseek.com`, `deepseek-flash`, 60000 | `fake` solo fuera de producción; `local` ver abajo                                                              |
| `DECISION_URL`, `DECISION_TIMEOUT_MS`, `DECISION_FOLLOWUP_THRESHOLD`             | — (apagado), 1500, 0,25                                         | Clasificador de follow-ups; ver "Decision model". Solo loopback                                                 |
| `DECISION_GATE_THRESHOLD`, `DECISION_GATE_FLOOR`, `DECISION_GATE_FRAGMENT_CHARS` | 0,5, 0,3, 1500                                                  | Filtro de fragmentos; ver "Decision model"                                                                      |
| `LLM_FALLBACK_PROVIDER`, `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_MODEL`           | — (apagado), `http://127.0.0.1:8080/v1`, `local`                | Fallback local si el modelo principal falla antes de responder. Solo con `LLM_PROVIDER=deepseek`; URL loopback  |
| `ACCOUNTS_VIEWER_PATH`, `ACCOUNTS_TIMEOUT_MS`                                    | `/api/auth/viewer`, 3000                                        |                                                                                                                 |
| `ASTRA_DEV_VIEWER`                                                               | —                                                               | Stub de dev. Ignorado en producción                                                                             |
| `CHAT_MAX_QUESTION_CHARS`                                                        | 800                                                             |                                                                                                                 |
| `CHAT_MAX_HISTORY_TURNS`, `CHAT_MAX_HISTORY_TURN_CHARS`                          | 6, 800                                                          |                                                                                                                 |
| `CHAT_MAX_THINKING_CHARS`                                                        | 12000                                                           | Razonamiento que se reenvía a staff (`thinking`). 0 = nunca                                                     |
| `CHAT_MAX_OUTPUT_TOKENS`, `CHAT_MAX_OUTPUT_CHARS`                                | 4096, 16000                                                     |                                                                                                                 |
| `CHAT_TOP_K`, `CHAT_CONTEXT_MAX_CHARS`                                           | 5, 9000                                                         |                                                                                                                 |
| `CHAT_NATIVES_TOP_K`                                                             | 3                                                               | Natives que se suman a los docs en el contexto. 0 = solo docs                                                   |
| `CHAT_MIN_SEMANTIC_SCORE`                                                        | 0.25                                                            | **Sin calibrar** con el embedder real: ajustar mirando `meta.mode`                                              |
| `CHAT_MAX_BODY_BYTES`                                                            | 16384                                                           |                                                                                                                 |
| `CHAT_CACHE_TTL_SECONDS`, `CHAT_CACHE_MAX_ENTRIES`                               | 3600, 500                                                       | Caché de respuestas. 0 en cualquiera = apagada                                                                  |
| `RATE_CHAT_VIEWER_PER_MIN`, `RATE_CHAT_IP_PER_MIN`                               | 6, 20                                                           | Ventana deslizante de 60 s                                                                                      |
| `RATE_SEARCH_IP_PER_MIN`                                                         | 60                                                              | `searchDocs` público                                                                                            |
| `OWNER_IDS`                                                                      | —                                                               | Ids de cuentas que pueden ser `owner` (además deben ser `staff` en cuentas)                                     |
| `OWNER_MAX_ROUNDS`                                                               | 8                                                               | Rondas por mensaje del owner antes de pedir confirmación                                                        |
| `USAGE_DB_PATH`                                                                  | — (sin registro)                                                | SQLite de uso. Fuera de los slots, para que blue y green lo compartan                                           |
| `USAGE_RETENTION_DAYS`                                                           | 180                                                             | Se purga al arrancar                                                                                            |
| `USAGE_PRICE_IN_PER_MTOK`, `USAGE_PRICE_OUT_PER_MTOK`                            | 0.14, 0.28                                                      | USD por millón de tokens, para estimar el costo de modelos alojados                                             |
| `DAILY_TOKENS_VIEWER`, `DAILY_TOKENS_GLOBAL`                                     | 120000, 1000000                                                 | Reset 00:00 UTC                                                                                                 |
| `ASTRA_GITHUB_TOKEN`                                                             | —                                                               | Secreto, solo lectura. Sin él, `project` queda apagado                                                          |
| `PROJECT_REPO`, `PROJECT_REF`                                                    | `adastra-org/astra-dev`, `dev`                                  | Repo y rama de los que se leen plan, complejidad y commits                                                      |
| `PROJECT_PLAN_PATH`, `PROJECT_COMPLEXITY_PATH`                                   | `docs/plan/README.md`, `docs/project/complexity.json`           | Relativos al repo                                                                                               |
| `PROJECT_CACHE_TTL_SECONDS`, `RATE_PROJECT_VIEWER_PER_MIN`                       | 300, 30                                                         | Caché de "Proyecto" y su rate limit por viewer                                                                  |
| `GITHUB_API_URL`                                                                 | `https://api.github.com`                                        | Para pruebas con un GitHub falso                                                                                |
| `MYCHECKLIST_URL`, `MYCHECKLIST_LIST`                                            | `https://checklist.wefaber.net`, `Ad Astra`                     | Lista externa que se muestra en el checklist                                                                    |
| `MYCHECKLIST_TOKEN`                                                              | —                                                               | Secreto, `mck_…` en modo `read`. Sin él, la lista externa queda `disabled`                                      |

Un valor inválido hace fallar el arranque con el listado de problemas (un deploy mal configurado no llega a vivo: `/ready` no responde y el script no cambia el slot).

## Límites conocidos

- **Rate limit, presupuesto y caché de viewer están en memoria del proceso.** Un reinicio los reinicia, y los dos slots (blue/green) no comparten estado: durante un deploy un viewer podría gastar el tope en cada uno. Aceptable para un VPS y un equipo chico; antes de escalar a varias instancias va un store compartido.
- La estimación de tokens (3 caracteres por token) es conservadora; el consumo real se concilia con el `usage` del proveedor.
- La caché de respuestas también es del proceso: un reinicio o el otro slot la vacían, y un doc nuevo llega con un deploy (que reinicia el proceso).
- El umbral semántico y los prefijos de tarea del embedder no están calibrados contra el embedder real (no es accesible fuera del VPS).
- Si Cloudflare proxea el dominio, nginx necesita `real_ip_header CF-Connecting-IP` con los rangos de Cloudflare (`set_real_ip_from`), o `$remote_addr` será el borde de Cloudflare y el límite por IP se compartirá entre todos.
- El stream usa `fetch` sin reintentos: un fallo del proveedor se informa y el usuario reintenta.

## Deploy (diseño; nada aplicado)

Reutiliza el modelo blue/green del sitio: el mismo giro de `current` mueve la API. Diseño y archivos:

| Pieza                              | Archivo                                       | Qué hace                                                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unidad systemd de usuario por slot | `deploy/systemd/astra-dev@.service`           | `astra-dev@blue` (4101) y `astra-dev@green` (4102), `bun src/main.ts` desde `~/deploy/astra-dev-server/<slot>`, `EnvironmentFile`, `Restart=on-failure`                                                                                                         |
| nginx `location /api/` + upstreams | `deploy/nginx/development.adastrarp.com.conf` | Quita el prefijo, proxy al server del slot (`current` o, con `X-Deploy-Slot: next` desde loopback, `next`), sin buffer para SSE, sobrescribe `X-Real-IP`                                                                                                        |
| Script                             | `deploy/astra-dev.sh`                         | 4.º argumento = bundle del server. Copia al slot ocioso, reinicia su unidad, espera `/ready` con el sha, escribe `upstreams.conf`, prueba `/api/ready` por el vhost real, cambia `current` y revierte ambas cosas si falla. `rollback` y `status` cubren la API |
| Workflow                           | `.github/workflows/deploy.yml`                | Genera el índice en el runner (embedder local), arma el bundle (`src` + deps de producción + índice), avisa si la unidad o el vhost difieren, verifica `/api/ready` público con el sha                                                                          |

El server necesita `bun run check` verde (la raíz ya lo incluye) y su índice; no hay build de transpilado.

### Pasos manuales una sola vez en el VPS (Faku o Ether)

Hasta hacerlos, el workflow **sigue desplegando el sitio estático** y avisa que la etapa de API se salta.

1. Env del server (no commitear):
   ```bash
   install -m 600 /dev/null ~/deploy/env/astra-dev.env   # si no existe
   cat >> ~/deploy/env/astra-dev.env <<'EOF'
   DEEPSEEK_API_KEY=<la key>
   ACCOUNTS_BASE_URL=https://adastrarp.com
   EOF
   install -d ~/deploy/astra-dev-server
   ```
2. Unidad de usuario y linger:
   ```bash
   install -Dm644 deploy/systemd/astra-dev@.service ~/.config/systemd/user/astra-dev@.service
   systemctl --user daemon-reload
   loginctl enable-linger hermes
   ```
   El runner necesita `XDG_RUNTIME_DIR=/run/user/<uid>` (el script ya lo asume por defecto).
3. Vhost nuevo (ya incluye `/api/`), como en [deploy/README.md](../deploy/README.md#5-vhost-nginx):
   ```bash
   sudo install -m 644 deploy/nginx/development.adastrarp.com.conf /etc/nginx/sites-available/development.adastrarp.com
   sudo /usr/sbin/nginx -t && sudo /usr/bin/systemctl reload nginx
   ```
   Si el dominio va detrás de Cloudflare, confirmar el `real_ip` (ver Límites conocidos).
4. Confirmar que el embedder responde: `curl -s http://127.0.0.1:8891/health`.
5. Mergear el PR; tras el deploy:
   ```bash
   curl -s https://development.adastrarp.com/api/ready     # sha del merge, index.semantic true
   curl -s -i -X POST https://development.adastrarp.com/api/chat -H 'content-type: application/json' -d '{"question":"hola"}'   # 401 sin sesión
   ```

Rollback: `/home/hermes/deploy/astra-dev.sh rollback` mueve sitio y API al slot anterior sin reconstruir.

## Desarrollo local

**Un solo comando, desde la raíz** (`scripts/dev.ts`):

```bash
bun dev                 # Vite (5173) + server de Ask Ether (4100); el LLM sale de server/.env
bun dev --local         # + IA local: embedder (8891), LLM (8080), decision model (8081) con llama-server
bun dev --local --think # el LLM local razona y el panel lo muestra (solo staff; gasta tokens)
bun dev --fake          # LLM de prueba, sin modelos
bun dev --no-server     # solo Vite (el `dev` de antes: `bun run dev:vite`)
bun dev --local --port 5174   # lo que no es nuestro va a Vite
```

- Con `--local` el server arranca con `LLM_PROVIDER=local`, `LLM_MODEL=lfm` y `DECISION_URL`; no hace falta tocar ningún `.env`. Los modelos salen de `ASTRA_MODELS_DIR` (default `E:/Proyectos/_scratch/models`): `embeddinggemma-300M-Q8_0.gguf`, `LFM2.5-2.6B-Q4_K_M.gguf`, `d1-Omni-2B-Q8_0.gguf`. `llama-server` se busca en `LLAMA_SERVER`, en el PATH y en el paquete WinGet `ggml.llamacpp`. Los logs van a `.cache/dev/`.
- Lo que ya responde en su puerto (un servicio o un server que levantaste a mano) se reutiliza y no se cierra al salir. Si cambiaste el `.env` o el índice, reiniciá ese proceso: `--watch` recarga código, no el `.env`.
- `ASTRA_DEV_VIEWER` queda en `staff` salvo que lo definas en el entorno o en `server/.env*`: sin viewer el panel pide iniciar sesión y en dev no hay dónde (las cuentas viven en adastra-site).
- El índice de dev no se versiona. Con el embedder local arriba: `cd server && bun run index` (~1 min). Es para probar; el índice de release lo genera el VPS.
- Ctrl+C cierra Vite, el server y los modelos que levantó este comando.

Por separado, sin el wrapper:

```bash
cd server && bun install
NO_EMBED=1 bun run index                                   # índice por palabras clave (sin embedder)
ASTRA_DEV_VIEWER=subscriber LLM_PROVIDER=fake bun run dev  # 127.0.0.1:4100, chat con el proveedor de prueba
bun run dev:local                                          # stub subscriber + proveedor real si hay DEEPSEEK_API_KEY; acepta localhost:5173-5176
bun run check                                              # typecheck + tests (también corre en el `check` de la raíz)
```

Con `DEEPSEEK_API_KEY` en el entorno y sin `LLM_PROVIDER=fake`, el chat usa DeepSeek de verdad. La UI en dev llama `/api/*` y Vite lo reenvía a `127.0.0.1:4100` quitando el prefijo (`vite.config.ts`), igual que nginx: mismo origen y misma cookie. Con `bun run dev:local` el panel funciona de punta a punta.

### Modelo local (`LLM_PROVIDER=local`)

Para probar o correr Ask Ether sin DeepSeek, contra un servidor OpenAI-compatible en la misma máquina (llama.cpp, Ollama, LM Studio). Reglas:

- `LLM_BASE_URL` debe ser loopback (`localhost`, `127.0.0.1`, `[::1]`); si no, el server no arranca. Por defecto `http://127.0.0.1:8080/v1`.
- No usa key: `DEEPSEEK_API_KEY` no se envía y no hace falta, tampoco en producción.
- Cada pedido manda `chat_template_kwargs: {enable_thinking: false}`: los modelos de razonamiento (Liquid LFM3, Qwen3) gastarían todo el presupuesto de tokens pensando y devolverían la respuesta vacía. llama.cpp lo respeta; otros servidores lo ignoran.

Probado (2026-11-12) con llama.cpp b12314 en una RTX 5070 (12 GB), `Q4_K_M`, 4 preguntas por `/chat` con el índice por palabras clave (3 sobre la doc, 1 fuera de tema):

| Modelo (`LiquidAI/…-GGUF`) | Tamaño | Resultado                                                                                                                                                                         |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LFM2.5-2.6B`              | 1,7 GB | **El único usable.** Respuestas directas y bien formadas, con citas `[n]` correctas; define "native" desde el glosario. Una respuesta cita una fuente de más. 2-5 s por respuesta |
| `LFM3-1.7B`                | 1,1 GB | Contesta con la doc pero abre con `<contexto>` y copia fragmentos del prompt; las citas valen, el formato no. 2-8 s                                                               |
| `LFM3-VL-2B`               | 1,1 GB | Rechaza "¿Qué es una native?" aunque la fuente está, y en otra pregunta mezcla el rechazo con el contexto copiado (`<contexto>`, `<pregunta>`). Descartado                        |

Los tres rechazan bien lo que está fuera de la doc ("No encuentro eso…"; ese rechazo sale del server sin llamar al modelo). Los modelos de razonamiento necesitan el `enable_thinking: false` de arriba.

```bash
llama-server -m LFM2.5-2.6B-Q4_K_M.gguf --host 127.0.0.1 --port 8080 -ngl 99 -c 8192 --alias lfm --reasoning-budget 0
NO_EMBED=1 bun run index
LLM_PROVIDER=local LLM_MODEL=lfm ASTRA_DEV_VIEWER=staff bun run dev
```

`--reasoning-budget 0` es obligatorio con LFM2.5: su plantilla de chat siempre abre `<think>` (no hay interruptor, `enable_thinking` no existe ahí) y el modelo razona ~2 000 caracteres en inglés antes de responder. Con `max_tokens` 700 (el tope de antes; hoy es 4096) eso se come el presupuesto: a veces `content` queda vacío (`llm_unavailable`) o la respuesta sale cortada. Con el flag, 6 de 6 respuestas seguidas terminaron en `stop` sin razonamiento (con `--reasoning off` el problema sigue igual). `bun dev --local` ya lo pasa.

Alcanza para desarrollo sin red o sin saldo de DeepSeek. No lo tomamos como reemplazo en producción: un modelo de 2-3B se equivoca en detalles (cita de más, nombres de tokens) y no se midió con el índice completo de natives ni con embedder.

### Decision model (`DECISION_URL`)

Un clasificador chico decide si la pregunta nueva necesita el turno anterior para entenderse. Si no lo necesita, la búsqueda usa solo la pregunta; hoy (sin decisor) siempre se le suma el último turno del usuario y un tema anterior contamina los resultados. Los modelos `d1` de Liquid AI no generan texto: contestan sí/no o elegir-una-opción con probabilidades calibradas en un solo forward pass, por `/v1/systemone` de llama.cpp.

```bash
llama-server -m d1-Omni-2B-Q8_0.gguf --host 127.0.0.1 --port 8081 -ngl 99 -b 4096 -ub 4096
DECISION_URL=http://127.0.0.1:8081 bun run dev
```

Reglas: `DECISION_URL` vacío = apagado (comportamiento de siempre) y debe ser loopback porque recibe el texto de la pregunta. Si el decisor falla, tarda más de `DECISION_TIMEOUT_MS` o contesta algo raro, se usa el historial como antes: el decisor solo puede **acortar** una búsqueda, nunca bloquear una pregunta. Con la sesión sin historial no se lo consulta. El log de `/chat` suma `usedHistory`.

Medición (2026-11-12, llama.cpp b12314, RTX 5070, `Q8_0`, 36 casos propios en español y 18 de validación):

| Modelo         | Tamaño | Follow-up (con historial)                              | `route` answer/clarify/offtopic | Latencia |
| -------------- | ------ | ------------------------------------------------------ | ------------------------------- | -------- |
| `d1-omni-600M` | 407 MB | 10/18 a 0,5; 12/18 en el mejor umbral                  | 21/34: contesta `answer` a todo | 12 ms    |
| `d1-Omni-2B`   | 1,8 GB | 14/18 a 0,5; 18/18 a 0,20 (17/18 a 0,30 en validación) | 29/34                           | 37 ms    |

- **El 600M no sirve** para esto. El **2B sí** para el follow-up, y con un umbral bajo: la probabilidad queda por debajo de 0,5 incluso en follow-ups reales. Por eso el umbral por defecto es 0,25 (perder contexto cuesta más que arrastrarlo).
- **`route` no se usa.** El 2B marca `offtopic` en ~16 % de preguntas válidas con confianza 0,5-0,65 ("¿Qué es una native?" con historial, "¿Qué pasa si no hay saldo?"). Bloquear con eso rechazaría preguntas buenas. Hoy el rechazo sale del puntaje de retrieval.
- **Efecto en la búsqueda, medido con el índice real (5 docs, solo palabras clave) y el 2B:** el decisor acertó 14/14 (8 independientes → `false`, 6 follow-ups → `true`, ~16 ms). El top-1 de las preguntas independientes tras un historial ajeno pasó de 4/8 a 5/8; los follow-ups quedaron en 6/6. La mejora es chica porque el buscador por palabras clave falla solo en varias de esas preguntas aun sin historial, y una (`¿Qué es un backlink?`) empeoró: el historial la ayudaba por casualidad. Falta medirlo con embedder y el índice de natives.

### Qué entra al prompt: gate y `<entorno>`

**Gate de contexto.** Con `DECISION_URL`, después de recuperar los fragmentos, el mismo `d1-Omni-2B` contesta una pregunta sí/no por fragmento: "¿hace falta esto para responder?". Quedan los fragmentos con probabilidad >= `DECISION_GATE_THRESHOLD` (0,5). Si ninguno llega, queda el mejor si pasa `DECISION_GATE_FLOOR` (0,3); si tampoco, no entra nada y el chat rechaza sin llamar al modelo ni gastar presupuesto. El gate solo **quita** contenido, nunca agrega ni reescribe. Si un fragmento no se puede juzgar (error, timeout) se deja pasar todo, como sin gate. El log de `/chat` suma `gate: kept/total`. Medición (14 preguntas, 50 fragmentos, índice real): a 0,5 entra el 56 % del texto, el 83 % de lo que queda es del doc correcto y se conserva el doc correcto en 9 de 10 preguntas. El arranque en frío de `llama-server` puede pasar el timeout de las primeras llamadas: ahí el gate se salta solo.

**`<entorno>`.** El mensaje al modelo empieza con datos del contexto de la pregunta, escapados como el resto (nunca en el system prompt): `idioma_de_la_interfaz` (el cliente manda `lang`: `es` o `en`, cualquier otro valor es `es`), `fecha`, `version_del_sitio`, `rama` y `ultimo_commit` (GitHub, rama `PROJECT_REF`, cache `PROJECT_CACHE_TTL`; sin token se omiten) y `quien_pregunta` (handle y rol). El system prompt dice que es contexto: no se cita con `[n]`, no se repite y no se saluda por el nombre. El **usuario no entra en la clave del cache** (una respuesta se comparte entre quienes tienen el mismo rol); sí entran idioma, día y commit. Cuando exista memoria por usuario, la respuesta personalizada tendrá que saltarse el cache.

**Respuesta en blanco.** Si el modelo devuelve solo espacios (pasa con modelos chicos) es un evento `error` (`llm_unavailable`), no un éxito, y no se cachea.

**Fallback.** `LLM_FALLBACK_PROVIDER=local`: si el principal falla _antes_ de producir texto (red, HTTP, timeout, sin saldo), el mismo pedido va al modelo local; el log registra `llm_fallback`. Una vez que empezó a llegar texto no se cambia de modelo.

## Pruebas (`bun test`, 143)

`chunk` (encabezados, anclas, partición, extractos), `search` (índice, ranking semántico, BM25, degradado con embedder caído, enfriamiento), `llm` (proveedor falso y DeepSeek con `fetch` simulado, sin `tools`), `permissions` (roles, puerto HTTP, stub ignorado en producción, 401/403/503, Origin), `limits` (rate limit, presupuesto, ruta HTTP), `chat` (formato SSE, topes, rechazo, citas, logs sin datos sensibles, `/ready`, GraphQL), `offline-embeddings` (índice en dos archivos, reutilización de vectores, compatibilidad entre embedders, token y reintentos) `cache` (normalización, TTL, tope y descarte, clave por rol/fuentes/historial, un acierto sin modelo ni presupuesto, errores y cortes sin cachear, log) e `injection` (fixtures de inyección con un "modelo" que solo se porta bien si recibe exactamente nuestras instrucciones).

## Estado de verificación

| Qué                                                                                          | Estado                                                                                                              |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Typecheck + 143 tests del server, `bun run check` de la raíz                                 | Verificado                                                                                                          |
| Índice por palabras clave con el corpus real (338 docs, 7.326 natives) y consultas           | Verificado: 10.254 fragmentos, 3-7 ms por consulta; búsquedas por nombre y hash exactas                             |
| Caché de respuestas: la pregunta repetida se sirve sin modelo (`cache: hit`, 0 tokens, 1 ms) | Verificado con tests y en el navegador contra DeepSeek real                                                         |
| Server en dev (stub + proveedor falso): `/health`, `/ready`, SSE, GraphQL                    | Verificado a mano                                                                                                   |
| Bundle de producción (solo deps de producción) arranca y responde `/ready` y 401             | Verificado a mano                                                                                                   |
| Índice por palabras clave desde `content/docs` y degradado con embedder inalcanzable         | Verificado                                                                                                          |
| DeepSeek real: respuesta con citas y rechazo fuera del tema                                  | Verificado a mano contra la API (índice por palabras clave)                                                         |
| Índice semántico y ranking con el embedder real                                              | **No verificado**: el embedder solo existe en el VPS                                                                |
| Contrato de `/api/auth/viewer`                                                               | Tests con el payload real documentado por cuentas. **No verificado** contra el endpoint desplegado (PR #21 abierto) |
| Unidad systemd, vhost `/api/`, script y workflow                                             | **No verificado**: sin aplicar en el VPS (el script pasa `bash -n`; el workflow parsea como YAML)                   |
