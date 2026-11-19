# Contenido

Los documentos de Astra Dev viven en `content/docs/` como Markdown con frontmatter. Este archivo no es un doc: el motor solo lee `content/docs/`.

Esquema completo, qué valida el build y cómo se agrega un doc: [`docs/docs-engine/README.md`](../docs/docs-engine/README.md). La guía para quien escribe, dentro del propio sitio: `content/docs/como-escribir-un-doc.md`.

## Resumen

- Nombre del archivo = slug = URL. `content/docs/glosario.md` es `/docs/glosario`.
- Frontmatter: `title`, `summary`, `tags`, `since` (obligatorios); `related`, `lang` (opcionales).
- Sin `#` en el cuerpo: el título sale del frontmatter. Las secciones son `##`.
- Español neutro con tú, sin emojis ni signos de exclamación; los términos técnicos (native, resource, event) en inglés.

## Convención "ejemplo mínimo"

La sección `## Ejemplo mínimo` va primero (el motor la sube aunque esté más abajo) y siempre abierta. Lleva el fragmento más corto que funciona y como mucho una línea de contexto. La explicación va en las secciones siguientes, que se pliegan si pasan de 120 palabras.

Si el doc no tiene nada que ejecutar, se omite.

````md
## Ejemplo mínimo

Dibuja un texto cada frame:

```lua
CreateThread(function()
  while true do
    Wait(0)
    -- ...
  end
end)
```
````
