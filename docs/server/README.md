# Server de Ask Ether (M3, v0.4.0)

Mitad servidor del chat de solo lectura sobre la documentación. Vive en [`server/`](../../server/) como paquete Bun aparte (su propio `package.json` y `bun.lock`). La UI (paleta Ctrl+K, panel del chat) es otra tarea y consume los endpoints de abajo.

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
| `/chat`    | POST   | `subscriber` o `staff`       | Cuerpo `{question, history?}`. Respuesta SSE                                                                                                                                                                                                                                 |

`/graphql` no expone el texto completo de los fragmentos (solo extracto). `q` tiene tope de 200 caracteres y `limit` de 10.

### `POST /chat`

Cuerpo: `{"question": "texto", "history": [{"role":"user|assistant","content":"..."}]}`. Errores previos al stream son JSON `{"error":{"code","message","retryAfter?"}}` con el estado HTTP; una vez que empieza el stream, un fallo llega como evento `error`.

| Estado | `code`                  | Cuándo                                                |
| ------ | ----------------------- | ----------------------------------------------------- |
| 400    | `bad_request`           | JSON inválido, `question` vacía o no texto, tipo MIME |
| 401    | `unauthenticated`       | Sin sesión                                            |
| 403    | `subscription_required` | Con sesión pero rol `public`                          |
| 403    | `forbidden_origin`      | `Origin` no permitido                                 |
| 413    | `payload_too_large`     | Cuerpo sobre `CHAT_MAX_BODY_BYTES`                    |
| 429    | `rate_limited`          | Rate limit (cabecera `Retry-After`)                   |
| 429    | `budget_exceeded`       | Presupuesto diario de tokens (resetea 00:00 UTC)      |
| 502    | `llm_unavailable`       | (como evento `error` dentro del stream)               |
| 503    | `viewer_unavailable`    | Cuentas no responde                                   |
| 503    | `index_unavailable`     | `data/index.json` ausente o inválido                  |

Eventos SSE (`Content-Type: text/event-stream`, `X-Accel-Buffering: no`, `X-Request-Id`):

```
event: meta     data: {"requestId":"…","mode":"semantic|keyword","degraded":false}
event: sources  data: {"sources":[{"n":1,"slug":"…","title":"…","heading":"…","anchor":"…","path":"/docs/slug#anchor","excerpt":"…","score":0.71}]}
event: delta    data: {"text":"…"}                      (muchos)
event: done     data: {"cited":[1,2],"refused":false,"truncated":false,"usage":{"inputTokens":…,"outputTokens":…}}
event: error    data: {"code":"llm_unavailable","message":"…"}   (en lugar de done)
```

La respuesta cita con `[n]`; `n` indexa `sources`. `path` es el enlace al sitio (`slug` + ancla del encabezado). Idioma: español por defecto, inglés si la pregunta está en inglés.

## Permisos

`Viewer = { id, handle, role: 'public' | 'subscriber' | 'staff', emailVerified, entitlements: [{ kind, validUntil }] }`, resuelto por el puerto `ViewerPort` (`server/src/viewer.ts`). El contrato de cuentas está en `docs/accounts/README.md` de `adastra-site` (PR #21):

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

Hoy `subscriber` y `staff` pueden chatear. `staff` read-write queda para cuando haya herramientas de escritura (no las hay: el chat es de solo lectura).

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

## Variables de entorno

Todas con valor por defecto salvo las marcadas. En el VPS van en `~/deploy/env/astra-dev.env` (modo 600, formato `CLAVE=valor`).

| Variable                                                      | Defecto                                                         | Notas                                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                    | (la unidad pone `production`)                                   | En producción: sin stub de viewer, sin proveedor `fake`, key obligatoria                                                                                         |
| `DEEPSEEK_API_KEY`                                            | — **obligatoria en producción**                                 | Secreto                                                                                                                                                          |
| `ACCOUNTS_BASE_URL`                                           | `https://adastrarp.com`                                         | Servicio de cuentas (adastra-site)                                                                                                                               |
| `ALLOWED_ORIGINS`                                             | `https://development.adastrarp.com`                             | Coma separada. En dev suma `localhost:5173`                                                                                                                      |
| `ASTRA_SLOT`                                                  | `dev` (la unidad pone `blue`/`green`)                           | Define el puerto: blue 4101, green 4102, otro 4100                                                                                                               |
| `PORT`, `HOST`                                                | por slot, `127.0.0.1`                                           | Solo loopback                                                                                                                                                    |
| `TRUST_PROXY`                                                 | `true` en producción                                            | Confía en `X-Real-IP` de nginx                                                                                                                                   |
| `INDEX_PATH`, `BUILD_INFO_PATH`                               | `data/index.json`, `build.json`                                 | `build.json` lo escribe el deploy (sha, versión)                                                                                                                 |
| `EMBEDDER_URL`, `EMBEDDER_MODEL`, `EMBEDDER_TIMEOUT_MS`       | `127.0.0.1:8891/v1/embeddings`, `embeddinggemma-2`, 2500        | Local al VPS                                                                                                                                                     |
| `EMBEDDER_DIMS`                                               | 256                                                             | Cambiarlo exige regenerar el índice                                                                                                                              |
| `EMBEDDER_TOKEN`                                              | —                                                               | Secreto. Bearer para un embedder hospedado (Cloudflare). Exige https                                                                                             |
| `EMBEDDER_ACCEPT_MODELS`                                      | — (siempre incluye `EMBEDDER_MODEL`)                            | Modelos cuyos vectores se aceptan de un índice ajeno (tras `embed:compat`)                                                                                       |
| `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_TIMEOUT_MS` | `deepseek`, `https://api.deepseek.com`, `deepseek-flash`, 60000 | `fake` solo fuera de producción                                                                                                                                  |
| `ACCOUNTS_VIEWER_PATH`, `ACCOUNTS_TIMEOUT_MS`                 | `/api/auth/viewer`, 3000                                        |                                                                                                                                                                  |
| `ASTRA_DEV_VIEWER`                                            | —                                                               | Stub de dev. Ignorado en producción                                                                                                                              |
| `CHAT_MAX_QUESTION_CHARS`                                     | 800                                                             |                                                                                                                                                                  |
| `CHAT_MAX_HISTORY_TURNS`, `CHAT_MAX_HISTORY_TURN_CHARS`       | 6, 800                                                          |                                                                                                                                                                  |
| `CHAT_MAX_OUTPUT_TOKENS`, `CHAT_MAX_OUTPUT_CHARS`             | 700, 4000                                                       |                                                                                                                                                                  |
| `CHAT_TOP_K`, `CHAT_CONTEXT_MAX_CHARS`                        | 5, 9000                                                         |                                                                                                                                                                  |
| `CHAT_NATIVES_TOP_K`                                          | 3                                                               | Natives que se suman a los docs en el contexto. 0 = solo docs                                                                                                    |
| `CHAT_MIN_SEMANTIC_SCORE`                                     | 0.69                                                            | Calibrado con embeddinggemma-2 a 256 dims: 8 preguntas fuera de tema llegan a 0,68; 10 en tema bajan a 0,71. Muestra chica: revisar `meta.mode` con tráfico real |
| `CHAT_MAX_BODY_BYTES`                                         | 16384                                                           |                                                                                                                                                                  |
| `RATE_CHAT_VIEWER_PER_MIN`, `RATE_CHAT_IP_PER_MIN`            | 6, 20                                                           | Ventana deslizante de 60 s                                                                                                                                       |
| `RATE_SEARCH_IP_PER_MIN`                                      | 60                                                              | `searchDocs` público                                                                                                                                             |
| `DAILY_TOKENS_VIEWER`, `DAILY_TOKENS_GLOBAL`                  | 40000, 1000000                                                  | Reset 00:00 UTC                                                                                                                                                  |

Un valor inválido hace fallar el arranque con el listado de problemas (un deploy mal configurado no llega a vivo: `/ready` no responde y el script no cambia el slot).

## Límites conocidos

- **Rate limit, presupuesto y caché de viewer están en memoria del proceso.** Un reinicio los reinicia, y los dos slots (blue/green) no comparten estado: durante un deploy un viewer podría gastar el tope en cada uno. Aceptable para un VPS y un equipo chico; antes de escalar a varias instancias va un store compartido.
- La estimación de tokens (3 caracteres por token) es conservadora; el consumo real se concilia con el `usage` del proveedor.
- Sin caché de respuestas (el plan M3 lo menciona; falta).
- El umbral semántico (0,69) se calibró con 18 preguntas contra el índice real; es poca muestra. Los prefijos de tarea son los de EmbeddingGemma y no se compararon contra variantes.
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

```bash
cd server && bun install
NO_EMBED=1 bun run index                                   # índice por palabras clave (sin embedder)
ASTRA_DEV_VIEWER=subscriber LLM_PROVIDER=fake bun run dev  # 127.0.0.1:4100, chat con el proveedor de prueba
bun run check                                              # typecheck + tests (también corre en el `check` de la raíz)
```

Con `DEEPSEEK_API_KEY` en el entorno y sin `LLM_PROVIDER=fake`, el chat usa DeepSeek de verdad. El server no habla con Vite: la UI en dev debe apuntar a `http://127.0.0.1:4100` (el origen `localhost:5173` ya está permitido en dev).

## Pruebas (`bun test`, 128)

`chunk` (encabezados, anclas, partición, extractos), `search` (índice, ranking semántico, BM25, degradado con embedder caído, enfriamiento), `llm` (proveedor falso y DeepSeek con `fetch` simulado, sin `tools`), `permissions` (roles, puerto HTTP, stub ignorado en producción, 401/403/503, Origin), `limits` (rate limit, presupuesto, ruta HTTP), `chat` (formato SSE, topes, rechazo, citas, logs sin datos sensibles, `/ready`, GraphQL), `offline-embeddings` (índice en dos archivos, reutilización de vectores, compatibilidad entre embedders, token y reintentos) e `injection` (fixtures de inyección con un "modelo" que solo se porta bien si recibe exactamente nuestras instrucciones).

## Estado de verificación

| Qué                                                                                  | Estado                                                                                                                                       |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck + 128 tests del server, `bun run check` de la raíz                         | Verificado                                                                                                                                   |
| Índice por palabras clave con el corpus real (338 docs, 7.326 natives) y consultas   | Verificado: 10.254 fragmentos, 3-7 ms por consulta; búsquedas por nombre y hash exactas                                                      |
| Server en dev (stub + proveedor falso): `/health`, `/ready`, SSE, GraphQL            | Verificado a mano                                                                                                                            |
| Bundle de producción (solo deps de producción) arranca y responde `/ready` y 401     | Verificado a mano                                                                                                                            |
| Índice por palabras clave desde `content/docs` y degradado con embedder inalcanzable | Verificado                                                                                                                                   |
| DeepSeek real: respuesta con citas y rechazo fuera del tema                          | Verificado a mano contra la API (índice por palabras clave)                                                                                  |
| Índice semántico y ranking con el embedder real                                      | Verificado en la PC con el mismo modelo (llama.cpp local): 10.254 fragmentos, 57-183 ms por consulta, español contra docs en inglés funciona |
| Contrato de `/api/auth/viewer`                                                       | Tests con el payload real documentado por cuentas. **No verificado** contra el endpoint desplegado (PR #21 abierto)                          |
| Unidad systemd, vhost `/api/`, script y workflow                                     | **No verificado**: sin aplicar en el VPS (el script pasa `bash -n`; el workflow parsea como YAML)                                            |
