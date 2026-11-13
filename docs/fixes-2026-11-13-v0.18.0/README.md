# Correcciones 2026-11-13 (v0.18.0): chat `/ask`, segunda tanda

`[ ]` pendiente · `[~]` parcial, con nota · `[x]` hecho y verificado (navegador o tests). Reportado por Faku sobre `/ask`. Tanda anterior: [../fixes-2026-11-13-v0.17.0/README.md](../fixes-2026-11-13-v0.17.0/README.md). Plan: [../chat/README.md](../chat/README.md).

## UI

- [x] Los pasos que muestra el chat (búsqueda, historial, gate, etc.) se pueden compactar, y el razonamiento (thinking) va en el mismo grupo, no aparte. Código: `src/components/ask/Activity.tsx`. Hecho en v0.18.1: un solo grupo plegable por respuesta (`aria-expanded`), abierto mientras se genera y compacto al terminar con resumen `N pasos · razonamiento · 1,2 s`; el razonamiento es una entrada más. Public/subscriber: solo pasos. Verificado en Edge (1280 y 375 px, claro y oscuro, owner y public, teclado Enter/Espacio).

## UX (largo plazo, ROADMAP)

- [ ] Ejecutar en el Sandbox el código que da la IA: [#40](https://github.com/adastra-org/astra-dev/issues/40)
- [ ] Memorias guardadas por el modelo mediante herramientas, además de las manuales: [#41](https://github.com/adastra-org/astra-dev/issues/41)
- [~] Onboarding con Ether (colores, tono, voz con Cartesia): [#42](https://github.com/adastra-org/astra-dev/issues/42). Colores, tono, largo y nombre hechos en v0.19.1 (verificado en navegador, 45 chequeos en Edge, 1280 y 375 px, oscuro y claro, localStorage bloqueado). Falta la voz con Cartesia (requiere renovar la suscripción) y el dato de si migrar las preferencias a la cuenta.
