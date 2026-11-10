---
title: Sistema de diseño
summary: La interfaz usa los roles del design system de Ad Astra (superficie, texto, acento) a través de Tailwind. Nunca se escribe un color suelto. Si falta un rol, se agrega al design system.
tags: [proyecto, diseno]
related: [como-escribir-un-doc]
since: 0.1.0
---

Astra Dev es una herramienta de lectura larga para el equipo, así que usa un solo tema oscuro, el tema Void del design system de Ad Astra. Las reglas completas están en `DESIGN.md`; este doc es el resumen.

## Ejemplo mínimo

Usa el rol, no el color:

```tsx
<p className="bg-surface-raised text-ink-muted border-border rounded-md border p-4">
  Texto secundario sobre una superficie elevada.
</p>
```

`bg-surface-raised`, `text-ink-muted` y `border-border` salen de `design/tokens.json`. Si escribes un hex en un componente, el cambio no pasa la revisión.

## Reglas que más se rompen

- Los colores de marca (`vibrant`, `pink`) son para piezas gráficas, no para la interfaz.
- Los íconos salen de `lucide-react`; no se mezclan otros conjuntos.
- Nunca se usa solo el color para marcar un estado: va con un ícono y un texto.
- Todo debe funcionar a 375 px sin scroll horizontal de página. Las tablas y los bloques de código se desplazan dentro de su propio contenedor.

## Tokens

`design/tokens.json` es una copia del design system y no se edita acá. Para actualizarlo se cambia en el design system, se copia el archivo y se corre `bun run tokens`, que regenera `src/styles/tokens.css`. Una prueba mide el contraste de cada par de roles: texto a 4.5:1 y controles a 3:1.

## Tipografía

| Uso                   | Familia    |
| --------------------- | ---------- |
| Títulos               | Unbounded  |
| Texto                 | Geologica  |
| Código y datos cortos | Space Mono |

Las fuentes se sirven desde el propio sitio con `@fontsource`; no se cargan de un CDN.

## Colores del código

El resaltado de sintaxis de los bloques de código también usa roles: las palabras clave van en el acento, las cadenas en el color de éxito y los comentarios en el texto más tenue. Un tema externo con su propia paleta queda fuera por la misma regla de tokens.

Para el formato de lectura de un doc, mira [Cómo escribir un doc](/docs/como-escribir-un-doc).
