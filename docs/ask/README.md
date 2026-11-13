# Panel de Ask Ether (M3, v0.8.0)

Chat de solo lectura sobre la documentación, en el cliente. Consume `POST /chat` (SSE) del [server](../server/README.md) y se abre desde el botón **Preguntar a Ether** de la barra superior o desde la paleta Ctrl+K. Reglas visuales en [`DESIGN.md`](../../DESIGN.md#ask-ether-panel).

## Uso

| Acción             | Cómo                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Abrir              | Botón de la barra (icono bajo `md`, con texto desde `md`) o Ctrl+K y elegir "Preguntar a Ether"          |
| Preguntar          | Escribir y `Intro` (o el botón). `Mayús + Intro` es salto de línea. Un ejemplo del estado vacío envía    |
| Detener            | El botón se vuelve "Detener" mientras responde; conserva lo recibido                                     |
| Seguir una cita    | Clic en la ficha `[n]` del texto o en una fila de "Fuentes": va a la página y al encabezado              |
| Nueva conversación | Botón de la cabecera del panel                                                                           |
| Cerrar             | `Esc`, el fondo o la X. La conversación y el texto sin enviar se conservan; una respuesta en curso sigue |

Quién puede usarlo lo decide el server (`subscriber` o `staff`). Para quien no, el panel dice por qué en vez de fallar mudo (ver "Estados").

## Flujo

```
askStore.ask(pregunta)
  └─ streamChat ── POST /api/chat {question, history, memories?, style?} ─► eventos SSE
       meta → sources → delta* → done | error
  └─ applyEvent (puro) acumula en el Turn: texto, fuentes, citadas, rechazo, caché
  └─ AskPanel ── useSyncExternalStore ── pinta cada Turn (AnswerBody + Fuentes + avisos)
```

- El historial que se manda son los últimos 3 intercambios terminados bien (sin errores ni rechazos), recortados a 800 caracteres; el server vuelve a sanearlos.
- Una pregunta a la vez. Mientras responde, Intro y los ejemplos no envían.
- `/api` es nginx en producción y un proxy de Vite en desarrollo (`vite.config.ts`): mismo origen, misma cookie de sesión, sin CORS.

## Estados

| Estado                                     | Qué se ve                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Vacío                                      | Qué hace Ether, tres preguntas de ejemplo, qué se envía al modelo (DeepSeek) y qué guarda el server                   |
| Sin acceso (rol `public` conocido)         | Aviso con candado: es para suscriptores y staff; Ctrl+K sigue disponible. Un 401/403 al preguntar lo confirma         |
| Buscando                                   | "Buscando en la documentación…" con el icono pulsando (solo sin `prefers-reduced-motion`)                             |
| Respondiendo                               | El texto crece; el scroll sigue el final salvo que subas a leer                                                       |
| Terminada                                  | Texto + "Fuentes" (solo las citadas) + avisos                                                                         |
| Fuera de la documentación (`refused`)      | La frase de rechazo del server, una pista y un enlace a Documentación; sin fuentes                                    |
| `rate_limited`                             | "Hiciste demasiadas preguntas seguidas. Puedes volver a intentar en N s." y Reintentar (usa `Retry-After`)            |
| `budget_exceeded`                          | "Se alcanzó el límite diario… se restablece a las 00:00 UTC, en N h." Sin Reintentar                                  |
| `llm_unavailable`, red, corte, 5xx         | Qué pasó y Reintentar (reemplaza el turno fallido). Si el modelo falla a medias, el texto parcial se conserva         |
| `unauthenticated`, `subscription_required` | Mensaje de acceso, sin Reintentar                                                                                     |
| Avisos al pie de una respuesta             | Búsqueda por palabras clave (índice semántico no disponible), cortada por longitud, detenida, reutilizada de la caché |

Los mensajes están en `src/lib/ask/errors.ts` (texto del usuario; el del server es para logs).

## Seguridad del renderizado

La respuesta del modelo es texto no confiable (el server ya lo acota, esto es la segunda capa). `src/lib/ask/markdown.ts` convierte el Markdown en un árbol y React lo pinta como nodos:

- **Sin HTML crudo**: `<script>`, `<img onerror>` y demás salen como texto literal escapado. No se usa `dangerouslySetInnerHTML`.
- **Sin imágenes ni enlaces del modelo**: de `[texto](url)` solo queda el texto; de `![alt](url)` el alt. Nada se carga ni se abre.
- Las únicas ligas son las citas `[n]`, y apuntan a `source.path`, que arma el server a partir de lo recuperado. Un `[n]` fuera de las fuentes recibidas queda como texto.
- Se renderizan párrafos, énfasis, código en línea, bloques de código (con Copiar), listas, citas, tablas (con scroll horizontal propio) y títulos como negrita.

Probado en `src/lib/ask/ask.test.ts`.

## Memorias (v0.16.0)

En `/ask`, el rail tiene una sección **Memorias**: frases cortas ("responde corto", "uso Windows") que se mandan con cada pregunta como `memories` y el modelo usa para adaptar el tono y el nivel. Viven **solo en este navegador** (`localStorage`, clave `astra.ask.memories.v1`); el server no las guarda, no las cachea y no escribe su texto en ningún log. Plan, topes y privacidad: [chat/README.md](../chat/README.md#fase-3-memorias-del-usuario-v0160-rama-featchat-memories).

- Lógica en `src/lib/ask/memories.ts` (puro + `MemoryStore`, storage inyectable); UI en `src/components/ask/MemoriesPanel.tsx`.
- Topes: 12 memorias, 280 caracteres cada una, 2000 entre las activas. Solo viajan las activas.
- Si `localStorage` no está disponible (modo privado, bloqueado, cuota), las memorias siguen funcionando en memoria durante la sesión y el panel avisa que no se guardan.
- El medidor de contexto suma los tokens estimados de las memorias activas.
- Tests: `memories.test.ts`, `memories-panel.test.tsx`, y los casos de `memories` en `ask.test.ts` y `budget.test.ts`.

Las citas a **natives** (`kind: "native"`) enlazan a `/natives/<slug>` (páginas publicadas en M2, v0.7.0; el slug es el del importador, el mismo del índice del server). `NATIVE_PAGES_PUBLISHED` en `src/lib/ask/sources.ts` es el interruptor si hubiera que volver a texto plano.

Textos del panel en el diccionario (`ask.*` en `src/lib/i18n.ts`, ES y EN, ver [i18n/README.md](../i18n/README.md)); los mensajes de error pasan por `describeError(code, retryAfter, tr)`. El idioma de la respuesta lo decide el server: el de la pregunta.

## Accesibilidad

- `<dialog>` modal nativo: foco atrapado, fondo inerte, `Esc` cierra, el foco vuelve a quien abrió. Tras seguir una cita el foco va a `#main`.
- Al abrir el foco queda en el campo. Campo con `aria-label`, botones con nombre, todos de 44 px.
- La conversación es una lista con nombre; un `role="status"` anuncia "Buscando…", "Ether está respondiendo", "Respuesta lista, N fuentes citadas" (no cada fragmento del stream). El error es un `role="alert"`.
- Las citas del texto tienen `aria-label="Fuente n: título"` (24 px como mínimo; la lista de fuentes da el objetivo de 44 px).
- Nunca solo color: los errores llevan icono y texto. Foco visible con el anillo del DS.
- `prefers-reduced-motion`: sin animación de entrada ni pulso.
- A 375 px el panel ocupa el ancho menos 16 px por lado; sin scroll horizontal de página (tablas y código scrollean dentro).

## Paleta Ctrl+K

Proveedor `ask-ether` (`permission: subscriber`): ver [cmdk/README.md](../cmdk/README.md#preguntar-a-ether-v080).

## Decisión: componentes propios

Se consultó el kit con `list_packages`: no hay un componente "Ask Ether" (paquetes: accounts, config, embed, gitview, orb, tokens, ui). `@wefaber/ui` ya se descartó para el palette ([cmdk/README.md](../cmdk/README.md#decisión-componentes-propios-no-wefaberui)) por las mismas razones (tokens de otro tema, bordes propios). El panel se construyó sobre `<dialog>` y los roles del DS de Ad Astra. Si WeKit publica el componente, el contrato de datos (`lib/ask`) no cambia: solo se reemplaza `components/ask`.

## Archivos

| Archivo                             | Qué hace                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/ask/types.ts`              | Contrato SSE, `AskError`                                                    |
| `src/lib/ask/sse.ts`                | Parser incremental de SSE                                                   |
| `src/lib/ask/client.ts`             | `streamChat`: `POST /api/chat`, errores previos al stream, cortes           |
| `src/lib/ask/store.ts`              | Estado de la conversación fuera de React (`askStore`), historial, reintento |
| `src/lib/ask/errors.ts`             | Mensajes por código de error                                                |
| `src/lib/ask/markdown.ts`           | Markdown del modelo a árbol seguro                                          |
| `src/lib/ask/sources.ts`            | Qué fuentes se listan y cuáles enlazan                                      |
| `src/lib/ask/palette.ts`            | Proveedor de la paleta                                                      |
| `src/components/ask/AskPanel.tsx`   | Diálogo, conversación, campo, estados (se carga al abrir por primera vez)   |
| `src/components/ask/AnswerBody.tsx` | Árbol seguro a elementos de React, citas                                    |
| `src/components/ask/AskTrigger.tsx` | Botón de la barra superior                                                  |
| `src/styles/ask.css`                | Entrada del panel                                                           |

## Estado de verificación

| Qué                                                                                                | Estado                                                                                                                |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Pregunta de punta a punta (UI, proxy, server, DeepSeek real, índice por palabras clave)            | Verificado en el navegador, escritorio y 375 px                                                                       |
| Citas como enlaces (ruta y ancla), rechazo, `rate_limited` con Reintentar, `subscription_required` | Verificado en el navegador (los errores con `fetch` simulado en la página)                                            |
| Caché: pregunta repetida sin modelo                                                                | Verificado en el navegador y en los logs del server                                                                   |
| Entrada desde la paleta Ctrl+K                                                                     | Verificado en el navegador                                                                                            |
| Parser SSE, cliente, store, Markdown seguro, errores, proveedor de la paleta                       | 31 tests (`bun test`)                                                                                                 |
| `budget_exceeded` y 401 en pantalla; lector de pantalla real                                       | Cubierto por tests de mensajes/estado; **no** probado en pantalla ni con un lector real                               |
| react-doctor                                                                                       | **No ejecutado**: `bunx react-doctor@latest` lo bloqueó el modo automático (descarga código externo). Correrlo a mano |
| Índice semántico con el embedder real y cuentas reales (viewer, suscriptores, staff)               | **No verificado**: solo existen en el VPS                                                                             |

## Página `/ask` (v0.15.0)

Misma conversación que el panel (`askStore`): transcript, composer y las acciones de cada pregunta (Editar, Reenviar) son los mismos componentes (`components/ask/Conversation.tsx`). El rail de la página muestra:

- **Contexto**: tokens del próximo envío (último uso informado por el server más el borrador estimado con `chars/3`) sobre `LLM_CONTEXT_WINDOW`. Avisa desde 80 % y al 100 %, con texto e icono.
- **Velocidad**: primer texto (ms) y tokens por segundo, medidos en el navegador de primer a último texto. Respuestas de caché no se miden.
- **Sesión**: preguntas y tokens enviados y recibidos.

Editar una pregunta corta la conversación en ese punto y la reenvía; Reenviar repite la pregunta. Sin endpoint nuevo: el historial que se manda es lo que queda antes del turno.

Lógica pura en `lib/ask/budget.ts` y `lib/ask/status.ts`; pruebas en `budget.test.ts`, `workspace.test.ts` y `components/ask/ask-page.test.tsx`.

## Onboarding con Ether (v0.19.1)

La primera vez que se abre `/ask` aparece un diálogo de tres pasos (hola y nombre; tono y largo; color). Se puede saltar (botón, Esc o clic fuera: queda como visto con los valores por defecto) y rehacer desde **Personalizar a Ether** en el rail. Todo vive **solo en este navegador** (`localStorage`, clave `astra.ask.prefs.v1`); si no se puede guardar, funciona en memoria y el diálogo avisa.

- Al server viajan únicamente `tone` y `length`, como enums en `style` (ver [docs/server](../server/README.md)). El nombre (texto libre, hasta 40 caracteres) y el color no se envían.
- El color (`violet` de marca, `orchid`, `pink`, `mono`) se aplica con `data-chat-accent` en la página `/ask` y en el panel; el resto del sitio no cambia. Los presets están en `src/styles/ask.css` y su contraste (4.5:1 en Void y Dawn) lo mide `accent.test.ts`.
- Lógica en `src/lib/ask/prefs.ts` (enums, lectura defensiva, `PrefsStore`) y `onboarding.ts` (pasos y avance, portado de `eternum/lux`); UI en `OnboardingDialog.tsx` y `PersonalizePanel.tsx`.
- Voz con Cartesia: fuera de alcance (issue #42).
