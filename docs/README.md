# Astra Dev

Documentación, herramientas y sistemas para el desarrollo del servidor Ad Astra. Vive en `development.adastrarp.com`.

Fuente de la idea: nota `astra_dev.md` (2026-11-09).

## Índice

- [plan/README.md](plan/README.md) — milestones M0–M5, estimaciones, decisiones abiertas.
- [docs-engine/README.md](docs-engine/README.md) — motor de docs (M1): frontmatter, build, vista TDA, cómo agregar un doc. Contenido en [`content/`](../content/README.md).
- [fixes-2026-11-10-v0.2.0/README.md](fixes-2026-11-10-v0.2.0/README.md) — correcciones de diseño al motor de docs (bordes, texto, animación, TOC), con su estado.
- [materiales/README.md](materiales/README.md) — materiales del juego (`materials.dat`): tabla de los 213 tipos, categorías, y las tres copias del archivo con sus índices distintos.
- [vehiculos/README.md](vehiculos/README.md) — auditoría y corrección de vehículos: flags contra la lista oficial, cristal blindado (flag vs material), materiales de colisión, shaders, tintado y LODs.
- [fixes-2026-11-12-v0.4.0/README.md](fixes-2026-11-12-v0.4.0/README.md) — problemas de vehículos reportados (blindaje, tintado, LODs, flags), con su estado.
- [cmdk/README.md](cmdk/README.md) — command palette Ctrl+K (v0.3.0): contenido, ranking, regla del atajo, accesibilidad y cómo agregar un proveedor (IA después).
- [shell/README.md](shell/README.md) — shell de la app (sidebar, barra superior, rutas, tokens). Reglas visuales en [`DESIGN.md`](../DESIGN.md).
- [server/README.md](server/README.md) — server de Ask Ether (M3): chat de solo lectura con citas, índice semántico, permisos, límites, modelo de seguridad y diseño de deploy.
- [import/README.md](import/README.md) — importador de natives (GTA + CFX) y fivem-docs: fuentes fijadas por sha, salida normalizada, overrides, licencia y fases (índice con embeddings offline, WeGraph en Code Mode).
- [project/README.md](project/README.md) — página Roadmap (M5, v0.10.0): checklist desde el plan y GitHub, evolución y burndown, complejidad medida desde git, MyChecklist, permisos y variables de entorno.
- [deploy/README.md](deploy/README.md) — pasos manuales en el VPS (DNS, cert, nginx, env) y operación del deploy blue/green. Arquitectura: [../ARCHITECTURE.md](../ARCHITECTURE.md).

## Qué resuelve

La documentación oficial de FiveM y sus natives:

- No permite búsqueda en lenguaje natural ("la nativa para dibujar una UI").
- Está solo en inglés.
- Está sobrecargada de información; cuesta leerla sin entender todo el código, o con TDA.
- No se puede adaptar al uso del equipo de Ad Astra.

## Herramientas actuales

| Herramienta                                               | Qué es                                      |
| --------------------------------------------------------- | ------------------------------------------- |
| [Astra](https://github.com/adastra-org/astra)             | Código fuente del servidor                  |
| [AstraMapper](https://github.com/adastra-org/astramapper) | Port de CodeWalker a Tauri v2               |
| [CodeWalker](https://github.com/adastra-org/CodeWalker)   | Fork con PRs propias                        |
| [AstraParser](https://github.com/adastra-org/astraparser) | Parseo de vehículos; luego mapeos, texturas |
| [Alchemist](https://docs.fivem.net/docs/alchemist/)       | Conversión GEN8 a GEN9 (Rockstar)           |

## Prioridades

1. MyChecklist + GitHub Projects para organización (como en WePanel).
2. Búsqueda semántica con Ask Ether (componente de WeKit).
3. i18n EN / ES.
4. Docs propias en Markdown: sandbox de código, estilo del DS de Astra, historial de cambios, referencias cruzadas.
5. Visualización de la evolución del proyecto (issues, commits, complejidad, burndown).
