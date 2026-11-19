# Mapas: auditoría de MLOs, portales y timecycles

Qué se midió en `E:\FiveM\Astra\resources` el 2026-11-16 con `map_audit` de AstraMapper ([docs/map-tools.md](https://github.com/adastra-org/astramapper/blob/dev/docs/map-tools.md)) y qué sigue abierto. La auditoría solo lee: nada se modificó en el servidor.

Correcciones pendientes, con su estado: [fixes-2026-11-16-v0.19.3](../fixes-2026-11-16-v0.19.3/README.md).

## Cómo se corrió

```bash
# en AstraMapper (dev)
cargo build --release -p cw-core --example map_audit
./target/release/examples/map_audit.exe "E:/FiveM/Astra/resources" \
  --gta "E:/SteamLibrary/steamapps/common/Grand Theft Auto V" --out map-audit.json
bun scripts/map-hex.ts map-audit.json --out map-hex.json
```

Reglas por defecto (`map-rules.json` no se pasó): `roomFlags` 96, `doorPortalFlags` 64, `windowPortalFlags` 8, `roomTimecycles` `["mp_studio_lo"]`.

Los timecycles del ytyp vienen como hash. Se resolvieron con joaat sobre los 14.625 nombres de `dolu_tool/shared/data/timecycleModifiers.json` más los modificadores propios de `Mapeados/data/XML` (`fm_showroom_tc`, `ocean_main1`, `ocean_main2`).

## Totales

| Qué                          | Cantidad                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| Archivos de mapa             | 1.010 (904 ymap, 106 ytyp)                                  |
| YMAPs streameados            | 695 (233 reemplazan uno del juego)                          |
| MLOs streameados             | 35, 33 con al menos un aviso                                |
| `huge-extents` / `tiny-ymap` | 185 / 137                                                   |
| `duplicate-name`             | 10 (5 YMAPs, ver abajo)                                     |
| `extents-stale`              | 16                                                          |
| `mixed-lod`                  | 2 (`Ambiente/YateEncallado/yate2.ymap`, `OTM/akiyama.ymap`) |

## Cómo leer los avisos de MLO

No todo aviso es un error. Las reglas por defecto son una decisión del equipo, no una verdad del juego:

- **Timecycle**: la regla acepta solo `mp_studio_lo`, así que marca cualquier otro. Un timecycle vanilla pensado para ese interior (`STRIP_nofog`, `PoliceStation`, `heist_boat`, `ranch`) es elección del autor, no un error. **Error real**: un hash que no resuelve a ningún modificador cargado. El juego no encuentra el modificador y el room queda sin timecycle propio.
- **Puertas**: bit 64 = el MLO deja de renderizar lo de atrás mientras la puerta está cerrada ([forum.cfx.re](https://forum.cfx.re/t/mlo-renders-when-entering-room/5208215)). Sin él la puerta se ve, pero se dibuja de más y puede fallar la oclusión. Las puertas con flags `0` son las más claras.
- **Ventanas**: `windowPortalFlags` 8 no tiene fuente. No corregir por este aviso hasta confirmar el bit (ver diccionario de flags).
- **Rooms**: bits 32 y 64 no están confirmados. El caso a mirar es Paradise, con rooms en `4` mientras el resto del servidor usa `96`.

Un portal se clasifica como puerta solo si tiene un objeto con `door` en el nombre. Un hueco sin puerta adjunta sale como `other` y no se revisa, así que los portales faltantes (rooms que no se conectan) no aparecen acá: se ven en juego con dolu_tool.

## Errores reales

| Mapa                                   | MLO                  | Problema                                                                                                                         |
| -------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Paradise                               | `hash_796037B2`      | 16 rooms con timecycle `hash_063B61B0`: no resuelve a ningún modificador del juego ni del servidor. Rooms con flags `4`          |
| Paradise                               | `hash_DCEBB0ED`      | Room 1 con flags `4` (`v_torture` es vanilla y existe)                                                                           |
| m23 (`m23_2_mp2023_02_dlc_int_5.ytyp`) | `m23_2_dlc_int_ship` | Timecycle `hash_4314DE13` sin resolver. Puede ser un modificador de un DLC posterior a la lista de dolu_tool: confirmar en juego |
| Hall                                   | `cityhall`           | 36 de 36 puertas sin bit 64 (24 con flags `0`)                                                                                   |
| Weazle                                 | `int_wnews`          | 17 de 17 puertas con flags `0`                                                                                                   |
| Bunker                                 | `lks_bbk_col`        | 10 de 10 puertas con flags `0`                                                                                                   |
| Comisaria                              | `mrpd_col`           | 17 de 29 puertas con flags `8` en vez de `64`                                                                                    |
| XLabs1                                 | `uniqx_xlabs-p1_col` | Rooms 2, 3 y 4 con flags `0`                                                                                                     |
| ShowRoom                               | `fm_showroom_coll`   | Room 1 con flags `0` (timecycle `fm_showroom_tc`, propio, cargado)                                                               |

Tabla completa por MLO: ver el checklist de fixes.

## Timecycles en uso (rooms streameados)

| Timecycle                      | Rooms          |
| ------------------------------ | -------------- |
| `int_clotheslow_large`         | 28             |
| `NEW_ornate_bank_entrance`     | 23             |
| `FrankilinsHOUSEhills`         | 22             |
| `mp_studio_lo`                 | 22             |
| `int_clean_extlight_small`     | 19             |
| `hash_063B61B0` (sin resolver) | 16             |
| `int_methlab_small`            | 12             |
| `STRIP_nofog`                  | 10             |
| otros 20                       | 1 a 7 cada uno |

`ocean_main1` y `ocean_main2` se cargan (`Mapeados/fxmanifest.lua`) pero ningún room los usa: OceanHospital usa `int_clotheslow_large`. Además `files` lista `timecycles/ocean_h_timecycle.xml`, ruta que no existe (el archivo está en `data/XML/`).

## Carga de YMAPs por zona

Contexto: el crash `MapDataLoadedNode Pool Full, Size == 1100`. `map-hex.ts` cuenta los YMAPs del servidor cargados a la vez en celdas de 250 m.

| Punto                     | YMAPs agregados | Reemplazos | Mapa que más carga |
| ------------------------- | --------------- | ---------- | ------------------ |
| Rockford (-1083, -375)    | 79              | 27         | Vegetacion 69      |
| Sandy Shores (1732, 3750) | 58              | 12         | Vegetacion 52      |
| Grapeseed (2382, 4875)    | 56              | 16         | Vegetacion 53      |
| Peor celda (650, 375)     | 85              | 13         | Vegetacion 75      |

`Vegetacion` aporta unos 70 YMAPs en todo el mapa: sus YMAPs coarse cubren el mapa entero. Es el primer candidato a fusionar. `map-hex` propone 27 grupos (53 YMAPs menos); la fusión todavía no tiene herramienta (`ymap_merge --apply` no existe).

## Duplicados

- `hei_dt1_occl_05`: en `Ambiente/ConstruccionDestruida` y en `Comisaria`.
- `lr_sc1_occl_00`: en `Grove` y en `OceanHospital`.
- `hei_ch3_04_strm_0` (`Etc`), `hei_cs3_07_strm_4` (`Ceremony`), `hei_ap1_01_c_strm_0` (`fivem-greenscreener`): también en `qbx_density/car_gen_disablers`. Gana uno solo: el mapa pierde sus cambios o el disabler deja de aplicar.
- Archetype `toiletteocean` definido en dos ytyp de OceanHospital.

## Pendiente

- Corregir: a mano en CodeWalker con el checklist. AstraMapper no escribe ytyp todavía.
- Fixer automático de flags de MLO y `ymap_merge`: issues en AstraMapper.
- Significado de cada bit de room y portal: diccionario de flags (próximo).
