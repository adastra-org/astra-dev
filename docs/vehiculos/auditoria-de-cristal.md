# Auditoría de cristal de los vehículos

Resultado de cruzar, por cada vehículo de `vehicles.meta`, los flags de cristal con los materiales de colisión reales de su `.yft`. Corrida del 2026-11-12 sobre `E:\FiveM\Astra
esources`.

- Herramienta: `scripts/glass-audit.ts` + `yft_glass --json` (AstraMapper, solo lectura).
- Flags: [vehicle-flags](https://docs.fivem.net/docs/game-references/vehicle-references/vehicle-flags/) oficial. Materiales: [materiales-de-colision.md](../materiales/materiales-de-colision.md).
- 1.071 entradas en `vehicles.meta`, 1.028 únicas por modelo y `.yft` (hay modelos definidos más de una vez, por ejemplo `s500w223`, `aleutianems` y `skyradar`). Los conteos de abajo son sobre las únicas.

Se compara contra `FLAG_HAS_BULLETPROOF_GLASS` ("el cristal no se rompe") y `FLAG_HAS_BULLET_RESISTANT_GLASS` ("el cristal resiste balas"). "Irrompible" en las tablas es el material `CAR_GLASS_BULLETPROOF` (123), el único que lo es. Ver el detalle en [flags-y-cristal.md](flags-y-cristal.md).

## Resumen

| Veredicto                                 | Vehículos | Qué significa                                                                                                                                                        |
| ----------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal`                                  | 850       | Sin flag de cristal y cristal común (120 a 122, 1 con 124)                                                                                                           |
| `sin-cristal`                             | 115       | Ningún polígono de cristal 120 a 124 en la colisión. 113 de 115 no tienen tabla de ventanas: por los nombres: remolques, tanques, autos RC. No se revisó uno por uno |
| `sin-yft`                                 | 28        | No hay un `.yft` suelto con ese nombre. Causas posibles, sin confirmar: el `.yft` está en otro formato de empaquetado, o el modelo se streamea desde otro resource   |
| `resistente-consistente`                  | 12        | Flag resistente y cristal común. Es lo esperado                                                                                                                      |
| `material-irrompible-sin-flag`            | 10        | Hay cristal irrompible pero ningún flag de cristal                                                                                                                   |
| `flag-irrompible-sin-material`            | 5         | Flag `BULLETPROOF` pero ningún polígono irrompible                                                                                                                   |
| `yft-ilegible`                            | 5         | No se pudo leer: 4 no son RSC7 (formato no soportado) y 1 con punteros inválidos (dañado)                                                                            |
| `irrompible-consistente`                  | 2         | Flag y material irrompibles                                                                                                                                          |
| `material-irrompible-con-flag-resistente` | 1         | Material irrompible con flag resistente                                                                                                                              |

Combinaciones de flags de cristal: 1.008 sin ninguno, 13 solo `BULLET_RESISTANT`, 1 solo `BULLETPROOF` (`onebeast`) y 6 con los dos a la vez (`s97raider`, `f35c`, `f22a`, `caliburn`, `nuketruck`, `s500w223`). O sea que los flags no son dos grupos separados: casi todo lo que lleva `BULLETPROOF` lleva también `BULLET_RESISTANT`.

## Lo que hay que mirar

### Flag irrompible, cristal que no lo es (5)

Llevan `FLAG_HAS_BULLETPROOF_GLASS` (impide que el cristal se rompa) y además `BULLET_RESISTANT`, pero su cristal de colisión es `WEAK`, `MEDIUM` o `STRONG`. El flag no cambia el material; falta decidir cuál de los dos es la intención.

| Modelo      | Flags de cristal       | Polígonos de cristal por material | Ventanas |
| ----------- | ---------------------- | --------------------------------- | -------- |
| `caliburn`  | RESISTANT, UNBREAKABLE | MEDIUM 8                          | 2        |
| `f22a`      | RESISTANT, UNBREAKABLE | STRONG 40                         | 1        |
| `f35c`      | RESISTANT, UNBREAKABLE | STRONG 32                         | —        |
| `nuketruck` | RESISTANT, UNBREAKABLE | STRONG 28                         | 4        |
| `s97raider` | RESISTANT, UNBREAKABLE | WEAK 16, STRONG 20                | 5        |

### Cristal irrompible sin flag (10)

Tienen polígonos `CAR_GLASS_BULLETPROOF` y ningún flag de cristal. Si el material basta, no pasa nada; si se esperaba un flag, falta.

| Modelo          | Flags de cristal | Polígonos de cristal por material             | Ventanas |
| --------------- | ---------------- | --------------------------------------------- | -------- |
| `25lanzador`    | —                | WEAK 24, STRONG 196, BULLETPROOF 4            | 8        |
| `catamaran`     | —                | BULLETPROOF 148                               | 1        |
| `kch53`         | —                | BULLETPROOF 76                                | —        |
| `mh47g`         | —                | BULLETPROOF 228                               | 11       |
| `pavelow`       | —                | BULLETPROOF 196                               | 11       |
| `rezvan2`       | —                | BULLETPROOF 24                                | 5        |
| `swatvanr2`     | —                | BULLETPROOF 56                                | 5        |
| `vwe_sparrow1`  | —                | WEAK 108, MEDIUM 4, STRONG 136, BULLETPROOF 4 | 5        |
| `vwe_stockade1` | —                | STRONG 12, BULLETPROOF 16                     | 9        |
| `zeekrx`        | —                | BULLETPROOF 48                                | 8        |

### Cristal irrompible con flag resistente (1)

Mezcla de material irrompible y flag que solo declara resistencia.

| Modelo      | Flags de cristal | Polígonos de cristal por material | Ventanas |
| ----------- | ---------------- | --------------------------------- | -------- |
| `2018s650p` | RESISTANT        | STRONG 48, BULLETPROOF 8          | 11       |

### Consistentes: irrompible (2)

Flag y material coinciden. Son la referencia de cómo debería verse un blindado completo.

| Modelo     | Flags de cristal       | Polígonos de cristal por material | Ventanas |
| ---------- | ---------------------- | --------------------------------- | -------- |
| `onebeast` | UNBREAKABLE            | WEAK 16, BULLETPROOF 52           | 10       |
| `s500w223` | RESISTANT, UNBREAKABLE | MEDIUM 94, BULLETPROOF 8          | 9        |

### Consistentes: resistente (12)

Flag resistente y cristal común (120 a 122). Es la configuración que describió Faku para `rrfaku`, que no tiene flag pero sí `STRONG`.

| Modelo          | Flags de cristal | Polígonos de cristal por material | Ventanas |
| --------------- | ---------------- | --------------------------------- | -------- |
| `aleutianems`   | RESISTANT        | WEAK 20, MEDIUM 251               | 10       |
| `benze55`       | RESISTANT        | STRONG 32                         | 6        |
| `hx58`          | RESISTANT        | STRONG 16                         | 3        |
| `lavad`         | RESISTANT        | STRONG 16                         | 4        |
| `offbaseq50`    | RESISTANT        | WEAK 16, MEDIUM 48, STRONG 48     | 4        |
| `skyradar`      | RESISTANT        | STRONG 16                         | —        |
| `sspres`        | RESISTANT        | STRONG 40                         | 8        |
| `swift23bcm`    | RESISTANT        | STRONG 8                          | 1        |
| `urbanetruck`   | RESISTANT        | WEAK 24, STRONG 20                | —        |
| `vwe_squaddie1` | RESISTANT        | WEAK 48, MEDIUM 20, STRONG 40     | 7        |
| `vwe_squaddie2` | RESISTANT        | WEAK 48, MEDIUM 20, STRONG 40     | 7        |
| `whitehawk`     | RESISTANT        | WEAK 56, STRONG 24                | 9        |

## Cómo leerlo

- El material decide cómo toma la bala cada ventana; el flag agrega su propio efecto encima. Una ventana puede ser `WEAK` y otra `STRONG` en el mismo auto: así viene en 568 vehículos con `WEAK`, `MEDIUM` y `STRONG` mezclados.
- `CAR_GLASS_BULLETPROOF` aparece en pocos polígonos en algunos autos (4 de 252 polígonos de cristal en `vwe_sparrow1`, 4 de 224 en `25lanzador`, 8 de 56 en `2018s650p`): puede ser una sola ventana, o un resto de exportación. No se sabe cuál sin mirar el modelo.
- Los vehículos sin flag y sin material irrompible (850) son el caso común: cristal normal.

## Límites de la auditoría

- Solo mira lo que dice el archivo. No probó disparos en el juego.
- Cuenta polígonos de la primera LOD física con colisión; si un `.yft` guarda el cristal en otro lugar (un `.ybn` aparte), no se vería.
- Un modelo definido en varios `vehicles.meta` se evalúa una vez por entrada (misma conclusión para el mismo `.yft`).
- Los 28 sin `.yft` suelto y los 5 ilegibles quedan sin evaluar.
- El cristal "irrompible" del juego puede depender además de código fuera de estos archivos; lo único medido es el `material_type`.

## Decisión pendiente

Por vehículo, qué se quiere: cristal que resiste o cristal que nunca se rompe, y en cuáles. Una vez decidido, la herramienta que cambia el material de los polígonos de cristal necesita que el escritor de `.yft` maneje las colisiones (hoy solo edita mallas). Los datos crudos están en `E:\Proyectos\_scratch\glass-audit.json`.
