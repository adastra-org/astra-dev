# Idioma de la interfaz (M2)

La interfaz está en español e inglés. El selector (ES / EN) está en la barra superior; la elección queda en `localStorage` (`astra-dev:lang`) y se aplica a `<html lang>`. Por defecto, español.

## Cómo está armado

- `src/lib/i18n.ts`: diccionario plano `area.clave` en ES y EN, `t(lang, key, vars)` (reemplaza `{nombre}`), `wantedLang(param, uiLang)`. Una clave faltante en un idioma no compila (`Record<MessageKey, string>`).
- `src/lib/i18n-context.tsx`: `LangProvider`. `src/lib/use-lang.ts`: `useLang()` devuelve `{ lang, setLang, tr }`.
- Los componentes no escriben copy a mano: `tr('clave')`. La navegación (`config/nav.ts`) guarda claves, no textos.
- `src/lib/i18n.test.ts` verifica paridad de claves, marcadores `{x}` y que la navegación esté en los dos idiomas. `src/pages/i18n-render.test.tsx` renderiza las páginas del shell en ambos y busca claves crudas.

## Contenido vs interfaz

El selector cambia la interfaz y elige qué versión de un doc o native se muestra:

- Con traducción ES disponible y el selector en ES: se ve la traducción, con su aviso (automática o revisada).
- `?lang=en` o `?lang=es` en la URL manda sobre el selector (sirve para compartir un enlace al original).
- Un doc escrito solo en español, con el selector en EN: se ve en español, con un aviso de que aún no tiene traducción.
- Los tags tienen etiqueta en los dos idiomas (`config/tags.ts`).

## Agregar un texto

1. Agregar la clave a `es` y a `en` en `src/lib/i18n.ts`.
2. Usar `const { tr } = useLang()` y `tr('area.clave')`.
3. `bun run test`: falla si falta en un idioma o si un marcador no coincide.

## Pendiente

- Texto del roadmap (M5): se pasa al diccionario cuando su rama se integre. El chat (M3) y el bloque de código con sandbox (M4) ya están.
- Pasada en navegador del selector (escritorio y 375 px).
