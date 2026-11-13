# Zona de chat (workspace de Ask Ether)

Plan vivo de la zona de chat. Fase 0 detallada abajo; fases 0b a 5 en esqueleto. Base: `feat/context-gate` (9670ca7, v0.12.0). Rama: `feat/chat-workspace`.

## Estado

| Fase | Qué                                                                                                                              | Estado                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 0    | Rol `owner` + registro de uso (telemetría)                                                                                       | **Implementada en v0.13.0**; tests y verificación local abajo                                   |
| 0b   | Dashboard de IA (solo owner)                                                                                                     | **Implementada en v0.14.0**, verificada en navegador (ver Fase 0b)                              |
| 1    | `/ask` workspace (página del chat con la IA; `POST /chat` es el endpoint) + context budget + output speed + editar/rewind/resend | En curso, v0.15.0 (`feat/chat-page`)                                                            |
| 2    | Herramientas `ejecutar` + `check` (sandbox en navegador)                                                                         | En curso, v0.19.0 (`feat/chat-tools`). **No se mergea antes de la revisión de seguridad de M4** |
| 3    | Memorias (localStorage)                                                                                                          | En curso, v0.16.0 (`feat/chat-memories`, base `feat/chat-page`)                                 |
| 4    | Cross-session                                                                                                                    | Esqueleto                                                                                       |
| 5    | Subagents                                                                                                                        | Esqueleto                                                                                       |

## Estado actual del código (base 9670ca7)

- `Role` = `public | subscriber | staff` en `server/src/config.ts:5` y `server/src/viewer.ts`. `parseViewer` deriva el rol; `role: 'staff'` de cuentas es el único camino a staff.
- `requireChatAccess` (`viewer.ts:203`) deja pasar `subscriber` y `staff`.
- `showThinking` (`server/src/app.ts:156`) y el gate de `project` (`server/src/project/service.ts:60`) comparan `=== 'staff'`.
- GraphQL expone `role` como `t.string` (`server/src/graphql.ts:56`): no hay enum que actualizar en server, pero sí validadores en cliente (`src/lib/ask/store.ts:117`, `src/lib/palette/recent.ts:8`, `src/lib/palette/types.ts:9`).
- Límites en memoria (`server/src/limits.ts`): `RateLimiter` (chat por viewer, chat por IP, search por IP, project por viewer) y `TokenBudget` (diario por viewer y global, reset 00:00 UTC). Config en `server/src/config.ts:~376-388`.
- Límites de tamaño y salida (`CHAT_MAX_*`) en `config.chat`.
- El cooldown de 30 s de `server/src/index/search.ts:274` es un **circuit breaker** del embedder caído, no un enfriamiento de usuario: no se toca.
- El proveedor DeepSeek pide `stream_options: { include_usage: true }` (`server/src/llm/deepseek.ts:53`). Nadie lee `timings` de llama.cpp todavía (grep vacío).
- Dos modelos locales además del LLM: decision d1 (`/v1/systemone`, follow-up y gate de contexto) en 8081. El embedder en 8891. **Todo llamado de GPU cuenta para GPU time**, no solo el LLM.

## Fase 0: plan

### 0.1 Rol `owner`

**Decisión propuesta: doble llave.** `owner` requiere las dos cosas:

1. `id` del viewer está en `OWNER_IDS` (env del server, lista separada por comas de ids de cuentas).
2. Cuentas responde `role: 'staff'` para ese mismo viewer.

Motivo: el allowlist solo no puede elevar a nadie que cuentas no considere staff, y sacar staff en cuentas revoca owner en hasta 5 s (la caché del viewer). Si preferís solo allowlist, es un cambio de una línea en `resolveRole`.

Reglas:

- Se implementa como **overlay** sobre el `ViewerPort` existente (`OwnerOverlayViewerPort`), no tocando `parseViewer`. El id nunca viene del cliente: sale de la respuesta de cuentas.
- `OWNER_IDS` vacío = no hay owners. Un id mal formado en la lista hace fallar el arranque (mismo patrón que el resto de `config`).
- `Role` pasa a `public | subscriber | staff | owner`. Helper `atLeast(role, 'staff')` = `staff` o `owner`; **todos** los chequeos de staff pasan por el helper (`showThinking`, gate de `project`, validadores de cliente y de palette).
- `owner` implica staff: ve `thinking`, usa `project`, todo lo de staff.
- `ASTRA_DEV_VIEWER=owner` da un owner directo en dev (id `dev-owner`, sin `OWNER_IDS`); se ignora en producción.
- Ids de owner nunca se loguean como rol de otro; el log sigue sin pregunta ni respuesta.

### 0.2 Qué se saltea el owner

| Límite                                                                                         | Owner                                                                   | Otros                                                 |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `RateLimiter` chat por viewer y por IP                                                         | No aplica                                                               | Aplica                                                |
| `RateLimiter` search por IP                                                                    | No aplica                                                               | Aplica                                                |
| `RateLimiter` project por viewer                                                               | No aplica                                                               | Aplica                                                |
| `TokenBudget` por viewer (`DAILY_TOKENS_VIEWER`)                                               | No aplica                                                               | Aplica                                                |
| `TokenBudget` global (`DAILY_TOKENS_GLOBAL`)                                                   | No aplica (decisión de Faku)                                            | Aplica                                                |
| Rondas por mensaje (`maxRounds`, ver 0.2b)                                                     | Tope propio `OWNER_MAX_ROUNDS` (def. 8) y pide confirmación para seguir | Tope fijo (3 en herramientas, subagents según config) |
| `CHAT_MAX_QUESTION_CHARS`, `CHAT_MAX_HISTORY_*`, `CHAT_MAX_OUTPUT_*`, `CHAT_CONTEXT_MAX_CHARS` | No aplica (topes del _sistema_, no del usuario)                         | Aplica                                                |
| `CHAT_MAX_BODY_BYTES`                                                                          | Aplica (protege al server de cuerpos gigantes)                          | Aplica                                                |
| Circuit breaker del embedder (30 s)                                                            | Aplica                                                                  | Aplica                                                |
| Caché de respuestas                                                                            | Aplica (la clave ya incluye el rol)                                     | Aplica                                                |

Decisión (Faku): el owner no tiene tope diario, ni por viewer ni global. El freno ante un bucle es el tope de rondas de 0.2b.

Implementación: un único punto de decisión, `policyFor(viewer)` → `{ rateLimits, viewerBudget, globalBudget, sizeCaps, maxRounds }`. Los limiters y el budget reciben la policy; no se agregan `if (role === 'owner')` dispersos.

### 0.2b Tope de rondas por mensaje (owner)

Lectura: una "ronda" es un paso interno dentro de un mismo mensaje del usuario (llamada a herramienta, subagent). Sin tope en tokens, lo que frena un bucle es el número de rondas. Al llegar a `OWNER_MAX_ROUNDS` (def. 8) el server corta, emite un evento SSE `confirm` (`{reason:"max_rounds", rounds}`) y el cliente muestra "Seguir"; seguir = nuevo request con `continue: true`, que reinicia el contador. Los no-owner usan el tope fijo de cada fase.

Fase 0 solo deja `policy.maxRounds` y la config; el contador y el evento `confirm` se implementan donde existan rondas (fases 2 y 5).

### 0.3 Registro de uso

**Escala:** el handler solo depende de `UsageSink`; la escritura es por lotes fuera de la ruta de la request. SQLite alcanza para un host; si otro proyecto o varias instancias lo necesitan, se extrae `UsageSink` y el esquema a un paquete compartido con adaptadores (Postgres, colector HTTP). No se arma antes de tener el segundo consumidor.

**Almacén: SQLite (`bun:sqlite`) en WAL**, en una ruta **fuera de los slots**, configurable con `USAGE_DB_PATH` (propuesta: `~/deploy/data/astra-dev/usage.sqlite`). Motivo: blue y green corren desde `~/deploy/astra-dev-server/<slot>` y un `server/data/` por slot dividiría el historial en dos. Con WAL y `busy_timeout`, dos procesos escriben sin problema. JSONL rotado se descarta: agregar sobre dos writers y rotaciones es más frágil que una consulta SQL.

Escritura: **una fila por request** al terminar el handler de `/chat` (en `finally`, igual que el log actual), incluidos los rechazos (`rate_limited`, `budget_exceeded`, `subscription_required`), para que "rate limits golpeados" salga de la misma tabla. La escritura nunca rompe la petición: `try/catch` y contador de errores de escritura.

```sql
CREATE TABLE usage_events (
  id            INTEGER PRIMARY KEY,
  ts            INTEGER NOT NULL,      -- epoch ms, inicio del request
  day           TEXT    NOT NULL,      -- YYYY-MM-DD UTC (para agregar sin funciones)
  request_id    TEXT    NOT NULL,
  route         TEXT    NOT NULL,      -- 'chat' (luego 'subagent', 'project', 'search')
  viewer_id     TEXT,                  -- id de cuentas; NULL anónimo
  viewer_handle TEXT,                  -- snapshot al momento del request
  role          TEXT    NOT NULL,      -- public|subscriber|staff|owner
  provider      TEXT,                  -- 'deepseek' | 'local' | NULL (sin modelo)
  model         TEXT,                  -- p. ej. 'deepseek-flash', 'lfm2.5'
  fallback_used INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  ttft_ms       INTEGER,               -- request -> primer delta
  duration_ms   INTEGER NOT NULL,      -- request -> done/error/abort
  gen_tps       REAL,                  -- output_tokens / (duration - ttft)
  outcome       TEXT    NOT NULL,      -- ok|cached|refused|rate_limited|budget_exceeded|llm_unavailable|viewer_unavailable|aborted|...
  cache_hit     INTEGER NOT NULL DEFAULT 0,
  gpu_ms        INTEGER,               -- solo local: suma de timings llama.cpp (ver 0.4)
  cost_usd_est  REAL                   -- solo deepseek: tokens x tabla de precios de config
);
CREATE INDEX usage_day        ON usage_events(day);
CREATE INDEX usage_viewer_day ON usage_events(viewer_id, day);
```

Lo que **no** se guarda: pregunta, respuesta, historial, fragmentos, IP (solo el hash que ya va al log), cookies, tokens de API. Retención: 180 días (purga al arrancar, sin job).

### 0.4 GPU time

- **Local:** llama.cpp devuelve `timings` (`prompt_ms`, `predicted_ms`) en la respuesta y, en streaming, en el último chunk (a verificar en la versión instalada). `gpu_ms` = suma de `prompt_ms + predicted_ms` de **todas** las llamadas locales del request: LLM, decision d1 (`/v1/systemone`), gate de contexto. Son tres llamadas distintas y las tres cuentan.
- **Medición:** `gen_tps` = tokens de salida / (primer a último delta); `ttft_ms` = de `prepare` al primer delta.
- **Embedder (8891):** sin confirmar si corre en GPU. Se mide por separado (`embed_ms`) y no entra en `gpu_ms` hasta confirmarlo.
- **DeepSeek:** no hay GPU. `cost_usd_est` por tokens con precios en config (`USAGE_PRICE_IN_PER_MTOK`, `USAGE_PRICE_OUT_PER_MTOK`).

Cambios: `LlmChunk` gana un tipo `timing` (`{ gpuMs }`), que emite solo el provider local. El provider DeepSeek no lo emite. Los clientes de decision y gate devuelven también `gpuMs` (hoy devuelven probabilidades).

Si `timings` no llega en streaming: `gpu_ms` queda `NULL` y el dashboard lo muestra como "no medido". No se repite la llamada para medir (duplicaría GPU).

### 0.5 Dónde se mide

En el handler de `/chat` (`server/src/app.ts`) y en el stream de `ChatService.events`. Se agrega un colector por request (`UsageCollector`): recibe `start`, `firstDelta`, `usage`, `timing`, `outcome`, y en `finally` escribe la fila. Así no hay que tocar cada `throw`.

### 0.6 Archivos previstos

| Archivo                                                | Cambio                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `server/src/config.ts`                                 | `Role` +owner; `OWNER_IDS`, `USAGE_DB_PATH`, precios, retención         |
| `server/src/viewer.ts`                                 | `OwnerOverlayViewerPort`; `atLeast()`; `requireChatAccess` acepta owner |
| `server/src/policy.ts` (nuevo)                         | `policyFor(viewer)`                                                     |
| `server/src/limits.ts`                                 | limiters y budget reciben policy                                        |
| `server/src/usage/store.ts` (nuevo)                    | SQLite, esquema, escritura segura, purga                                |
| `server/src/usage/collector.ts` (nuevo)                | `UsageCollector` por request                                            |
| `server/src/app.ts`                                    | policy en `/chat`; colector; `showThinking` con `atLeast`               |
| `server/src/llm/provider.ts`, `deepseek.ts`, `fake.ts` | chunk `timing` (solo local)                                             |
| `server/src/decision/*`, `gate.ts`                     | devolver `gpuMs`                                                        |
| `server/src/project/service.ts`                        | gate con `atLeast`                                                      |
| `server/src/boot.ts`                                   | cablear store y colector                                                |
| `src/lib/ask/store.ts`, `src/lib/palette/*`            | validadores con owner                                                   |
| `.env.example`                                         | variables nuevas                                                        |
| `server/.gitignore` o raíz                             | `data/` ya ignorado; el sqlite vive fuera                               |

## Tests (fase 0)

Explícitos, nombrados por contrato:

- `permissions.test.ts`:
  - owner con id en `OWNER_IDS` y staff en cuentas → `owner`.
  - id en `OWNER_IDS` pero cuentas dice `member` → **no** owner (`subscriber`/`public`).
  - staff sin id en la lista → `staff`, no `owner`.
  - `OWNER_IDS` vacío → nadie es owner.
  - `OWNER_IDS` con basura → arranque falla.
  - `ASTRA_DEV_VIEWER=owner` en producción → ignorado.
- `limits.test.ts`:
  - **owner nunca recibe 429** `rate_limited` en chat (IP y viewer), search ni project, con N requests > límite.
  - **owner nunca recibe** `budget_exceeded` por viewer; con el global agotado sí lo recibe.
  - **staff sí recibe** 429 en la misma secuencia (control negativo).
  - Tope `CHAT_MAX_QUESTION_CHARS` no se aplica a owner; `CHAT_MAX_BODY_BYTES` sí.
- `usage.test.ts`:
  - una fila por request, incluidos rechazos `rate_limited` y `subscription_required`.
  - texto de pregunta y respuesta **no aparecen** en ninguna columna (se busca el texto literal en la base).
  - fallo de escritura (ruta sin permiso) no rompe la respuesta.
  - dos conexiones escriben en paralelo sin `SQLITE_BUSY`.
  - purga borra solo lo anterior a la retención.
- `llm.test.ts`: `timing` llega solo del provider local; DeepSeek nunca lo emite.

Todos sin red: `fetch` simulado, como los tests actuales.

## Estado de verificación (fase 0)

| Qué                                                                                                                                 | Estado                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `bun run check` de la raíz (oxlint, typecheck, 325 tests) y del server (typecheck, 238 tests, 29 nuevos)                            | Verificado, exit 0                                                                         |
| Owner nunca recibe 429 ni `budget_exceeded`; staff sí con la misma secuencia                                                        | Verificado con tests (`owner.test.ts`)                                                     |
| Server real con `ASTRA_DEV_VIEWER=owner`, límite de 2/min y 5 requests seguidos                                                     | Verificado a mano: 5 x 200, `viewer.role = owner`                                          |
| Registro de uso: una fila por request, sin texto de la conversación, fallo de escritura sin efecto, dos conexiones al mismo archivo | Verificado con tests (`usage.test.ts`) y mirando la base real                              |
| llama.cpp entrega `timings` en el último chunk del stream (build b12314, LFM2.5, puerto 8080)                                       | Verificado con `curl`; `gpu_ms` 6964 ms en un request real contra el modelo local          |
| `gpu_ms` de decision d1 (`/v1/systemone`) y del gate                                                                                | **No hecho**: hoy `gpu_ms` cubre solo el LLM. Falta verificar qué devuelve `/v1/systemone` |
| Embedder en GPU o CPU                                                                                                               | **Sin confirmar**; no entra en `gpu_ms`                                                    |
| `OwnerOverlayViewerPort` contra cuentas reales                                                                                      | **No verificado**: solo con payloads simulados (cuentas solo existe en producción)         |
| Navegador                                                                                                                           | **No hay navegador en esta sesión**. La fase 0 solo toca validadores de rol del cliente    |

## Riesgos

- `timings` viene en stream en b12314; en otra versión podría faltar → `gpu_ms` NULL.
- Overlay de owner depende de la caché de cuentas (5 s): una revocación tarda hasta 5 s en surtir efecto. Mismo límite que staff hoy.
- Contadores en memoria siguen sin compartirse entre slots (límite ya documentado); la base sí se comparte.
- Retención y privacidad: viewer id y handle son datos personales internos. Solo owner los lee (0b).

## Fases siguientes (esqueleto)

- **0b Dashboard de IA** (`/dashboard`, owner): endpoint que agrega `usage_events` (día/semana/mes, por proveedor y modelo, top viewers, rate limits, errores/fallbacks, cache hit, TTFT y tokens/s promedio, GPU time total y por modelo, costo estimado). Sigue `~/.claude/standards/DESIGN.md` y el `DESIGN.md` del proyecto. Sin librerías de chart nuevas si el DS trae `charts.css`.
- **1 `/ask`** (página; el endpoint sigue siendo `POST /chat`): workspace (transcript, composer, rail). Context budget con `contextWindow` por proveedor (nuevo `LLM_CONTEXT_WINDOW`) y `usage` de `done`. Output speed medido en cliente. Editar mensaje = rewind + resend en cliente.
- **2 Herramientas**: protocolo `<herramienta nombre="ejecutar">` (corte de stream en el server, ejecución en el navegador con wasmoon, resultado como rol `tool` escapado, máx. 3 rondas). `check` determinista en cliente sobre bloques `lua` pegados. Bloqueada por revisión de seguridad de M4.
- **3 Memorias**: localStorage, inyectadas como dato en bloque propio con tope, no cacheadas.
- **4 Cross-session**: sesiones locales, el usuario elige cuáles adjuntar, resumen para el presupuesto.
- **5 Subagents**: llamadas LLM aparte, sin herramientas, con tope de cantidad y tokens; cuentan contra cupo salvo owner.

## Decisiones tomadas

1. Owner = id en `OWNER_IDS` Y staff en cuentas (default recomendado; Faku no entendió la pregunta, se explicó). Cambiable a solo allowlist.
2. Owner sin tope diario (ni por viewer ni global). Tope de rondas por mensaje con confirmación (0.2b).

## Fase 0b: dashboard de IA (v0.14.0)

Página `/dashboard` (solo owner), servida por la query GraphQL `aiUsage(days)` del server, que agrega sobre `usage_events`.

- **Acceso:** `aiUsage` exige `owner` (`unauthenticated` si no hay sesión, `owner_required` para cualquier otro rol, `usage_unavailable` sin `USAGE_DB_PATH`). La página muestra un solo aviso a quien no es owner. No está en el sidebar: se llega por URL o por el palette (Ctrl+K, entrada visible solo para owner).
- **Periodos:** hoy, 7, 30 y 90 días (el server admite 1 a 180). Los días son UTC y todos aparecen, los vacíos como cero.
- **Contenido:** requests, tokens (entrada y salida), tiempo de GPU, costo estimado, aciertos de caché, límites golpeados (frecuencia y presupuesto), primer token y velocidad promedios, errores y fallbacks; tokens y GPU por día; tabla por modelo; top 10 de usuarios por tokens; resultados de cada request.
- **Gráficos:** sin librerías nuevas. Reusa `ColumnChart` y `ChartCard` de Roadmap (con vista de tabla y teclado) y los colores `--chart-*` ya validados.
- **Archivos:** `server/src/usage/report.ts` y `schema.ts`; `src/pages/AiUsage.tsx`, `src/components/ai/UsageTables.tsx`, `src/lib/ai/`.
- **Límite conocido:** `gpu_ms` solo cubre el LLM local; la página lo dice. El costo es una estimación con la tabla de precios de `USAGE_PRICE_*`.

### Verificación de 0b

| Qué                                                                                                                                                                          | Estado                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Tests del server (agregados, ventana, días vacíos, clamp, acceso por rol) y del cliente (formatos, palette, migas)                                                           | Verificado                                                            |
| Navegador real (Edge headless con puppeteer-core): owner a 1280 y 375 px, sin scroll horizontal, sin errores de consola, cambio de periodo, "Ver tabla", entrada del palette | Verificado con capturas                                               |
| Staff ve el aviso "Solo para el owner" y el server devuelve `owner_required`                                                                                                 | Verificado                                                            |
| Datos                                                                                                                                                                        | Base sembrada a mano (903 requests simulados), no tráfico real        |
| Contraste y estados de foco                                                                                                                                                  | Sin medir con herramienta; solo reusa tokens y componentes existentes |
| Navegador del usuario (Chrome, Safari)                                                                                                                                       | No probado                                                            |

## Fase 1: `/ask` workspace (v0.15.0, rama `feat/chat-page`)

Base: `feat/chat-workspace` (dfc04f7). Cuando #30 mergee, retargetear a `feat/context-gate`.

Alcance: página `/ask` con transcript, composer y rail. Mismo store (`askStore`) y mismos componentes que el panel; el panel gana el enlace "Abrir en página" y las acciones de editar/reenviar. Sin herramientas (fase 2). `POST /chat` sigue siendo el endpoint.

### Archivos

| Archivo                                             | Cambio                                                                                                                                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/src/config.ts`                              | `LLM_CONTEXT_WINDOW` (int; default 8192 en local, 65536 en deepseek, a confirmar) en `config.llm.contextWindow`                                                                                          |
| `server/src/boot.ts`                                | pasa `contextWindow` a `ChatService`                                                                                                                                                                     |
| `server/src/chat/service.ts`                        | `meta` lleva `contextWindow` (opcional en `ChatDeps`)                                                                                                                                                    |
| `server/tests/chat.test.ts`, `server/tests/config*` | contrato de `meta`; parseo y rango de `LLM_CONTEXT_WINDOW`                                                                                                                                               |
| `src/lib/ask/types.ts`                              | `meta.contextWindow?`                                                                                                                                                                                    |
| `src/lib/ask/store.ts`                              | `Turn.timing` (inicio, primer delta, fin), `Turn.usage`, `AskState.contextWindow`; `applyEvent(turn, ev, at?)`; `edit(id, texto)`, `resend(id)`, `rewind(id)`; `now` inyectable                          |
| `src/lib/ask/budget.ts` (nuevo)                     | puro: `contextUsage(turns, ventana, borrador)` → usado, límite, nivel (ok, warn desde 80 %, full desde 100 %); `outputSpeed(turn)` → tok/s; `ttft(turn)`; estimación `ceil(chars/3)` igual que el server |
| `src/components/ask/Conversation.tsx` (nuevo)       | `Transcript`, `TurnView`, `Empty`, `Composer` extraídos de `AskPanel.tsx`; `TurnView` gana Editar/Reenviar y la línea de velocidad                                                                       |
| `src/components/ask/ContextBudget.tsx` (nuevo)      | medidor `role="meter"` + texto "X de Y tokens"; ok/warn/full con icono y texto, no solo color                                                                                                            |
| `src/components/ask/AskPanel.tsx`                   | usa `Transcript`/`Composer`; enlace "Abrir en página" a `/ask`                                                                                                                                           |
| `src/pages/Ask.tsx` (nuevo)                         | `PageHeader` + transcript + composer (sticky abajo) + rail (presupuesto, velocidad de la última respuesta, sesión, "Nueva conversación"); gate para `public`                                             |
| `src/routes.tsx`                                    | `{ path: '/ask', element: <Ask /> }`                                                                                                                                                                     |
| `src/lib/i18n.ts`                                   | claves `ask.page.*`, `ask.edit*`, `ask.resend`, `ask.budget.*`, `ask.speed.*`, `ask.rail.*` en ES y EN                                                                                                   |
| `src/lib/ask/budget.test.ts`, `ask.test.ts`         | presupuesto, velocidad, edit/resend/rewind, timings, `contextWindow` desde `meta`                                                                                                                        |
| `src/components/ask/ask-page.test.tsx`              | render: rail en los tres niveles, Editar/Reenviar deshabilitados mientras responde, gate para public                                                                                                     |
| `docs/server/README.md`, `docs/ask/README.md`       | contrato `meta.contextWindow`, variable nueva                                                                                                                                                            |
| `package.json` (raíz)                               | 0.14.2 → 0.15.0                                                                                                                                                                                          |

### Context budget

- Servidor: `contextWindow` sale de `LLM_CONTEXT_WINDOW` y viaja en `meta`, que llega antes que cualquier texto: el medidor existe durante el stream.
- Cliente: lo usado es `inputTokens + outputTokens` del último `done` con uso real (no caché, no rechazo): lo que la ventana sostuvo en ese envío. El borrador suma `ceil(chars/3)` como estimación de lo próximo.
- Historial: el cliente manda como mucho 3 intercambios (`historyFor`); el medidor refleja eso.
- Si el proveedor no reporta uso (fallback o fake), el texto dice que es estimación.

### Velocidad de salida (cliente)

- `startedAt` al enviar, `firstDeltaAt` en el primer `delta`, `doneAt` en el `done`.
- `ttft = firstDeltaAt - startedAt`. `tok/s = outputTokens / ((doneAt - firstDeltaAt) / 1000)`, solo con al menos 200 ms de stream y `outputTokens > 0`. Respuestas de caché no muestran velocidad.
- Se mide en el navegador, así que incluye la red. No se mezcla con el `ttft` del log del server.

### Editar, reenviar, rewind

- `rewind(id)`: corta la respuesta en curso si la hay; quita el turno `id` y los siguientes.
- `edit(id, texto)` = `rewind(id)` + `ask(texto)`. `resend(id)` = `rewind(id)` + `ask(pregunta)`.
- El historial sale de los turnos que quedan: la edición no arrastra respuestas viejas. Sin endpoint nuevo.

### Tests (`bun test`)

- Presupuesto: nivel ok/warn/full en los bordes (79/80 %, 99/100 %); sin uso → estimación; caché no cuenta.
- Velocidad: cálculo exacto con `now` inyectado; stream menor a 200 ms → sin dato; caché → sin dato.
- Store: `edit` corta la respuesta en curso y reenvía con el historial correcto; `resend` deja un solo turno nuevo; `rewind` no toca turnos anteriores.
- Server: `meta.contextWindow` igual a la config; `LLM_CONTEXT_WINDOW` fuera de rango falla al arrancar.

### Verificación en navegador (puppeteer-core + Edge, `E:\Proyectos\_scratch\browser`)

- `bun dev --fake`, viewer owner. 1280 y 375 px: sin scroll horizontal, rail legible, composer visible.
- Teclado: Tab por el transcript; Editar abre el campo con foco; Esc cancela; Enter envía; foco visible.
- Estados: vacío, error (`llm_unavailable`), rate limit (429 con `retryAfter`), público (gate), medidor en ok/warn/full.
- Velocidad aparece tras una respuesta del fake; una respuesta de caché no la muestra.
- Consola sin errores. Capturas en `E:\Proyectos\_scratch\chat-page\`.

## Fase 3: memorias del usuario (v0.16.0, rama `feat/chat-memories`)

Base: `feat/chat-page` (PR #31). Decisión de Faku: las memorias viven en el navegador (`localStorage`), no en el server y no se cachean.

### Modelo de datos

- Clave `astra.ask.memories.v1`: `{ v: 1, items: Memory[] }`.
- `Memory = { id: string, text: string, enabled: boolean, createdAt: number, updatedAt: number }`. `id` = `crypto.randomUUID()` (fallback `Date.now().toString(36)+random`).
- Topes (cliente, constantes en `src/lib/ask/memories.ts`, espejo de las del server): 12 memorias, 280 caracteres cada una, 2000 caracteres entre las activas. Texto con `trim`, sin vacío, sin caracteres de control; los duplicados exactos se rechazan.
- Lectura defensiva: JSON ilegible, versión desconocida o forma inválida → lista vacía (no se borra lo guardado hasta la próxima escritura válida). Los ítems inválidos se descartan uno a uno.

### UI

- Sección "Memorias" en el rail de `/ask` (componente nuevo `MemoriesPanel`; no se tocan los estilos existentes del rail de v0.15.1). Contador "N activas de M".
- Listar: cada memoria con casilla activar/desactivar (`role="switch"`), texto, Editar y Borrar. Crear: campo de una línea + "Agregar" (Enter agrega; las memorias son de una sola línea). Editar: inline con foco, Enter guarda, Esc cancela. Borrar: inmediato con aviso `role="status"` y "Deshacer" (sin diálogo).
- Targets de 44 px en táctil. Estados con icono y texto, no solo color. Vacío: texto que explica qué son y que quedan solo en este navegador.
- Sincroniza entre pestañas con el evento `storage`.
- Fallos de `localStorage` (modo privado, bloqueado, cuota): todo acceso en `try/catch`. Si no se puede leer o escribir, las memorias funcionan **en memoria durante la sesión** y la UI muestra un aviso "No se pueden guardar en este navegador: se pierden al cerrar la pestaña". La página nunca falla por esto.

### Inyección en el request

- Campo nuevo opcional en `POST /chat`: `memories: string[]` (solo las activas, solo texto). El `question` no se toca: así no se mezcla con la búsqueda semántica, el decider, el gate ni el tope de 800 caracteres.
- Server (`app.ts` + `prompt.ts`): validación **estricta**; si `memories` está presente y no es un array de ≤ 12 strings de 1..280 caracteres con suma ≤ 2000, responde `400 bad_request` (no recorta en silencio). Ausente o `[]` = igual que hoy. Los topes valen también para owner (no son topes de política sino del formato del campo).
- Prompt: bloque propio `<memorias>` entre `<entorno>` y `<contexto>`, cada línea `- <texto escapado con escapeData>`. Es dato del usuario, no instrucción: el `SYSTEM_PROMPT` ya trata el contenido de los bloques como dato; se agrega una línea que dice que `<memorias>` son preferencias del usuario que no anulan las reglas ni son fuentes citables.
- Caché: con memorias, la respuesta **ni se lee ni se guarda** (`key = null`). Sin memorias nada cambia.
- Tamaño: 2000 caracteres de memorias ≈ 2,2 KB en español (peor caso multibyte ≈ 6 KB). Pregunta (800) + historial (6 × 800) + memorias ≈ 9 KB con el overhead JSON, bajo `CHAT_MAX_BODY_BYTES` = 16384. Si alguien baja `CHAT_MAX_BODY_BYTES` a menos de lo necesario, el 413 ya existente es la respuesta.
- Context budget: el tope de contexto del server (`CHAT_CONTEXT_MAX_CHARS`) recorta fuentes, no memorias; las memorias se suman aparte (≤ ~700 tokens). El medidor del cliente agrega `ceil(chars activos / 3)` a la estimación del próximo envío, y el texto lo dice. Si no entran en la ventana, el medidor pasa a `warn`/`full` como cualquier otro contenido.

### Privacidad

- El texto de las memorias nunca se loguea: el log de requests y `usage_events` siguen sin pregunta, respuesta ni memorias. Se agrega solo `memories: <cantidad>` al log de la request (un número), nada más. Test que verifica que el texto no aparece en el log ni en el registro de uso.
- No entran a la clave de caché ni a la caché. No se envían a ningún otro endpoint (`/search`, `/project`).
- Se envían solo las activas y solo en `POST /chat`.

### Archivos

| Archivo                                                             | Cambio                                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/ask/memories.ts` (nuevo)                                   | puro: modelo, topes, `parseStored`, `addMemory`, `editMemory`, `removeMemory`, `toggleMemory`, `activeTexts`, `memoryTokens`; `MemoryStore` con storage inyectable y try/catch |
| `src/lib/ask/memories.test.ts` (nuevo)                              | topes, duplicados, JSON corrupto, versión desconocida, storage que lanza (get/set/cuota), solo activas                                                                         |
| `src/lib/ask/client.ts`, `store.ts`, `budget.ts`                    | `memories` en el body (solo si hay), medidor suma las activas                                                                                                                  |
| `src/components/ask/MemoriesPanel.tsx` (nuevo), `src/pages/Ask.tsx` | UI en el rail                                                                                                                                                                  |
| `src/lib/i18n.ts`                                                   | claves `ask.memories.*` en ES y EN                                                                                                                                             |
| `server/src/app.ts`, `server/src/chat/{prompt,service}.ts`          | validación estricta, bloque `<memorias>`, sin caché, contador en el log                                                                                                        |
| `server/tests/chat.test.ts`                                         | 400 por forma/tope, bloque en el prompt y escapado, sin caché, sin texto en log/uso                                                                                            |
| `docs/server/README.md`, `docs/ask/README.md`                       | contrato del campo `memories`                                                                                                                                                  |
| `package.json` (raíz)                                               | 0.15.0 → 0.16.0                                                                                                                                                                |

### Verificación en navegador

`bun dev --fake` como owner, 1280 y 375 px: crear, editar, borrar con deshacer, activar/desactivar, recarga persiste, dos pestañas se sincronizan, teclado completo, `localStorage` bloqueado (aviso, sigue funcionando en memoria), sin scroll horizontal, consola limpia.

## Fase 2: herramientas `ejecutar` y `check` (v0.19.0, rama `feat/chat-tools`, issue #40)

> **BLOQUEADA: no se mergea antes de la revisión de seguridad humana de M4.** Modelo de amenazas, controles y checklist manual en [`tools-security.md`](./tools-security.md).

Base: `origin/dev` (8db31aa, v0.18.1). Decisiones de Faku: el sandbox corre en el navegador; `LlmProvider` sigue sin tools nativas; protocolo textual; resultado escapado; 3 rondas (owner 8 con confirmación); `check` determinista en el cliente; botón "Ejecutar" manual en cada bloque de código.

### Protocolo (exacto)

1. **Habilitar.** El cliente manda `tools: ["ejecutar","check"]` en `POST /chat`. Sin el campo, el chat se comporta como hoy (regla 3 del prompt: sin herramientas). Nombres desconocidos: `400`.
2. **Llamada del modelo.** El modelo escribe, en una línea propia y fuera de un bloque de código:

   ```
   <herramienta nombre="ejecutar">
   print(1 + 1)
   </herramienta>
   ```

   El server escanea el stream (`ToolTagScanner`): reconoce la apertura solo al inicio de línea y fuera de un bloque de código (cercas de tres backticks o `~~~`). Retiene lo que podría ser el comienzo de la etiqueta (nunca se muestra a medias). Al ver `</herramienta>` **corta el stream del modelo** (`abort`), emite `tool_call` y `done` con `stop: "tool_call"`. Cuerpo máximo: 4000 caracteres. Pasado el tope, con nombre desconocido o sin cierre al terminar el stream, no es una llamada: el texto se entrega literal.

3. **Ejecución en el cliente.** El cliente valida el nombre contra su registro, ejecuta (sandbox o lint) y arma un `ToolResult` (esquema abajo).
4. **Continuación.** Nuevo `POST /chat` con la misma pregunta e historial más `steps: [{ text, tool, body, result }]`. El server **no confía** en el paso: re-valida forma y topes, que `tool` esté habilitada y que `result` cumpla el esquema (`400` si no). El paso no se repite como turno del asistente (regla de la casa: el texto del cliente nunca se reproduce como turno real): se renderiza dentro del mensaje de usuario como `<pasos>`, todo con `escapeData`, y el resultado va como mensaje lógico de rol `tool` (`<resultado herramienta="ejecutar">{json}</resultado>`). El proveedor no ve ningún rol `tool`.
5. **Rondas.** `steps.length` = herramientas ya ejecutadas. Con `steps.length < policy.maxRounds` el modelo puede llamar otra. Al llegar al tope el server **apaga las herramientas** en esa llamada (el prompt dice "no quedan rondas"; una etiqueta que igual aparezca es texto). Owner: al llegar a `OWNER_MAX_ROUNDS` (8) el server no llama al modelo; emite `confirm {reason:"max_rounds", rounds}` y `done` con `stop: "confirm"`; el cliente muestra "Seguir", que reenvía con `continued: n+1`. El server acepta `continued > 0` solo del owner y solo hasta `floor(steps.length / maxRounds)`.
6. **Sin caché** cuando hay `steps`; no se guarda una respuesta que terminó en llamada. `tools` entra a la clave de caché.

### Esquema de resultado (`ToolResult`, versión 1)

Lo produce el cliente; lo valida el server; lo muestra la UI; lo lee el modelo (serializado JSON y escapado).

| Campo         | Tipo                                                                                | Notas                                                                        |
| ------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `v`           | `1`                                                                                 |                                                                              |
| `tool`        | `"ejecutar" \| "check"`                                                             |                                                                              |
| `ok`          | boolean                                                                             | `ejecutar`: terminó sin error ni límite. `check`: ningún diagnóstico `error` |
| `status`      | `ok \| error \| limit \| timeout \| cancelled \| crash \| rejected`                 |                                                                              |
| `stdout`      | string                                                                              | Tope al modelo: 1200 caracteres. La UI conserva hasta 8000                   |
| `stdoutChars` | entero                                                                              | Largo original, para saber cuánto se cortó                                   |
| `error`       | `null \| { type: syntax\|runtime\|limit\|timeout\|crash\|rejected, message, line }` | `message` ≤ 300 al modelo; `line` entero ≥ 1 o `null`                        |
| `diagnostics` | `{ severity: error\|warning, line, column, message }[]`                             | Solo `check`. ≤ 10 al modelo, `message` ≤ 140                                |
| `durationMs`  | entero ≥ 0                                                                          | Tiempo del snippet, sin cargar el runtime                                    |
| `truncated`   | boolean                                                                             | Algo se cortó (stdout, mensaje o diagnósticos)                               |

`returned` (valor de retorno) **no existe**: el sandbox de M4 ejecuta el snippet sin capturar retorno y esta fase no amplía su superficie; el modelo debe usar `print`. Los topes viven en un solo archivo por lado (`src/lib/ask/tool-result.ts` y `server/src/chat/tool-result.ts`, mismos números).

`check` = lint determinista (luaparse + reglas del sandbox, sin ejecutar el código): error de sintaxis con línea y columna, locales sin usar, globales que el sandbox no tiene. No llama al modelo.

### Contrato HTTP/SSE (se documenta en `docs/server/README.md`)

- Body nuevo, todo opcional y **estricto** (`400 bad_request` si no cumple): `tools: string[]` (≤ 8, únicos, del registro), `steps: Step[]` (≤ 24; suma de caracteres ≤ 24000, owner 80000), `continued: entero ≥ 0`. `steps` o `continued` sin `tools` también es `400`. Tope del cuerpo: `CHAT_MAX_BODY_BYTES` y, si hay `steps`, más `CHAT_MAX_STEPS_BYTES` (def. 98304).
- Eventos nuevos: `tool_call {round, name, body}`, `confirm {reason, rounds}`; `done.stop?: "tool_call" | "confirm"`.

### Registro de herramientas (para #41 `guardar_memoria`)

Server: `TOOLS` en `server/src/chat/tools.ts` (`name`, `bodyMax`, `describe` para el prompt). Cliente: `CLIENT_TOOLS` en `src/lib/ask/tools.ts` (`run(body, signal) → ToolResult`). Sumar una herramienta = una entrada en cada registro y sus tests; el escáner, las rondas, el esquema y la UI no cambian.

### Archivos

| Archivo                                                                          | Cambio                                                                              |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `server/src/chat/tools.ts`, `tool-result.ts` (nuevos)                            | registro, escáner, `parseSteps`, `parseToolResult`, render escapado                 |
| `server/src/chat/prompt.ts`, `service.ts`                                        | `systemPrompt(tools)`, `<pasos>`, escáner en el stream, `tool_call`, `confirm`      |
| `server/src/app.ts`, `config.ts`, `policy.ts`, `sse.ts`                          | body estricto, `CHAT_MAX_STEPS_BYTES`, `policy.confirmRounds`, eventos              |
| `src/lib/ask/tool-result.ts`, `tools.ts` (nuevos)                                | esquema, topes, conversión desde el sandbox, registro de cliente                    |
| `src/lib/ask/{types,sse,client,store}.ts`                                        | eventos, `tools`/`steps`/`continued`, bucle de rondas, `Turn.tools`, `continueTurn` |
| `src/components/ask/{Conversation,AnswerBody,ToolStep}.tsx`, `doc/CodeBlock.tsx` | tarjeta del paso, "Seguir", botón Ejecutar en bloques `lua`                         |
| `src/lib/i18n.ts`, `package.json` (0.19.0)                                       | claves ES/EN, versión                                                               |
| `docs/chat/tools-security.md`, `docs/server/README.md`, `docs/ask/README.md`     | amenazas y checklist, contrato                                                      |

### Tests (`bun test`)

- **Server:** escáner (etiqueta partida entre deltas, dentro de bloque de código, con texto antes en la línea, entre backticks, nombre desconocido, sin cierre, cuerpo sobre el tope, dos llamadas: corta en la primera); `parseSteps` y `parseToolResult` (forma, topes, tipos, campos extra); render escapado (`<`, `&`, etiqueta forjada dentro de stdout); rondas (3, owner 8 → `confirm`, `continued` de no-owner → 400, tope absoluto); corte del stream del proveedor al cerrar la etiqueta; sin caché con `steps`; contrato HTTP.
- **Cliente:** esquema (conversión desde cada `RunResult`, topes, `truncated`); registro (herramienta desconocida → `rejected`); bucle del store con `fetch` simulado (llamada → ejecución → continuación con `steps` → respuesta final; tope; Detener durante la ejecución; `confirm` → Seguir); parseo SSE de los eventos nuevos.

### Verificación en navegador (Edge headless, `E:\Proyectos\_scratch\browser`)

Mock de API que emite el protocolo (`tool_call`, continuación, `confirm`) con el sandbox real. 1280 y 375 px, claro y oscuro, teclado. Casos: ejecución feliz con salida; error con línea; bucle infinito cortado por tiempo; salida enorme truncada; `check` con diagnósticos; botón Ejecutar manual sobre un bloque `lua`; owner con "Seguir"; Detener durante la ejecución; consola sin errores. El resultado va a `tools-security.md` separado en "Verificado por Ether" y "Pendiente de Faku".

## Fase 2b: memorias guardadas por el modelo (v0.19.7, rama `feat/chat-memory-tools`, issue #41)

> **BLOQUEADA, apilada sobre #45** (`feat/chat-tools`, a su vez bloqueada por la revisión de seguridad humana de M4). El PR va contra `feat/chat-tools`. Amenazas nuevas y checklist en [`tools-security.md`](./tools-security.md#7-memorias-escritas-por-el-modelo-v0197-issue-41).

Base: `origin/feat/chat-tools` (8be750d). Sin cambios al protocolo, al escáner, a las rondas ni al esquema `ToolResult` v1: son tres entradas en `TOOLS` (server) y en `CLIENT_TOOLS` (cliente).

### Plan (corto)

| Tema                 | Decisión                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Herramientas         | `guardar_memoria` (cuerpo = texto), `editar_memoria` (primera línea = número, el resto = texto nuevo), `borrar_memoria` (cuerpo = número). Se ejecutan **en el cliente**: las memorias viven solo en `localStorage`; el server nunca las guarda.                                                                                                                                                         |
| Identificador        | Las memorias activas ya viajan como `string[]` (contrato intacto). Con herramientas de memoria habilitadas el prompt las **numera** (`1. …`). El número es la posición en la lista **de ese envío**: el cliente guarda esa foto (`id` + texto) y resuelve contra ella. Si la memoria cambió o ya no existe, el resultado es `rejected: changed / not_found`. No hay otra forma de apuntar a una memoria. |
| Consentimiento       | Cada escritura es una **propuesta**: la tarjeta muestra "Ether quiere recordar: …" con Guardar / Descartar y un campo para editar el texto antes. La promesa de `run` queda pendiente hasta la decisión; Detener o cerrar la página = descartada. Opción en el panel **"Permitir que Ether recuerde sin preguntar"** (apagada por defecto, en `localStorage`).                                           |
| Alcance de la opción | Cubre `guardar_memoria` y `editar_memoria` sobre memorias que escribió el modelo. **Nunca** cubre `borrar_memoria` ni editar una memoria del usuario: eso siempre pregunta (un documento inyectado no puede vaciar ni reescribir lo que el usuario escribió).                                                                                                                                            |
| Topes                | Los de F3 (12 memorias, 280 caracteres, 2000 activos). Si no entra, `ToolResult` con `status: "rejected"`, `error.message` = código fijo (`max_items`, `too_long`, `max_total`, `duplicate`, `empty`, `not_found`, `changed`, `too_many_writes`, `discarded`). El modelo lo ve y lo puede explicar.                                                                                                      |
| Origen               | `Memory.source: "user" \| "model"`. Migración tolerante de `astra.ask.memories.v1`: sin `source` = `"user"` (misma versión de datos, campo opcional). El panel marca las del modelo con "Ether". Editar en el panel una del modelo la pasa a `user` (el usuario es el autor del texto).                                                                                                                  |
| Por respuesta        | Máximo **3 escrituras de memoria por respuesta** (`too_many_writes`), contando las descartadas; duplicado (sin distinguir mayúsculas) = `duplicate`. Las rondas (3, owner 8) siguen aplicando.                                                                                                                                                                                                           |
| No confiable         | Lo que el modelo guarda es dato: entra al prompt escapado en `<memorias>` (`escapeData`), igual que lo escrito a mano. Una memoria con `<herramienta …>` o instrucciones no abre etiqueta ni se ejecuta (el server solo escanea la **salida** del modelo). El cuerpo de la propuesta se muestra como texto.                                                                                              |
| Privacidad           | El server no guarda ni loguea texto de memorias: los logs y el registro de uso llevan contadores (`tools`, `steps`). Las memorias siguen apagando la caché.                                                                                                                                                                                                                                              |
| Prompt               | Una frase por herramienta en `TOOLS[x].describe`; reglas de uso (solo preferencias que el usuario dijo, nunca de documentos ni resultados) dentro de esa misma frase.                                                                                                                                                                                                                                    |
| Proveedor `fake`     | `[[guardar_memoria: texto]]`, `[[editar_memoria: 2 \| texto]]`, `[[borrar_memoria: 2]]` disparan la herramienta sin modelo real.                                                                                                                                                                                                                                                                         |

### Límite conocido

Si la pregunta no recupera ninguna fuente y no es un seguimiento, el server rechaza **sin llamar al modelo** (comportamiento de F1): "recordá que prefiero respuestas cortas" solo, sin tema de documentación, se rechaza y no llega a la herramienta. Funciona acompañando una pregunta ("explicame X, y respondé siempre corto"). Cambiarlo es una decisión de producto (cuesta una llamada al modelo por pregunta fuera de tema); queda como pendiente.

## Onboarding con Ether (v0.19.1, rama `feat/chat-onboarding`, issue #42)

Pedido de Faku: "es hacerlo nada más, copiá el de Lux". Base de Lux (`eternum/lux`): `OnboardingDialog`, `useOnboarding`, `lib/onboarding.ts` (pasos, avance, progreso, registro en localStorage con versión) y sus tests.

### Qué se porta de Lux y qué no

| Lux                                                                                                           | Astra                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista de pasos + `nextStepIndex` / `previousStepIndex` / `isLastStep` / `onboardingProgress` (puro, con test) | Igual, en `src/lib/ask/onboarding.ts`. Pasos: `hello`, `tone`, `color`                                                                                                                                                                                     |
| Registro `{version, completedAt}` por usuario, lectura defensiva, `try/catch` por modo privado                | Mismo patrón que `MemoryStore` (`src/lib/ask/prefs.ts`): store externo, `storage` inyectable, `persisted` para avisar. Una sola clave `astra.ask.prefs.v1` (no hay usuario en el cliente: es por navegador)                                                |
| `Dialog` de Radix, `Progress`, `Button`, `Provider` + contexto, pasos por rol                                 | **No se portan** (sin dependencias nuevas; Astra no usa Radix ni tiene `components/ui`). `<dialog>` nativo como `AskPanel` y la paleta (trampa de foco, fondo inerte, Esc). Barra de progreso propia. Sin contexto: store externo + `useSyncExternalStore` |
| Pasos por rol, i18n `onboarding.*`                                                                            | Un solo recorrido. Claves `ask.onb.*` en `src/lib/i18n.ts` (ES y EN, mismo test de paridad)                                                                                                                                                                |
| Se abre solo en el primer ingreso                                                                             | Se abre solo en la primera visita a `/ask` (no en el panel flotante ni en otras páginas). Rehacer: botón "Personalizar a Ether" en el rail de `/ask`. Saltar: Esc o "Saltar" = marca como visto con los valores por defecto                                |

### Qué define

| Campo    | Valores                                                   | Dónde vive   | Viaja al server                               |
| -------- | --------------------------------------------------------- | ------------ | --------------------------------------------- |
| `tone`   | `neutral` (def.) · `formal` · `cercano`                   | localStorage | Sí, en `style.tone`                           |
| `length` | `brief` · `balanced` (def.) · `detailed`                  | localStorage | Sí, en `style.length`                         |
| `accent` | `violet` (def., el de marca) · `orchid` · `pink` · `mono` | localStorage | No                                            |
| `name`   | texto libre ≤ 40, opcional                                | localStorage | **No** (es texto libre: se usa solo en la UI) |

- Color: afecta solo la zona de chat (`/ask` y el panel), con `data-chat-accent` y variables en `ask.css` que redefinen `--accent`, `--accent-fill`, `--accent-fill-hover`, `--on-accent` por tema. El tema del sitio no cambia. Cada preset se mide a 4.5:1 en Void y Dawn con un test que lee `ask.css` y `design/tokens.json`.
- Voz (Cartesia): fuera de alcance, queda en el issue.

### Contrato con el server

- `POST /chat` acepta `style?: { tone?: Tone, length?: Length }`. Estricto: objeto plano, solo esas dos claves, cada una un string de su enum; cualquier otra forma, clave extra o valor fuera del enum es `400 bad_request`. Ausente, `null` o `{}` = valores por defecto = comportamiento de hoy.
- Nunca texto libre: el prompt arma las frases fijas del lado del server a partir del enum (`<estilo>` con `tono: ...` / `largo: ...`, pasado por `escapeData`). El `SYSTEM_PROMPT` agrega que `<estilo>` solo ajusta forma, no reglas ni fuentes, y que `brief`/`detailed` mueven el tope de palabras de la regla 6.
- Caché: el estilo cambia la respuesta, entra a `context` de `cacheKey` solo cuando no es el por defecto (así el caso común comparte caché con hoy). A diferencia de las memorias no apaga la caché: son pocos valores, no datos del usuario.
- Log y `usage_events`: solo el enum (`style: "formal/brief"`) en el log de la request.

### Archivos

| Archivo                                                                                   | Cambio                                                                        |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/lib/ask/prefs.ts` + `prefs.test.ts`                                                  | enums, `parseStored`, `PrefsStore`, `toStyle()` (omite lo que es por defecto) |
| `src/lib/ask/onboarding.ts` + `onboarding.test.ts`                                        | pasos, avance, progreso                                                       |
| `src/components/ask/OnboardingDialog.tsx`, `useAskPrefs.ts`                               | UI y hook                                                                     |
| `src/lib/ask/{client,store}.ts`                                                           | `style` en el body                                                            |
| `src/pages/Ask.tsx`, `src/components/ask/AskPanel.tsx`                                    | `data-chat-accent`, apertura automática, botón rehacer                        |
| `src/styles/ask.css`, `src/lib/ask/accent.test.ts`                                        | presets y contraste                                                           |
| `src/lib/i18n.ts`                                                                         | claves `ask.onb.*`                                                            |
| `server/src/chat/style.ts` (nuevo), `prompt.ts`, `service.ts`, `app.ts`, `server/tests/*` | validación, bloque `<estilo>`, clave de caché, log                            |
| `docs/server/README.md`, `docs/ask/README.md`, `DESIGN.md`                                | contrato y diseño                                                             |
| `package.json`                                                                            | 0.18.1 → 0.19.1                                                               |

### Verificación prevista

`bun run check` (typecheck, lint, format, tests cliente y server). Navegador (puppeteer-core + Edge, `bun dev --fake` como owner y público): primera visita, saltar, terminar, rehacer, `localStorage` bloqueado, 1280 y 375 px, oscuro y claro, teclado y foco (trampa y Esc).

### Estado de verificación (onboarding)

Hecho en Edge headless (puppeteer-core, `E:\Proyectos\_scratch\browser\onb-verify.mjs`), Vite 5290 contra un server propio (4390, LLM fake, viewer `owner`; segunda pasada con viewer `public`): 45 chequeos en verde y consola sin errores.

- Primera visita: se abre solo; foco al campo del nombre; Tab y Shift+Tab no salen del diálogo (como mucho pasan a la interfaz del navegador, que es el comportamiento del `<dialog>` modal); Enter avanza; cada paso mueve el foco al título; radios con flechas; Atrás deshabilitado en el paso 1.
- Terminar guarda tono, largo, color y nombre; recargar no reabre; el color se ve en la página y en el panel flotante, no en el resto del sitio; el rail resume lo elegido.
- `POST /chat` real: lleva `style: {tone, length}` (solo lo que difiere del defecto) y nunca el nombre ni el color; sin elecciones no lleva `style`; el server responde 400 a `{"tone":"pirata"}`.
- Saltar, Esc y clic en el fondo cierran, marcan visto y no guardan lo editado; rehacer parte de lo guardado y devuelve el foco al botón del rail.
- `localStorage` bloqueado (getter que lanza): el diálogo funciona, avisa que no se guarda y la elección viaja igual durante la sesión.
- 1280 y 375 px, oscuro y claro: el diálogo entra en pantalla, objetivos táctiles ≥ 44 px a 375 px, sin scroll horizontal. Capturas en `E:\Proyectos\_scratch\chat-onboarding\`.
- Bug encontrado y corregido en la verificación: la muestra "Violeta" heredaba el color del preset activo; `violet` ahora repite los valores base en `ask.css`.
- No verificado con lector de pantalla real (solo roles, nombres y foco por DOM).
