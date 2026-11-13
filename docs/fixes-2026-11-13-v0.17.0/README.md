# Correcciones 2026-11-13 (v0.17.0): chat `/ask`

`[ ]` pendiente · `[~]` parcial, con nota · `[x]` hecho y verificado (navegador o tests). Reportado por Faku sobre `/ask` (PR #31, #32). Plan general en [../chat/README.md](../chat/README.md).

## Respuestas

- [~] **Preguntas que debería poder responder.** "¿Cómo obtengo la clase de un vehículo?" debe responder `GetVehicleClass`. Hipótesis a confirmar: la pregunta en español no recupera el native (el índice está en inglés) o el gate lo descarta. Reproducir primero contra el índice real.
  - v0.17.1: contra un índice consistente con el embedder local el native ya era #1 para esa pregunta y el gate lo conservaba; la causa de fondo era el ranking ES->EN de natives (3 de 12 preguntas parecidas dejaban fuera el native correcto). Fix: match léxico sobre el nombre del native con glosario ES->EN, fusionado por RRF con el semántico. Respuesta verificada en local: nombra `GET_VEHICLE_CLASS` (`GetVehicleClass`) [6]. Ver `docs/server/README.md`.
  - Parcial: verificado solo en local (índice reconstruido con el embedder local). Falta confirmar en prod tras el deploy; no se reprodujo contra el VPS.

## Fixes

- [x] **Follow-up imposible.** El modelo solo responde con lo indexado; si se pregunta algo sobre lo que ya se habló ("explicame eso", "y cómo lo uso?"), contesta que no hay nada en la doc. Debe poder apoyarse en la conversación y en las fuentes de la respuesta anterior, sin dejar de rechazar lo que no está en la doc ni en la charla. Código: `server/src/chat/service.ts` (`prepare`: decider, `query`, rechazo sin fuentes).
  - v0.17.1: causa raíz doble: el gate juzgaba "explicame eso" a secas (descartaba todo y el chat rechazaba) y el prompt solo dejaba responder con `<contexto>`. Fix: `POST /chat` acepta `sources` (slugs de la respuesta anterior, validado estricto), se rankean aparte y el gate no los descarta; el gate recibe la consulta con el tema; sin fuentes se apoya en `<historial>` si la respuesta previa fue real; el rechazo se mantiene fuera de tema. El cliente manda `sources` (mínimo). Ver `docs/server/README.md`.

## UI

- [ ] El razonamiento del modelo se muestra en un cuadro negro; rediseñarlo (más estético, colapsable, coherente con `DESIGN.md`).
- [ ] En `/ask` desaparece "Hablar con Ether" arriba a la derecha (la página ya es el chat).
- [ ] Los botones `reenviar` y `editar` aparecen al pasar el cursor sobre el mensaje (y con foco de teclado; en táctil, visibles).

## UX (largo plazo, ROADMAP)

- [ ] `@` para mencionar una sesión, native o issue: [#33](https://github.com/adastra-org/astra-dev/issues/33)
- [ ] Compartir charla: [#34](https://github.com/adastra-org/astra-dev/issues/34)
- [ ] Code Mode con agente local: [#35](https://github.com/adastra-org/astra-dev/issues/35)
- [ ] Seleccionar y referenciar texto con sus fuentes, como Eternum Board: [#36](https://github.com/adastra-org/astra-dev/issues/36)
