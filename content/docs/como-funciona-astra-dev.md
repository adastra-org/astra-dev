---
title: Cómo funciona Astra Dev
summary: Astra Dev es un sitio estático con la documentación y las herramientas para desarrollar el servidor Ad Astra. Los docs son archivos Markdown de este repo; el historial de cada uno es su git log.
tags: [proyecto]
related: [flujo-de-deploy, como-escribir-un-doc, sistema-de-diseno]
since: 0.1.0
---

Astra Dev reúne en un solo lugar lo que el equipo necesita para trabajar en el servidor FiveM de Ad Astra: documentación en español, herramientas y, más adelante, búsqueda en lenguaje natural. Vive en `https://development.adastrarp.com`.

## Ejemplo mínimo

Para ver un doc en tu máquina, instala dependencias y levanta el servidor de desarrollo:

```bash
bun install
bun run dev
```

Abre la URL que imprime Vite y entra a `/docs`. Si editas un archivo de `content/docs`, la página se recarga sola.

## Qué hay hoy

- Una base de React 19 con Vite y Tailwind v4, con el tema oscuro del design system de Ad Astra.
- Un motor de docs: cada archivo Markdown de `content/docs` se valida, se renderiza en el build y se publica como una página.
- Un deploy blue/green que se dispara al hacer merge a `main`.

Lo que todavía no existe: la búsqueda con Ask Ether (M3), el selector de idioma funcional (M2) y el sandbox de código (M4). Los milestones están en `docs/plan/README.md`.

## Por qué es un sitio estático

El contenido cambia por pull request, no por formulario, así que no hace falta una base de datos ni un proceso en el servidor. Nginx sirve la carpeta `dist/` y listo. Esto tiene tres consecuencias prácticas:

1. No hay nada que reiniciar ni monitorear: si nginx responde, el sitio funciona.
2. El historial de cada documento es el `git log` de su archivo, sin un sistema de versiones aparte.
3. Cuando llegue Ask Ether, se agregará un servidor mínimo detrás de `/api/`; el resto del sitio seguirá siendo estático.

La decisión completa, con sus alternativas, está en `ARCHITECTURE.md`.

## Dónde está cada cosa

| Qué                      | Dónde                                         |
| ------------------------ | --------------------------------------------- |
| Contenido de los docs    | `content/docs/*.md`                           |
| Motor de docs (build)    | `scripts/docs/`                               |
| Páginas y componentes    | `src/pages/`, `src/components/`               |
| Tokens del design system | `design/tokens.json` (copia, no se edita acá) |
| Workflows y deploy       | `.github/workflows/`, `deploy/`               |

Para agregar un documento, sigue [Cómo escribir un doc](/docs/como-escribir-un-doc). Para entender cómo llega a producción, lee [Flujo de deploy](/docs/flujo-de-deploy).
