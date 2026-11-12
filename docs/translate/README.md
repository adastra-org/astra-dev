# Traducción ES (M2)

Pipeline que traduce al español los natives y los docs importados de FiveM, con `deepseek-flash` vía `ds.ts` (skill `deepseek`). Código en `scripts/translate/`; resultado en `content/translations/es/`.

## Uso

```bash
bun run translate status                                   # conteos por flag y traducciones viejas
bun run translate natives --ns VEHICLE --limit 40          # hasta 40 natives de un namespace
bun run translate natives --names GetEntityCoords,PlayerPedId
bun run translate docs --limit 10 [--tag getting-started] [--slug a,b]
```

Flags: `--refresh` rehace las `auto` cuyo original cambió, `--dry-run` dice qué haría sin llamar al modelo, `--batch N` (natives por llamada, 6), `--jobs N` (llamadas en paralelo, 3), `--max-chars N` (los docs más largos se saltan, 12000).

Requiere `DEEPSEEK_API_KEY` y saldo en la cuenta de DeepSeek.

## Formato y flag

- `content/translations/es/natives/<slug>.yml` y `.../docs/<slug>.md`.
- `translated: auto` salió de un modelo y nadie la revisó; `translated: reviewed` la leyó una persona.
- `source` es el hash del texto en inglés que se tradujo: si el original cambia, la traducción queda vieja (se avisa en `status`).
- Una `reviewed` nunca se pisa, ni con `--refresh`. Para revisarla, se edita el archivo y se cambia el flag a mano.

## Reglas de la traducción

El prompt (`SYSTEM` en `translate.ts`) fija: español neutro tuteando, Markdown y código intactos, nada de traducir nombres de natives, parámetros, tipos ni hashes, y términos que la comunidad deja en inglés (ped, native, resource, spawn).

El pipeline es idempotente y se puede cortar y retomar: cada lote se guarda al terminar.

## Estado

- Pipeline, validación de respuestas y tests: hechos.
- Traducciones generadas: **ninguna todavía**. La cuenta de DeepSeek respondió 402 (saldo insuficiente) al primer intento (2026-11-12). Traducibles: 3.665 natives de 7.326 y 333 docs.
- Revisión humana: pendiente. Todo lo que se genere sale como `auto`.
