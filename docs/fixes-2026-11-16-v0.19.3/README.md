# Fixes 2026-11-16 (v0.19.3): mapas

Del audit de MLOs, portales y timecycles ([mapas/README.md](../mapas/README.md)). Se corrigen a mano en CodeWalker. Un ítem se marca `[x]` solo después de probarlo en juego.

`[ ]` pendiente · `[~]` parcial, con nota · `[x]` hecho y probado

## Timecycles que no resuelven

- [ ] Paradise `hash_796037B2`: 16 rooms con `hash_063B61B0`. Encontrar el XML del autor y cargarlo con `data_file 'TIMECYCLEMOD_FILE'`, o asignar un timecycle existente.
- [ ] m23 `m23_2_dlc_int_ship`: `hash_4314DE13`. Confirmar en juego si es un modificador de DLC.
- [ ] `Mapeados/fxmanifest.lua`: `files` lista `timecycles/ocean_h_timecycle.xml`, que no existe. Quitar la línea (el archivo real está en `data/XML/`, cubierto por `data/**/*.xml`).

## Puertas sin bit 64 (flags actuales entre paréntesis, índice:flags)

- [ ] Hall `cityhall`: 36/36 (0:8 5:0 6:0 7:0 8:0 9:0 10:0 11:0 12:0 13:0 14:0 15:0 16:0 23:0 30:0 32:0 33:0 34:0 35:0 37:0 38:0 39:0 52:8 60:8 68:8 69:8 76:0 80:8 93:0 94:0 95:0 96:0 97:0 104:0 105:0 106:0)
- [ ] Weazle `int_wnews`: 17/17 (0 2 3 4 5 6 7 8 10 11 12 13 16 18 19 21 22, todas en 0)
- [ ] Comisaria `mrpd_col`: 17/29 (0 3 6 7 8 9 10 11 13 20 27 28 29 31 37 38 39, todas en 8)
- [ ] Bunker `lks_bbk_col`: 10/10 (0 1 2 3 7 8 9 10 11 13, todas en 0)
- [ ] CasaRanch `mlo_gravestone_col`: 8/11 (0:8192 1:0 6:8192 11:8192 12:8192 21:8192 22:8192 38:0)
- [ ] OceanHospital `amx_plus8`: 4/9 (5:8192 6:8192 13:8192 20:0)
- [ ] CasaRanch `v_ranch`: 3/4 (6:1 12:1 13:1)
- [ ] CasaMia `mwh_garage_shell_01_1a_collision`: 3/3 (0:8192 1:8192 2:8192)
- [ ] CasaMia `mwh_shell_01_1a_collision`: 2/3 (3:8192 14:8200)
- [ ] OceanHospital `v_oceanml`: 2/19 (82:0 85:0)
- [ ] Vanilla `v_strip3`: 2/7 (3:0 7:8)
- [ ] OceanHospital `v_oceanml2`: 1/6 (13:2)
- [ ] Mecanico `rfc_eastcustums_col`: 1/3 (2:0)
- [ ] GYM `lks_gym_col`: 1/1 (0:8192)
- [ ] XLabs2 `uniqx_xlabs2_col`: 1/1 (1:0)

Antes de cambiar `8192` por `8256` (8192 + 64): confirmar qué hace el bit 8192 en el diccionario de flags.

## Rooms sin flags 96

- [ ] Paradise `hash_796037B2`: rooms 4 a 16 en `4`
- [ ] Paradise `hash_DCEBB0ED`: room 1 en `4`
- [ ] XLabs1 `uniqx_xlabs-p1_col`: rooms 2, 3, 4 en `0`
- [ ] ShowRoom `fm_showroom_coll`: room 1 en `0`

## Ventanas sin bit 8

- [ ] CasaRanch `mlo_gravestone_col`: 4 ventanas. Esperar confirmación del bit antes de tocar.

## Duplicados

- [ ] `hei_dt1_occl_05`: `Ambiente/ConstruccionDestruida` y `Comisaria`. Dejar uno.
- [ ] `lr_sc1_occl_00`: `Grove` y `OceanHospital`. Dejar uno.
- [ ] `hei_ch3_04_strm_0` (`Etc`) y `hei_cs3_07_strm_4` (`Ceremony`) chocan con `qbx_density/car_gen_disablers`. Pasar los car gens al YMAP del mapa y sacar el del disabler.
- [ ] Archetype `toiletteocean` en `mx_ocean_hospital_props.ytyp` y `mx_ocean_hospital_shell_typ.ytyp`. Dejar uno.

## LOD y carga

- [ ] `mixed-lod`: `Ambiente/YateEncallado/yate2.ymap`, `OTM/akiyama.ymap`. Separar HD y LOD en YMAPs con `parent`.
- [ ] `Vegetacion`: unos 70 YMAPs cargados en cualquier punto. Fusionar (LTP: `ymap_merge` en AstraMapper).

## Timecycle propio de interiores

- [ ] Prototipo `astra_int` basado en `mp_studio_lo`, probado en 3 MLOs (Fase 4 del plan).
