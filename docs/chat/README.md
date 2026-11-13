# Zona de chat (workspace de Ask Ether)

Plan vivo de la zona de chat. Fase 0 detallada abajo; fases 0b a 5 en esqueleto. Base: `feat/context-gate` (9670ca7, v0.12.0). Rama: `feat/chat-workspace`.

## Estado

| Fase | Qué                                                                      | Estado                                                              |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 0    | Rol `owner` + registro de uso (telemetría)                               | **Implementada en v0.13.0**; tests y verificación local abajo       |
| 0b   | Dashboard de IA (solo owner)                                             | Esqueleto                                                           |
| 1    | `/chat` workspace + context budget + output speed + editar/rewind/resend | Esqueleto                                                           |
| 2    | Herramientas `ejecutar` + `check` (sandbox en navegador)                 | Esqueleto. **No se mergea antes de la revisión de seguridad de M4** |
| 3    | Memorias (localStorage)                                                  | Esqueleto                                                           |
| 4    | Cross-session                                                            | Esqueleto                                                           |
| 5    | Subagents                                                                | Esqueleto                                                           |

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

- **0b Dashboard de IA** (`/ia`, owner): endpoint que agrega `usage_events` (día/semana/mes, por proveedor y modelo, top viewers, rate limits, errores/fallbacks, cache hit, TTFT y tokens/s promedio, GPU time total y por modelo, costo estimado). Sigue `~/.claude/standards/DESIGN.md` y el `DESIGN.md` del proyecto. Sin librerías de chart nuevas si el DS trae `charts.css`.
- **1 `/chat`**: workspace (transcript, composer, rail). Context budget con `contextWindow` por proveedor (nuevo `LLM_CONTEXT_WINDOW`) y `usage` de `done`. Output speed medido en cliente. Editar mensaje = rewind + resend en cliente.
- **2 Herramientas**: protocolo `<herramienta nombre="ejecutar">` (corte de stream en el server, ejecución en el navegador con wasmoon, resultado como rol `tool` escapado, máx. 3 rondas). `check` determinista en cliente sobre bloques `lua` pegados. Bloqueada por revisión de seguridad de M4.
- **3 Memorias**: localStorage, inyectadas como dato en bloque propio con tope, no cacheadas.
- **4 Cross-session**: sesiones locales, el usuario elige cuáles adjuntar, resumen para el presupuesto.
- **5 Subagents**: llamadas LLM aparte, sin herramientas, con tope de cantidad y tokens; cuentan contra cupo salvo owner.

## Decisiones tomadas

1. Owner = id en `OWNER_IDS` Y staff en cuentas (default recomendado; Faku no entendió la pregunta, se explicó). Cambiable a solo allowlist.
2. Owner sin tope diario (ni por viewer ni global). Tope de rondas por mensaje con confirmación (0.2b).
