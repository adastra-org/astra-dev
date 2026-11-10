---
title: Glosario
summary: Términos del servidor FiveM y de este proyecto, con una línea cada uno. Es un borrador que se amplía a medida que aparecen docs nuevas.
tags: [referencia]
related: []
since: 0.2.0
---

Los términos de FiveM se dejan en inglés porque así aparecen en el código y en la documentación oficial.

## FiveM

- **Native**: función del motor del juego que un script puede llamar, por ejemplo para dibujar texto o crear un vehículo. Se identifican por un nombre y un hash.
- **Resource**: carpeta con scripts y archivos que el servidor carga como una unidad. Un resource se describe con un manifiesto.
- **Event**: mensaje que un script emite y otros reciben. Puede cruzar entre cliente y servidor.
- **Client / server**: los scripts se ejecutan en el cliente (el jugador) o en el servidor. Cada lado tiene sus natives y sus límites.
- **Thread**: bucle de ejecución de un script. En Lua se crea con `CreateThread`.

## Este proyecto

- **Doc**: archivo Markdown de `content/docs`. Su nombre sin `.md` es el slug.
- **Slug**: identificador de un doc en la URL, por ejemplo `/docs/glosario`.
- **Frontmatter**: bloque YAML al inicio de un doc con título, resumen, tags y relacionados.
- **Backlink**: enlace inverso. Si un doc A declara a B en `related`, B muestra a A en "Usada por".
- **Slot**: cada una de las dos carpetas del deploy, `blue` y `green`. Una está en vivo y la otra espera el siguiente build.
- **Blue/green**: estrategia de deploy con dos slots; cambiar de versión es mover un symlink.
- **Token**: valor del design system (color, espacio, radio) que la interfaz usa por rol, nunca como valor suelto.
- **Ejemplo mínimo**: el fragmento más corto que funciona, siempre al principio de un doc.

Para entender el deploy, lee [Flujo de deploy](/docs/flujo-de-deploy).
