# Command palette (Ctrl+K, v0.3.0)

Búsqueda y navegación rápida desde cualquier página. Es pública: no hay sesión ni IA en este milestone. Las funciones de IA (Preguntar a Ether, Code Mode) se enchufan después por el registro de proveedores (abajo).

## Uso

| Acción         | Cómo                                                            |
| -------------- | --------------------------------------------------------------- |
| Abrir o cerrar | `Ctrl+K` (`Cmd+K` en macOS) o el botón **Buscar** de la barra   |
| Cerrar         | `Esc`, el botón de cerrar, un clic en el fondo o el mismo atajo |
| Moverse        | `↑` `↓` (da la vuelta), `Inicio` y `Fin` (primero y último)     |
| Elegir         | `Enter` o clic. El ratón resalta al pasar por encima            |
| Ver recientes  | Abrir sin escribir: las últimas 5 selecciones                   |

Qué muestra, en este orden:

1. **Recientes**: solo con el campo vacío. Se guardan en `localStorage` (`astra-dev:palette:recent`, 5 como máximo, sin duplicar por ruta). Si el almacenamiento falla o falta, el palette sigue funcionando sin recientes.
2. **En esta página**: los encabezados del documento abierto (`TocItem`), publicados por `Doc.tsx` con `usePublishHeadings`. Elegir uno cambia el hash, así el reveal abre la sección plegada.
3. **Ir a**: Inicio, Documentación, Herramientas y Roadmap, tomados de `config/nav.ts`. También se encuentran por sinónimo ("hoja de ruta" lleva al Roadmap; los sinónimos están en `providers.ts`).
4. **Documentación**: docs por título, resumen y tags (hasta 8), con chips de los tags que coinciden. Solo aparece al escribir.

Sin resultados: el mensaje "Sin resultados para «…»" con una pista.

## Ranking

`rankDocs` y `scoreMatch` en `src/lib/docs-query.ts`. Sin tildes ni mayúsculas, y todas las palabras deben aparecer en algún campo. Orden:

1. Título que empieza con la consulta.
2. Título que la contiene (o contiene todas las palabras).
3. Tag (slug o etiqueta visible).
4. Resumen.

Dentro de cada nivel gana el título más corto; después, orden alfabético. Está probado en `docs-query.test.ts`.

## Regla del atajo

Definida y probada en `src/lib/palette/shortcut.ts`:

- Alterna el palette desde cualquier página y también desde un `<input>` de una línea (ahí `Ctrl+K` no tiene función propia) y desde el propio campo del palette.
- **No se intercepta** en `<textarea>`, en elementos editables (`contenteditable`: `Ctrl+K` inserta un enlace en los editores de texto enriquecido) ni dentro de un ancestro con `data-palette-ignore` (el editor de código del sandbox, M4, debe llevarlo).
- **No se intercepta** con `Alt` o `Shift`, con la tecla mantenida, durante una composición IME ni si otro manejador ya hizo `preventDefault`.
- En macOS solo `Cmd+K`: `Ctrl+K` es "borrar hasta fin de línea" en los campos de texto.

`Home` y `End` dentro del campo mueven la selección de resultados, no el cursor de texto. Es una decisión deliberada para que el teclado alcance los extremos de la lista.

## Accesibilidad

- `<dialog>` nativo con `showModal()`: foco atrapado, página de fondo inerte, `Esc` cierra y el navegador devuelve el foco a quien abrió el palette. Tras elegir un destino el foco pasa a `#main`.
- Patrón combobox + listbox: el campo es `role="combobox"` con `aria-controls` y `aria-activedescendant`; la lista es `role="listbox"` con grupos (`role="group"` + encabezado) y opciones `role="option"` con `aria-selected`. El foco nunca sale del campo.
- Un `role="status"` anuncia "N resultados" o "Sin resultados", con 300 ms de retraso para no hablar en cada tecla.
- Objetivos de 44 px (opciones de 44 px o más, botón de cerrar y botón de la barra). A 375 px el panel ocupa el ancho menos 16 px de margen por lado; el atajo y la barra de ayuda se ocultan en pantallas táctiles (`pointer-fine`) y queda la lupa.
- `prefers-reduced-motion: reduce` quita la animación de entrada (`src/styles/palette.css`).
- Solo tokens del DS, un borde por nivel (el panel; nada dentro lleva borde) y la selección es relleno, nunca una barra lateral.

## Cómo agregar un proveedor

Un proveedor aporta un grupo de resultados. Se registra con `registerPaletteProvider` (`src/lib/palette/registry.ts`) y devuelve la función que lo quita.

```ts
import { registerPaletteProvider } from '@/lib/palette/registry'

registerPaletteProvider({
  id: 'ask-ether',
  label: 'Preguntar a Ether',
  order: 50, // menor primero; los públicos usan 10 a 40
  permission: 'subscriber', // 'public' | 'subscriber' | 'staff'
  async search(query, ctx, signal) {
    if (!query.trim()) return []
    const answer = await ask(query, { signal })
    return [
      {
        id: 'ask:1',
        title: answer.title,
        icon: 'sparkles',
        run: () => open(answer),
      },
    ]
  },
})
```

- **Permisos**: cada nivel incluye al anterior (`staff` ve lo de `subscriber`, que ve lo público). El registro **no invoca** a un proveedor que el nivel actual no permite: su código ni corre. El nivel actual es `getPaletteAccess()` (hoy siempre `public`); cuando exista sesión, quien autentique llama a `setPaletteAccess`. Probado con proveedores falsos en `registry.test.ts`.
- **Asincronía**: `search` puede devolver una promesa; la lista se actualiza cuando llega y el resto de los grupos no espera. Debe respetar `signal`, que se aborta al cambiar la consulta. Un proveedor que lanza o rechaza aporta cero ítems sin afectar a los demás.
- **Ítems**: `to` navega dentro de la app (y se guarda en recientes); `run` ejecuta una acción (no se guarda). `tags` muestra chips. El registro estampa el `permission` del proveedor en cada ítem y los recientes lo respetan.
- **Iconos**: el campo `icon` es una clave de `PaletteIcon` (`types.ts`); el componente la traduce a lucide-react. Un icono nuevo se agrega ahí y en `CommandPalette.tsx`.
- Los proveedores de IA no se registran en `registerPublicProviders`: van en su propio módulo, cargado solo cuando el usuario tenga el nivel.

## Búsqueda semántica (pendiente, M3)

El palette ya está preparado para sumarla; no se implementó acá porque necesita embeddings y un server (M3: índice con WeKit `embed_text`, regenerado en build, y una consulta a ese índice). Hoy la búsqueda es léxica: sin tildes ni mayúsculas, pero no entiende "la nativa para dibujar una UI".

Cómo se enchufa, sin tocar el componente:

1. Un proveedor `semantic` con `order` 45 (justo después de Documentación) que consulta el índice y devuelve ítems con `id: 'doc:<slug>'` y `to: '/docs/<slug>'`.
2. `buildSections` descarta los ítems cuyo `id` ya apareció en una sección anterior, así un doc que encuentran ambos proveedores se muestra una sola vez, en la sección léxica.
3. `search` es asíncrono y respeta `signal`: los resultados léxicos aparecen al instante y los semánticos llegan después, sin bloquear la lista. Conviene un retraso de unos 200 ms antes de consultar, para no pedir un embedding por tecla.
4. Permiso: `public` (decidido por Faku, 2026-11-10). El embedding tiene costo de server, así que M3 debe traer rate limit y caché por IP; si más adelante se restringe, basta cambiar `permission` del proveedor.

## Archivos

| Archivo                                     | Qué hace                                          |
| ------------------------------------------- | ------------------------------------------------- |
| `src/lib/docs-query.ts`                     | `scoreMatch`, `rankDocs`                          |
| `src/lib/palette/types.ts`                  | Tipos: ítem, contexto, proveedor, permisos        |
| `src/lib/palette/registry.ts`               | Registro, control de acceso, ejecución, secciones |
| `src/lib/palette/providers.ts`              | Proveedores públicos                              |
| `src/lib/palette/shortcut.ts`               | Regla del atajo                                   |
| `src/lib/palette/recent.ts`                 | Recientes en `localStorage`                       |
| `src/lib/palette/headings.ts`               | Encabezados del doc abierto                       |
| `src/components/palette/CommandPalette.tsx` | Modal, combobox, lista                            |
| `src/components/palette/PaletteTrigger.tsx` | Botón de la barra superior                        |

## Decisión: componentes propios, no `@wefaber/ui`

Se evaluó `@wefaber/ui` (`Dialog`, `Kbd`) y no se usa:

- Está escrito sobre `@wefaber/tokens` (clases `bg-bg`, `text-text`, `bg-surface-2`, `rounded-panel`, `shadow-float`, `animate-pop-in`), que este repo no tiene: usa los roles del DS de Ad Astra. Habría que agregar la dependencia y un tema entero para un diálogo.
- `Dialog` pinta borde, encabezado con título y botón de cierre propios, y `Kbd` lleva borde: chocan con "un borde por nivel" y con el patrón combobox (el campo de búsqueda es el encabezado).
- Se publica como fuente TypeScript (`src/*.ts`), que el build tendría que transpilar.

Lo que sí se tomó: el enfoque de `<dialog>` nativo para foco, inertización y `Esc`.
