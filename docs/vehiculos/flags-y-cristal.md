# Vehículos: flags, cristal y tintado

Qué se midió en el servidor de Ad Astra (`E:\FiveM\Astra\resources`, 2026-11-12) y qué sigue abierto. Las herramientas que lo produjeron están en AstraMapper ([docs/vehicle-tools.md](https://github.com/adastra-org/astramapper/blob/feat/vehicle-tools/docs/vehicle-tools.md)).

## Fuente de verdad

Toda referencia del juego sale de la documentación oficial de Cfx, no de memoria ni del registro de nombres de CodeWalker:

- Índice: <https://docs.fivem.net/docs/game-references/>
- Flags de vehículo: <https://docs.fivem.net/docs/game-references/vehicle-references/vehicle-flags/> (204 flags, del 0 al 203, con descripción y build en que se introdujo cada uno)

`MetaNames.cs` de CodeWalker es un registro de hashes y nombres. Incluye nombres que el juego nunca definió, así que no sirve para validar. La primera pasada de esta auditoría lo usó y dio por válido `FLAG_HAS_BULLETPROOF_GLASS` por casualidad; los números de abajo usan la lista oficial.

Fuera de esa sección: los materiales de colisión no tienen página. Sus nombres salen del `materials.dat` del juego ([materiales-de-colision.md](materiales-de-colision.md)).

## 1. Flags en `vehicles.meta`

Escaneo: todos los `vehicles.meta` bajo `resources` (1.072 modelos) contra los 204 flags oficiales.

**86 usos de flags que el juego no define, en 45 archivos.**

| Flag en el servidor | Usos | Nombre oficial |
|---|---|---|
| `FLAG_HAS_EXTRA` | 29 | ninguno |
| `FLAG_HAS_INTERIOR_EXTRA` | 29 | `FLAG_HAS_INTERIOR_EXTRAS` |
| `FLAG_HAS_EXTRA_ALL` | 7 | probablemente `FLAG_EXTRAS_ALL` |
| `FLAG_RESPRAY` | 7 | ninguno (por defecto ya se puede repintar; lo opuesto es `FLAG_NO_RESPRAY`) |
| `FLAG_HAS_EXTRAS` | 7 | ninguno |
| `FLAG_INCREASED_RAMMING_FORCE` | 2 | `FLAG_HAS_INCREASED_RAMMING_FORCE` |
| `FLAG_CAPPED_EXPLOSION_DAMAGE` | 1 | `FLAG_HAS_CAPPED_EXPLOSION_DAMAGE` |
| `FLAG_HAS_GULLWING_DOORS` | 1 | `FLAG_HAS_GULL_WING_DOORS` |
| `FLAG_NO_ROOF` | 1 | `FLAG_HAS_NO_ROOF` |
| `FLAG_NO_DOORS` | 1 | ninguno |
| `FLAG_EXTRAS_SUNROOF` | 1 | ninguno |

Flags que la doc marca como "Does nothing" (se pueden dejar; es ruido): `FLAG_NO_BOOT` (171 usos) y `FLAG_BOOT_IN_FRONT` (13 usos; la doc dice que se use `FLAG_FRONT_BOOT`).

Herramienta prevista: `vehicle_flags`. Informa los desconocidos y los que no hacen nada, aplica solo los renombres de arriba que tienen equivalente oficial, deja listados los ambiguos y guarda backup con rollback, como `yft_optimize`.

## 2. Cristal: flag y material

Dos cosas deciden cómo se comporta una ventana, y el flag es la menor.

**Flags** (descripciones oficiales):

| Flag | # | Efecto |
|---|---|---|
| `FLAG_HAS_BULLETPROOF_GLASS` | 76 | Impide que el cristal se rompa |
| `FLAG_HAS_BULLET_RESISTANT_GLASS` | 120 | El cristal del vehículo resiste balas |

Son comportamientos distintos, no sinónimos. El servidor usa `BULLET_RESISTANT` en 22 entradas y `BULLETPROOF` en 8.

**Material.** Cada polígono de colisión del `.yft` tiene un tipo de material, y eso decide cómo reacciona la superficie a las balas. Ejemplo de Faku: `rrfaku` tiene cristal resistente pero no irrompible y su `vehicles.meta` no lleva ninguno de los dos flags. O sea que la resistencia la da solo el material.

`yft_glass` (ejemplo de solo lectura en `crates/cw-core/examples/` de AstraMapper) vuelca los tipos de material de un `.yft` y su tabla de ventanas:

```bash
cargo build --release -p cw-core --example yft_glass
./target/release/examples/yft_glass.exe "E:/FiveM/Astra/resources/.../auto.yft"
```

Medido en 7 vehículos (sin conteo de polígonos; los tipos son el `material_type` crudo):

| Vehículo | Flag en el meta | Tipos de material |
|---|---|---|
| `rrfaku` | ninguno | 116, 122, 142 |
| `s500w223` | BULLETPROOF | 116, 121, 123, 142 |
| `nuketruck` | BULLETPROOF | 116, 122, 142 |
| `caliburn` | BULLETPROOF | 116, 121, 142 |
| `aleutianems` | RESISTANT | 116, 117, 120, 121, 142 |
| `hx58` | RESISTANT | 0, 70, 116, 117, 118, 122, 142 |
| `bfdsuv` | ninguno | 116, 117, 120, 121, 122, 142 |

Nombres de esos números, del `materials.dat` del juego (tabla completa en [materiales-de-colision.md](materiales-de-colision.md)):

| Tipo | Nombre |
|---|---|
| 116 | `CAR_METAL` |
| 117 | `CAR_PLASTIC` |
| 118 | `CAR_SOFTTOP` |
| 120 | `CAR_GLASS_WEAK` |
| 121 | `CAR_GLASS_MEDIUM` |
| 122 | `CAR_GLASS_STRONG` |
| 123 | `CAR_GLASS_BULLETPROOF` |
| 142 | `PHYS_CAR_VOID` |
| 70 | `WOOD_SOLID_MEDIUM` |
| 0 | `DEFAULT` |

Lectura de las muestras con esos nombres:

- `rrfaku` usa `CAR_GLASS_STRONG`: resistente, no irrompible. Coincide con la descripción de Faku y confirma el desfase de la tabla.
- Solo el 123 `CAR_GLASS_BULLETPROOF` es realmente irrompible (resistencia a la penetración 10000, sin flags de disparo atraviesa). De las tres muestras con el flag BULLETPROOF, solo `s500w223` lo tiene, en 8 polígonos; `nuketruck` y `caliburn` llevan el flag pero su cristal es `STRONG` y `MEDIUM`.
- `bfdsuv` no tiene flag de cristal y mezcla `WEAK`, `MEDIUM` y `STRONG` por ventana.
- `aleutianems` y `hx58` llevan `BULLET_RESISTANT` con solo `WEAK`, `MEDIUM` y `STRONG`.
- Entonces el flag y el material son independientes: el material decide cómo toma la bala el cristal y el flag agrega su propio comportamiento encima. Una auditoría de cristal tiene que leer los dos.
- El `.yft` también trae una tabla de ventanas de vehículo (`yft_glass` la imprime). Todavía no se sabe qué significan sus campos para el blindaje.

## 3. Tintado en las luces

Sin reproducir todavía. Hipótesis (detalle en [shaders-de-vehiculo.md](shaders-de-vehiculo.md)): las luces usan un shader de pintura, un nombre de material `[PAINT:X]` o `vehicle_vehglass` en vez de `vehicle_lightsemissive`, o comparten UV con una zona pintada. Se puede detectar desde el `.yft` listando el shader de cada geometría. Corregirlo implica editar materiales o geometría con el escritor C#, que tampoco está verificado en el juego.

Hace falta un vehículo concreto donde las luces se tiñan para reproducirlo.

## 4. LODs

Resuelto: `yft_optimize --lods`. Sin verificar en el juego todavía.
