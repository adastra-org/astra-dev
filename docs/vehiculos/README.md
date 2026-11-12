# Vehículos

Auditoría y corrección de los vehículos del servidor: flags, cristal blindado, tintado, LODs y texturas. Las herramientas viven en AstraMapper; acá está lo que se midió y se decidió.

| Documento                                                                    | Qué cubre                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [flags-y-cristal.md](flags-y-cristal.md)                                     | Flags de `vehicles.meta` contra la lista oficial, flag vs material de cristal, estado de tintado y LODs       |
| [auditoria-de-cristal.md](auditoria-de-cristal.md)                           | Cruce de flags de cristal y material real en los 1.071 vehículos del servidor: inconsistencias y consistentes |
| [materiales-de-colision.md](../materiales/materiales-de-colision.md)         | Tabla de materiales de colisión del juego (213, de `materials.dat`), cristal de vehículo en detalle           |
| [shaders-de-vehiculo.md](shaders-de-vehiculo.md)                             | Shaders de vehículo y para qué sirve cada uno; hipótesis del tintado                                          |
| [../fixes-2026-11-12-v0.4.0/README.md](../fixes-2026-11-12-v0.4.0/README.md) | Los cuatro problemas reportados, con estado                                                                   |

Herramientas (AstraMapper): [vehicle-tools.md](https://github.com/adastra-org/astramapper/blob/feat/vehicle-tools/docs/vehicle-tools.md) — `vehicle_audit`, `yft_optimize`, `yft_glass`, `rpf_extract`.

Regla: toda referencia del juego sale de <https://docs.fivem.net/docs/game-references/>. Lo que no está ahí (materiales, shaders) se cita con su fuente y se marca como no oficial.
