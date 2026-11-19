# Desarrollo del server: guardas y migración a Enhanced

Fuente: `server-security`, `sandbox` y `legacy-vs-enhanced` de fivem-docs (importados, sha fijado en `content-sources.json`). `script-runtimes` es la API interna de runtimes de CitizenFX y no aplica a Astra.

Las reglas para agentes están en [../../AGENTS.md](../../AGENTS.md). Esta página guarda el detalle y el estado.

## Hook de guardas

`.claude/settings.json` (versionado) corre `scripts/server-guard/guard.ts` antes de cada `Write`, `Edit` y `MultiEdit`. Solo mira archivos `.lua` y `.cfg`; el TS y el Markdown de este repo pueden nombrar esas APIs.

| Archivo | Acción   | Patrón                                                                                                                                  |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `.lua`  | bloquea  | `os.execute`, `io.tmpfile`, `io.popen`, `pairs/ipairs(io.readdir(...))`                                                                 |
| `.lua`  | pregunta | `../` en rutas (el sandbox lo rechaza)                                                                                                  |
| `.cfg`  | bloquea  | `sv_useAccurateSends`, `sv_netHttp2`, `sv_protectServerEntities`, `onesync_automaticResend`, `onesync_enableBeyond`, `+set moo`, `-cl2` |
| `.cfg`  | pregunta | `add_filesystem_permission`, `add_unsafe_worker_permission`, `add_unsafe_child_process_permission`                                      |

Un hook de proyecto se suma a los del usuario (`~/.claude/settings.json`); no los reemplaza ni los desactiva. Solo se carga el `.claude/settings.json` de la raíz del repo donde corre la sesión, no el de una carpeta padre, así que cada repo del server necesita el suyo.

## Checklist de migración a Enhanced

Estado: `[ ]` pendiente · `[~]` parcial · `[x]` hecho. Nada se tilda sin verificar contra el server.

- [ ] Ningún resource depende de P2P ni de OneSync sin big mode.
- [ ] Ningún código asume IDs de jugador crecientes o únicos para siempre (los IDs se reutilizan).
- [ ] Las KVDB migradas con `kvdb-migrator` (github.com/citizenfx/kvdb-migrator).
- [ ] Comandos remotos que devuelven log usan `PrintRemoteCommandLog(message)`.
- [ ] Callbacks NUI revisadas contra `nui_callback_strict_mode` (o `'false'` en el manifest con motivo).
- [ ] Assets Gen9 movidos a `stream_enhanced`.
- [ ] `server.cfg` sin `sv_useAccurateSends`, `sv_netHttp2`, `sv_protectServerEntities`, `+set moo`, `-cl2`, Mumble.
- [ ] Un solo endpoint por `endpoint_add_tcp` / `endpoint_add_udp`.
- [ ] Callbacks de state bags toleran que la entidad no exista todavía.
- [ ] Scripts C# en .NET 10 (Mono se reemplaza).
- [ ] Ningún resource es builder; ningún mod gráfico (pure mode siempre activo).
- [ ] Binarios renombrados (`cfx-server.exe`) en deploy y servicios.
- [ ] Decidido `sv_entityLockdown` (`full` o `relaxed`) y `sv_syncTickRate` (60 por defecto).

## Auditoría de seguridad de resources (Legacy, ahora)

- [ ] Cada `RegisterNetEvent` del server valida sus argumentos y toma el jugador de `source`.
- [ ] Cada net event del cliente comprueba `source == 65535`.
- [ ] Convars `sv_kick_players_cnl_*`, `sv_pure_verify_client_settings`, `sv_authMinTrust`, `sv_authMaxVariance`, `sv_filterRequestControl` evaluadas (`sv_disableClientReplays` apaga el Rockstar Editor).
- [ ] Permisos `add_*_permission` del `server.cfg` justificados uno por uno.
