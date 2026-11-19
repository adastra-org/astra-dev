# Sandbox de Lua (M4, v0.9.0)

Los bloques `lua` marcados con `run` en el Markdown se ejecutan en el navegador, en un Web Worker con una VM Lua 5.4 (wasmoon). No hay server, no hay red y no hay filesystem: el código del lector es código no confiable y todo lo que sigue existe para que siga sin poder tocar la página.

## Marcar un bloque

````md
```lua run
print("hola", 1 + 1)
```
````

- Solo `lua` (y sus alias habituales no: el lenguaje se escribe `lua`). En otros lenguajes el flag se ignora.
- El bloque muestra **Ejecutar**, **Revisar** y **Formatear** en la cabecera, junto a Copiar; la salida se abre debajo del `pre`.
- Un bloque sin `run` se comporta como siempre.

El sandbox **no es FiveM**: no hay natives, ni `CreateThread`, ni `SetEntityCoords`. Sirve para Lua puro (tablas, strings, math, corrutinas). Un ejemplo que llame a una native falla con "attempt to call a nil value" y eso es lo esperado.

## Playground en `/tools`

`/tools` usa el mismo `CodeBlock` con `runnable` y `editable`: un textarea con un ejemplo de partida, más Ejecutar, Revisar y Formatear. No guarda nada ni lo comparte; el código vive en el estado de la página.

## Runtime

| Decisión    | Qué se eligió                                                | Por qué                                                                                   |
| ----------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Dónde       | Web Worker, uno por ejecución                                | Aísla del DOM; `terminate()` corta hasta una llamada C que el hook no ve                  |
| Motor       | wasmoon (Lua 5.4 compilado a WASM)                           | Sin infraestructura, sin costo por ejecución y sin la superficie de un contenedor         |
| Alternativa | Podman rootless con límites                                  | Más fiel a FiveM, pero es una superficie de ataque y un servicio que mantener; descartado |
| Carga       | `import()` bajo demanda al pulsar Ejecutar/Revisar/Formatear | El runtime no pesa en la primera visita                                                   |

El wasm de wasmoon se descarga una vez y se reutiliza; antes de mandarlo al worker se le reescribe el máximo de memoria (`wasm-patch.ts`). El parche no cambia el tamaño del módulo ni ningún offset: solo los 3 bytes del máximo de la sección de memoria.

## Defensas

Tres capas; ninguna es la única.

| Capa    | Qué hace                                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VM      | Se abren solo base, coroutine, table, string, utf8, math y debug. `io`, `os`, `package`, `require`, `load`, `loadstring`, `dofile`, `getfenv` y `setfenv` no existen. `debug` queda en `nil` después del bootstrap |
| Entorno | El snippet corre con una lista blanca (`_G` es ese entorno, no el real). `string.dump` se anula también en el metatable de los strings; `collectgarbage` solo informa; `string.rep` tiene tope propio              |
| Worker  | Antes de ejecutar se anulan `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `indexedDB`, `caches`, `BroadcastChannel`, `Worker`, `SharedWorker` y `RTCPeerConnection`                      |
| Cliente | El worker se mata a los `timeoutMs + killGraceMs` si no terminó, y al desmontar la página. La página valida todo mensaje del worker (`parseWorkerMessage`) antes de usarlo                                         |
| Memoria | El máximo de la memoria del wasm se parchea a 128 MiB; pasado eso, `memory.grow` falla y Lua aborta                                                                                                                |

El código se carga solo como texto (`mode = "t"`): bytecode está vetado. Las instrucciones y el tiempo se cuentan con un hook de JS que se reinstala en cada corrutina; una vez que un límite se dispara, el hook lanza **antes de cada instrucción**, así que un `pcall` anidado no puede seguir ejecutando.

Los tests de `runner.test.ts` atacan cada una de esas defensas (globales ausentes, `_G`, metatable de strings, bytecode, `debug`, bucles en `pcall` y corrutinas, memoria, salida, código gigante).

## Límites

Todos en `src/lib/sandbox/limits.ts` (un solo lugar para el worker, el cliente y esta tabla).

| Límite              | Valor       | Qué pasa al pasarlo                                       |
| ------------------- | ----------- | --------------------------------------------------------- |
| Tiempo              | 3 s         | "Se cortó por tiempo" (el cliente mata a los 4 s)         |
| Instrucciones       | 50 millones | "Se cortó por cantidad de instrucciones"                  |
| Memoria             | 128 MiB     | "Se cortó por memoria"                                    |
| Salida              | 64 KiB      | "Se cortó la salida"; el cliente corta antes de inundarse |
| Código              | 32 KiB      | Se rechaza sin arrancar el worker                         |
| Línea de salida     | 4.000 chars | Se recorta al mostrarse                                   |
| `string.rep`        | 8 MiB       | `sandbox:memory`                                          |
| Arranque del worker | 10 s        | "El runtime no arrancó a tiempo"                          |

La salida es stdout: `print` une sus argumentos con tabulaciones, como en Lua.

## Revisar y formatear

Ambas corren en otro worker (`tools.worker.ts`), también bajo demanda y con corte a los 8 s. Ninguna ejecuta el snippet.

| Acción    | Motor             | Qué informa                                                                                                                                                                                   |
| --------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revisar   | luaparse + reglas | Error de sintaxis con línea y columna, local sin usar (ignora los que empiezan con `_`) y globales que el sandbox no tiene (`os`, `io`, `require`, `load`…)                                   |
| Formatear | StyLua (WASM)     | Reindenta con sintaxis `CfxLua` (hashes con backtick, `+=`, `<<`), 2 espacios, 80 columnas y comillas dobles. Vuelve a parsear la salida (`Full`): si el formateo cambiara el programa, falla |

`luaparse` entiende hasta Lua 5.3; las marcas `<const>` y `<close>` de 5.4 se tapan antes de analizar. No se avisa de globales no definidos: en FiveM casi todo son natives que el sandbox no conoce.

## Interfaz

- Cabecera: lenguaje a la izquierda; Ejecutar/Detener, Revisar, Formatear y Copiar a la derecha. Los botones son de 44 px en táctil y 32 px desde `lg`. A 375 px la fila envuelve; el bloque nunca empuja la página.
- Salida: panel dentro del mismo bloque, debajo del `pre`. Línea de estado (Listo · 12 ms, error con línea, límite alcanzado, detenido, crash) y stdout debajo. `role="status"` anuncia el final, no cada línea.
- Revisión: los diagnósticos aparecen en un panel con severidad, línea:columna y mensaje.
- Formatear reemplaza el texto del bloque por el formateado (pierde el resaltado hasta recargar; el archivo del repo no cambia).
- Al navegar a otra página se cancela la ejecución y se mata el worker.

Reglas visuales en [`DESIGN.md`](../../DESIGN.md#code-blocks).

## Archivos

| Archivo                            | Qué hace                                                            |
| ---------------------------------- | ------------------------------------------------------------------- |
| `src/lib/sandbox/limits.ts`        | Únicos valores de tiempo, memoria, salida y código                  |
| `src/lib/sandbox/bootstrap.ts`     | Lua de confianza: entorno con lista blanca, `print`, `xpcall`       |
| `src/lib/sandbox/runner.ts`        | Crea la VM, abre librerías, instala el hook y devuelve el resultado |
| `src/lib/sandbox/wasm-patch.ts`    | Reescribe el máximo de memoria del wasm                             |
| `src/lib/sandbox/lua.worker.ts`    | Worker de ejecución; corta la red antes de correr el snippet        |
| `src/lib/sandbox/run.ts`           | Cliente: descarga el wasm, lanza y vigila el worker                 |
| `src/lib/sandbox/protocol.ts`      | Mensajes worker ↔ página, con validación de forma y tamaño          |
| `src/lib/sandbox/lint.ts`          | Reglas sobre luaparse                                               |
| `src/lib/sandbox/format.ts`        | StyLua y lectura de su error de parseo                              |
| `src/lib/sandbox/tools.ts`         | Cliente de Revisar/Formatear con timeout y saneado de respuestas    |
| `src/components/doc/CodeBlock.tsx` | Botones, salida y diagnósticos                                      |
| `scripts/docs/markdown.ts`         | Lee el flag `run` del fence y lo marca en el bloque                 |

## Revisión de seguridad (2026-11-12)

Lectura línea a línea de `bootstrap.ts`, `lua.worker.ts`, `runner.ts`, `run.ts`, `protocol.ts`, `wasm-patch.ts` y `limits.ts`, más el render de la salida en `CodeBlock.tsx`. La hizo quien también escribió el sandbox con ayuda de un asistente: **no es una revisión independiente**; una persona del equipo debe repetirla antes del merge.

Sin hallazgos que permitan salir de la VM o tocar la página:

- Entorno: lista blanca; `load`, `require`, `io`, `os`, `package` no existen; `debug` queda con `traceback`; `string.dump` anulado también por el metatable; `getmetatable("")` no da acceso a los globales reales.
- El bootstrap guarda sus referencias en locales (upvalues) y borra los globals de entrada; sin `debug.getupvalue` el snippet no las alcanza.
- Los límites se aplican con un hook que se hereda en las corrutinas (Lua 5.4 copia el hook al crear un hilo) y, al dispararse, lanza antes de cada instrucción: un `pcall` anidado no lo traga.
- La salida se pinta como texto (React escapa); no hay `dangerouslySetInnerHTML` sobre datos del worker, y la página valida cada mensaje del worker antes de usarlo.

Riesgos residuales, todos acotados al worker del propio lector:

1. **Finalizadores (`__gc`) y llamadas C largas** (patrones de `string.find` patológicos): Lua desactiva los hooks mientras corre un finalizador y el hook no ve una llamada C. Cubre `terminate()` del cliente a los `timeoutMs + killGraceMs` (4 s). El worker se descarta; la página no se afecta.
2. **El sitio no manda `Content-Security-Policy`** (`deploy/nginx/*.conf` solo pone HSTS y cache). No es necesario para que el sandbox funcione, pero sería una capa más: `worker-src 'self'`, `connect-src 'self'` y `script-src` con `'wasm-unsafe-eval'` para el worker. Cambio de nginx aparte; hay que probarlo con las fuentes y el resaltado antes de activarlo.
3. **No probado en Safari ni Firefox** (el parche de memoria del wasm y el `terminate` pueden comportarse distinto).
4. **Pasada en navegador real** (375 y 1440 px) sin hacer en este entorno.

Los mensajes de la herramienta de formato (StyLua) y los de sintaxis de luaparse llegan en el idioma de la herramienta; el resto de la interfaz del bloque (botones, salida, avisos del lint, causas de caída) está en el diccionario ES/EN.

## Verificación

- Tests: `runner.test.ts` (ejecución, escapes y límites), `lint.test.ts`, `format` (dentro de lint), y el parser del flag en `scripts/docs/docs.test.ts`. `bun run check` en verde.
- Revisión de seguridad de código hecha (arriba), no independiente. **Pendiente**: que una persona la repita antes del merge y una pasada en navegador real a 375 px y 1440 px, con un bloque `lua run` en un doc.
- El worker no se probó en Safari ni Firefox; el parche de memoria depende de que el wasm declare un máximo de 3 bytes (si cambia, falla ruidoso en vez de correr sin tope).
