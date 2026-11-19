# Materiales del juego

Los materiales no son solo de vehículos. `materials.dat` es la tabla de propiedades físicas por tipo de superficie del juego entero, y el `material_type` de cada polígono de colisión es un índice a ella.

| Documento                                              | Qué cubre                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [materiales-de-colision.md](materiales-de-colision.md) | Los 213 materiales con su filtro y grupo FX, y el cristal de vehículo en detalle |

## Qué guarda cada entrada

Según el encabezado del propio archivo: filtro (categoría para las herramientas), grupo FX (efectos de impacto, sonido y decals), fricción, elasticidad, densidad, agarre de neumáticos (seco y mojado), blandura, ruido (lo usa el sigilo), inflamabilidad y tiempo de quemado, resistencia a la penetración y flags (`SEE_THRU`, `SHOOT_THRU`, `SHOOT_THRU_FX`, entre otros).

Cubre todo tipo de superficie, no solo vehículos:

| Filtro           | Entradas |
| ---------------- | -------- |
| `SPECIAL`        | 46       |
| `MANMADE`        | 31       |
| `LOOSE_TERRAIN`  | 26       |
| `HARD_TERRAIN`   | 22       |
| `NATURAL_MOTION` | 22       |
| `METALS`         | 20       |
| `WOODS`          | 14       |
| `VEGETATION`     | 10       |
| `VEHICLES`       | 10       |
| `LIQUIDS`        | 5        |
| `GLASS`          | 4        |
| `MISC`           | 2        |
| `DEFAULT`        | 1        |

El formato de colisión es el mismo en `.ybn` (mapa y props), `.ydr` y `.yft`, y `cw-core` lee el `material_type` con el mismo código. Hasta ahora solo se midió en `.yft` de vehículos; todavía no se lee ningún `.ybn`.

## Hay más de un `materials.dat`

`rpf_extract` revisa todos los archivos del juego, incluidos los RPF anidados, y encontró tres copias:

| Copia                                                                     | Entradas | Nota                                                                                                                       |
| ------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `common.rpf\data\materials\materials.dat` (base)                          | 212      |                                                                                                                            |
| `update\update.rpf\common\data\materials\materials.dat`                   | 213      | La que describen estos docs. Se asume que es la que usa el juego, y por lo tanto FiveM, porque `update.rpf` pisa a la base |
| `update\x64\dlcpacks\mpstunt\dlc.rpf\common\data\materials\materials.dat` | 213      | Mismos nombres y mismo orden que la de `update`; solo difieren los valores de una fila (`STUNT_RAMP_SURFACE`)              |

La diferencia importa porque los índices cambian:

- La de `update` agrega `STUNT_RAMP_SURFACE` en la posición **182**. Todo lo que sigue se corre una posición: por ejemplo `TEMP_01` es el 182 en la base y el 183 en `update`.
- Los tipos 0 a 181 son idénticos en las tres. Los de vehículos que se midieron (116 a 124 y 142) no se ven afectados.
- Para tipos 182 o más hay que saber con cuál copia se mapea. Esta documentación usa siempre la de `update`.

Si un DLC de terceros trae su propio `materials.dat` en un resource, no se vería acá: este escaneo es de la instalación del juego, no del servidor.

## `materialfx.dat`

También se extrajo `common.rpf\data\effects\materialfx.dat` (51.742 bytes) con `rpf_extract`. Relaciona grupos FX con efectos (CodeWalker lo usa para los colores de los materiales). No está analizado todavía.

## Pendiente

- Leer los materiales de colisión de `.ybn` del servidor y de mapas del juego, y listar qué tipos usan.
- Analizar `materialfx.dat` y ver qué efectos corresponden a cada grupo FX.
- Confirmar el orden de los cuatro flags crudos de cada entrada.
