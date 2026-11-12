# Correcciones 2026-11-12 (v0.4.0): vehículos

`[ ]` pendiente · `[~]` parcial, con nota · `[x]` hecho y verificado. Hallazgos en [../vehiculos/flags-y-cristal.md](../vehiculos/flags-y-cristal.md).

## Vehículos del servidor (reportado por Faku)

- [~] **Blindar ventanas.** Dos partes: el flag (`FLAG_HAS_BULLET_RESISTANT_GLASS` vs `FLAG_HAS_BULLETPROOF_GLASS`) y el material de colisión del cristal (`CAR_GLASS_WEAK`/`MEDIUM`/`STRONG`/`BULLETPROOF`, tipos 120 a 123, nombrados desde `materials.dat`). Medido en 7 vehículos; todavía no hay herramienta que los cambie.
- [ ] **Aplicar / quitar tintado.** Las luces se tiñen cuando las UV están mal. Hipótesis escrita ([shaders-de-vehiculo.md](../vehiculos/shaders-de-vehiculo.md)); falta un vehículo que lo muestre.
- [~] **LODs inexistentes.** `yft_optimize --lods` los genera, con backup, rollback y reporte. Verificado sobre una copia en scratch; todavía no en el juego.
- [~] **Flags mal configuradas.** 86 usos de 11 flags que la lista oficial no define, en 45 archivos (tabla en el doc de hallazgos). Informado; todavía no hay herramienta `vehicle_flags`.

## Referencias

- [x] Toda referencia del juego sale de <https://docs.fivem.net/docs/game-references/>. La auditoría de flags se rehízo contra la página oficial (204 flags).
- [x] Los materiales de colisión no tienen página en esa sección: los nombres salen del `materials.dat` del juego ([materiales-de-colision.md](../materiales/materiales-de-colision.md)).
- [ ] <https://gtaforums.com/topic/899267-entities-and-materials/> no se pudo leer (desafío de Cloudflare). Faku puede pegar la parte relevante si importa.

## Decisiones abiertas

- [ ] Por vehículo: ¿`BULLET_RESISTANT` (el cristal resiste) o `BULLETPROOF` (el cristal nunca se rompe)? No son intercambiables.
- [ ] Flags ambiguos (`FLAG_HAS_EXTRA`, `FLAG_HAS_EXTRAS`, `FLAG_RESPRAY`, `FLAG_NO_DOORS`, `FLAG_EXTRAS_SUNROOF`): ¿se quitan o se mapean?
