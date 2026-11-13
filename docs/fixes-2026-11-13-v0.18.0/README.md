# Correcciones 2026-11-13 (v0.18.0): chat `/ask`, segunda tanda

`[ ]` pendiente · `[~]` parcial, con nota · `[x]` hecho y verificado (navegador o tests). Reportado por Faku sobre `/ask`. Tanda anterior: [../fixes-2026-11-13-v0.17.0/README.md](../fixes-2026-11-13-v0.17.0/README.md). Plan: [../chat/README.md](../chat/README.md).

## UI

- [x] Los pasos que muestra el chat (búsqueda, historial, gate, etc.) se pueden compactar, y el razonamiento (thinking) va en el mismo grupo, no aparte. Código: `src/components/ask/Activity.tsx`. Hecho en v0.18.1: un solo grupo plegable por respuesta (`aria-expanded`), abierto mientras se genera y compacto al terminar con resumen `N pasos · razonamiento · 1,2 s`; el razonamiento es una entrada más. Public/subscriber: solo pasos. Verificado en Edge (1280 y 375 px, claro y oscuro, owner y public, teclado Enter/Espacio).

## Calidad de respuestas

Reportado por Faku con una conversación real de `/ask` en dev local. Rama `fix/chat-quality`, v0.19.2. Causas y medición: [../server/README.md](../server/README.md#calidad-de-respuestas-v0192).

- [x] "¿Cómo dibujo texto en pantalla?" y "...del server?" se rechazaban. Causa: el `server/data/index.json` de dev no correspondía al embedder que corre (coseno de un fragmento contra su propio vector: −0,02), así que la búsqueda semántica no recuperaba nada y caía a palabras clave, que además no tenían vocabulario de dibujo/texto. Con un índice coherente ambas responden (probado con el pipeline real). Se amplió el glosario ES→EN (dibujar, mostrar, escribir, rectángulo, línea, subtítulo...). Pendiente de Faku: `cd server && bun run index` en su máquina para regenerar el índice de `server/data`.
- [x] "¿Me mostrás un uso de ejemplo?" derivaba a natives de audio. Causa: la consulta del follow-up no nombraba el tema y el gate dejó pasar los 8 fragmentos. Ahora el tema (las fuentes de la respuesta anterior) va en la consulta, en el gate y en el prompt (`<tema>`, regla 10); las fuentes arrastradas van primero. Test de regresión con este caso: `server/tests/chat-quality.test.ts`.
- [x] Un native nombrado en la pregunta ("¿Para qué es `GetActualScreenResolution`?") se trataba como follow-up y el gate lo descartaba. Ahora se sostiene solo y el gate no lo puede quitar.
- [x] "Velocidad: 2852,5 tokens por segundo". Causa: los tokens de salida incluyen el razonamiento pero el reloj del cliente arrancaba en el primer texto. El server manda `done.tps` (`timings` de llama.cpp); el cliente descarta mediciones no confiables y muestra "— tokens por segundo". Tests en `src/lib/ask/budget.test.ts` y `server/tests/speed.test.ts`.

## UX (largo plazo, ROADMAP)

- [ ] Ejecutar en el Sandbox el código que da la IA: [#40](https://github.com/adastra-org/astra-dev/issues/40)
- [ ] Memorias guardadas por el modelo mediante herramientas, además de las manuales: [#41](https://github.com/adastra-org/astra-dev/issues/41)
- [ ] Onboarding con Ether (colores, tono, voz con Cartesia): [#42](https://github.com/adastra-org/astra-dev/issues/42)
