---
title: Cómo escribir un doc
summary: Crea un archivo .md en content/docs con frontmatter válido, empieza por el ejemplo mínimo y deja el detalle en secciones. El nombre del archivo es el slug y la URL.
tags: [guia, contenido]
related: [glosario, sistema-de-diseno]
since: 0.2.0
---

Un doc se lee en medio de una tarea. Está pensado para que la primera pantalla responda "¿es este?" y el resto pueda esperar. El motor hace parte del trabajo: muestra el resumen primero, sube el ejemplo mínimo y pliega las secciones largas.

## Ejemplo mínimo

Crea `content/docs/mi-doc.md`. El nombre sin `.md` es el slug, así que la página queda en `/docs/mi-doc`.

```md
---
title: Dibujar texto en pantalla
summary: Qué hace, cuándo usarlo y el error más común, en dos o tres líneas.
tags: [natives]
related: [glosario]
since: 0.2.0
---

Una o dos frases de contexto.

## Ejemplo mínimo

(el código más corto que funciona)

## Detalle

Explicación, parámetros y notas.
```

Corre `bun run check`: si el frontmatter es inválido o el slug se repite, falla ahí.

## Frontmatter

| Clave     | Obligatoria | Qué es                                                          |
| --------- | ----------- | --------------------------------------------------------------- |
| `title`   | sí          | Título de la página                                             |
| `summary` | sí          | Va en el recuadro Resumen, arriba de todo                       |
| `tags`    | sí          | Lista en minúsculas con guiones; el primero agrupa en el índice |
| `related` | no          | Slugs de otros docs; los backlinks se calculan solos            |
| `since`   | sí          | Versión X.Y.Z desde la que aplica                               |
| `lang`    | no          | `es` (por defecto) o `en`                                       |

Una clave que no esté en esta lista rompe el build, para que un typo no pase en silencio. El frontmatter es YAML: si un valor contiene `: ` (dos puntos y espacio), ponlo entre comillas.

## La convención del ejemplo mínimo

La sección que se llama exactamente `## Ejemplo mínimo` se muestra siempre abierta y justo después de la introducción, aunque la escribas más abajo. Pon ahí el fragmento más corto que funcione, sin explicación larga: el lector lo copia y vuelve al trabajo. La explicación va en las secciones siguientes.

Si un doc no tiene nada que ejecutar, como un glosario, no inventes un ejemplo: omite la sección.

## Secciones y plegado

Cada `##` abre una sección. Las que superan unas 120 palabras llegan plegadas y se abren con un clic; las cortas se muestran directo. Usa `###` para subdividir y evita niveles más profundos.

No pongas un `#` en el cuerpo: el título sale del frontmatter y el build lo rechaza. El HTML crudo tampoco se interpreta, se muestra como texto.

## Enlaces

Para enlazar otro doc usa su ruta: `[Glosario](/docs/glosario)`. Si el slug no existe, el build avisa. Para relacionar dos docs de forma que aparezcan en "Relacionados" y "Usada por", declara el slug en `related`.

## Código

Los bloques con lenguaje se resaltan: `lua`, `bash`, `typescript`, `tsx`, `javascript`, `json`, `yaml`, `markdown`, `sql`, `css`, `html`, `diff`, `toml` y `csharp`. Cada uno trae el botón Copiar. Sin lenguaje se muestra como texto plano.

## Tono

Español neutro con tú, sin emojis ni signos de exclamación. Los términos técnicos (native, resource, event) quedan en inglés dentro de una oración en español. Más reglas en [Sistema de diseño](/docs/sistema-de-diseno).
