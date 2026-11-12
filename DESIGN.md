# Design

Extends the WeFaber house design (`~/.claude/standards/DESIGN.md`) and the Ad Astra site design
(`adastra-org/adastra-site` `DESIGN.md`). Brand source of truth: the **Ad Astra** design system. This file lists only
what Astra Dev adds or narrows. Anything not here follows those two files.

Context: product UI, read-heavy tool for the Ad Astra dev team (not broadcast). Theme: **Void** (dark).

## Deviations from the house and from adastra-site

| Rule                                      | Here                                                                      | Why                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Rioplatense Spanish ("Tocá")              | Neutral Spanish with **tú** ("Revisa", "Abre")                            | Same as adastra-site: LATAM + EU team, easy to translate (EN: M2)  |
| Dawn (light) theme exists in `tokens.css` | Not shipped. Dark only, `color-scheme: dark`                              | Docs are read for long stretches by the team; one theme to verify  |
| Orb / Ether as living element             | None in M0. When Ask Ether lands (M3) it is the only moving element       | "Un solo brillo"                                                   |
| Components `aa-*` (DS CSS classes)        | Not ported. Tailwind utilities over role tokens, one React component each | Fewer moving parts; the DS classes are not needed for a docs shell |

## Tokens

- `design/tokens.json` is a **copy** of the one in `adastra-site` (which copies the DS). Never edit it here: change it
  in the DS, copy it, then `bun run tokens` writes `src/styles/tokens.css`. Never edit `tokens.css` by hand.
- Motion durations (`--duration-fast` 120 ms, `--duration-panel` 180 ms, `--duration-reflow` 240 ms) are the house scale and
  live in `src/styles/theme.css`; they are not in the DS `tokens.json`.
- `src/lib/tokens.ts` + `tokens.test.ts` are copied from adastra-site: every text pair is checked at 4.5:1 and every
  control/focus pair at 3:1, in both themes.
- Components use **roles** through Tailwind (`bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `text-ink`,
  `text-ink-muted`, `text-ink-subtle`, `text-accent`, `border-border`, `border-border-strong`, `text-success`…), never
  hex and never brand colors (`vibrant`, `pink`, `primary-dark`). The one exception is `bg-brand-dark/70` for any
  scrim (behind the mobile drawer and behind the command palette). `public/favicon.svg` is an asset and carries hex values.
- Opacity modifiers on role tokens are allowed only for scrims.

## Type

Same families and utilities as adastra-site, self-hosted with `@fontsource`: Unbounded (headings), Geologica (text),
Space Mono (code, data). Averia Serif Libre is loaded but not used in the shell.

| Use                          | Utility                                  |
| ---------------------------- | ---------------------------------------- |
| Page title                   | `text-h1` (once per page)                |
| Section title inside a doc   | `text-h3`                                |
| Card title                   | `text-h4`                                |
| Page lead (summary line)     | `text-body-lg text-ink-muted`            |
| Body                         | `text-body`                              |
| Dense table / secondary text | `text-body-sm`                           |
| Buttons, nav, summary labels | `text-label`                             |
| Code (blocks and inline)     | `text-code` (Space Mono)                 |
| Short data, versions, tags   | `text-data` (Space Mono, uppercase tags) |

## Shell

```
lg and up                         under lg (375 to 1023 px)
+---------+-----------------+     +-----------------------+
| sidebar | (crumbs) (find) |     | (=) (... / page) (q) ES |
| 16 rem  |  floating pills |     |  floating pills       |
| sticky  | content         |     | content               |
|         |  max-w-5xl      |     | (sidebar = drawer)    |
+---------+-----------------+     +-----------------------+
```

- **Sidebar**: brand, four destinations (`config/nav.ts` is the only source), version at the bottom (separated by
  space, no top border). The selected item (destination or nested doc) is marked with a `surface-raised` fill and `ink`
  text; never a left bar or any single-side border. Sticky full height
  on `lg+`. Under `lg` it is a drawer over the content with a scrim; it never pushes the content. Esc, the scrim, the
  close button and any navigation close it. Closed, it is `visibility: hidden`, so it is out of the tab order.
- **Top bar = floating pills**, not a bar. The header itself has no fill, no border and no shadow; it is separated from
  the content by space only (and the sidebar brand row has no bottom border either). Each control is its own pill
  (`rounded-pill`, `surface-raised` fill, no border): menu button (under `lg`), breadcrumbs, search trigger, language
  switch. Hover and active are fills (`surface-overlay`, `accent-fill`), never a border, underline or side stripe. The
  header is sticky and `pointer-events-none`; only the pills take clicks, and because every pill is opaque, content that
  scrolls under the gaps stays readable. Pills are 44 px under `lg`, 40 px from `lg`.
- **Breadcrumbs** (`nav aria-label="Migas de pan"`, `src/lib/crumbs.ts`): Inicio / section / document, built from the
  route. The last crumb is the current page (`aria-current="page"`), not a link, one line with an ellipsis. Under `md`
  they collapse to "… / current", where "…" links to the parent (`aria-label="Subir a …"`). A route that does not exist
  ends in "Página no encontrada".
- **Language switch** (placeholder until M2): segmented ES / EN. ES is pressed, EN is disabled with a title. Copy
  is Spanish only. No state is stored.
- **Content**: centered, `max-w-5xl`; reading text caps at `max-w-prose` (65 ch). Wide elements (tables, graphs, code)
  may use the full width, per house "X first, then Y".
- **Skip link** to `#main` is the first tab stop. Route changes restore scroll (`ScrollRestoration`) and update
  `document.title` as `Page · Astra Dev`.
- Touch targets are 44 px under `lg` and 32 to 40 px from `lg` up.
- Motion: drawer, section open/close and chevron 180 ms (`--duration-panel`), card arrow. Nothing loops. `prefers-reduced-motion` removes the
  transitions.

## Command palette

`Ctrl+K` / `Cmd+K`, public, no AI. Behavior, shortcut rules and how to add a provider: `docs/cmdk/README.md`.

- A native `<dialog>` (focus trap, inert page, Esc) with the combobox + listbox pattern. The panel is the only bordered
  level (1 px `border`, `surface-raised`, `shadow-card`); nothing inside has a border. The selected option is a
  `surface-overlay` fill with `ink` text and an `accent` icon, never a side stripe. Key caps and tag chips are fills.
- Opens from the top bar button (search icon under `md`, field + key caps from `md`) and from the shortcut. Key caps are
  hidden on touch (`pointer-fine`). Options, close button and trigger are 44 px under `lg`.
- Esc closes the topmost layer only: with the palette over the mobile drawer, the first Esc closes the palette.
- Motion: the panel and backdrop enter in `--duration-panel` with `--ease-out-brand`, only without `prefers-reduced-motion`.
- Copy: empty state says what to try ("Prueba con otro término"), no exclamation marks. Exception to the house
  "empty = dashed box": no box, because the panel is already the one bordered level.

## Ask Ether panel

Detalle y archivos en `docs/ask/README.md`. Es el único elemento con movimiento ("un solo brillo"): el icono pulsa solo mientras se busca, sin bucles el resto del tiempo y nada con `prefers-reduced-motion`.

- Panel anclado a la derecha sobre el contenido (house: el detalle va en un panel acoplado, no en una página nueva): `<dialog>` modal, un borde (el panel), a 375 px ocupa el ancho menos 16 px. Esc, el fondo y el botón cierran; la conversación **no** se pierde al cerrar ni se corta la respuesta en curso.
- Pregunta del usuario: relleno `surface-overlay` alineado a la derecha. Respuesta: texto sobre el panel, sin burbuja. Citas `[n]` = fichas de relleno (`surface-sunken`) que enlazan a la página; la lista "Fuentes" bajo la respuesta usa filas de 44 px. Ningún bloque lleva borde propio (el código usa `CodeBlock bare`).
- Error: caja `danger-surface` con icono + texto (nunca solo color), qué pasó, qué hacer y "Reintentar" cuando tiene sentido. Aviso de acceso: caja `surface-sunken` con candado.
- Envío con Intro, salto de línea con Mayús + Intro; el botón de enviar nunca se deshabilita (con la caja vacía devuelve el foco al campo) y se vuelve "Detener" mientras responde.
- Copy: español neutro con tú, sin exclamaciones; dice qué se envía al modelo y qué guarda el server.

## Docs reading layout

The reader is a developer in the middle of a task, possibly with ADHD. A doc page is built so the first screen already
answers "is this the one" and the rest can wait.

1. **Eyebrow + title + lead.** The lead is one or two lines: what it is and when to use it (`PageHeader`).
2. **Resumen box** (`Summary`): what it does, the parameters that matter, the most common mistake. Full 1 px `border-accent` (never a side stripe),
   `surface-raised`. Always before any section.
3. **Ejemplo mínimo** (`CodeBlock`): the smallest working snippet, before the explanation.
4. **Detalle**, in collapsible sections (`Collapsible`, native `details`): Parámetros, Notas de Astra, Relacionados.
   Closed by default; the summary row is the whole target (44 px). Open only what the page needs at first glance.
5. Long pages keep the sidebar sticky and get a back-to-top button. From `xl` the table of contents is a sticky right
   column; below it is a one-row strip of chips above the content that scrolls sideways. The table of contents has a
   fixed structure: opening a section never adds rows or moves it, it only changes the fill and color of the active
   item. It is never a dropdown that grows and pushes the content.
6. After the sections: Relacionados, Usada por (backlinks) and Historial de cambios (collapsed).

Density rules: one idea per paragraph, no paragraph over five lines, lists over prose for parameters, no more than
three levels of heading, tables only for data that compares. Never use color alone to mark a state (icon + text).

## Surfaces and text (explicit rules)

The house rules (`~/.claude/standards/DESIGN.md`, "Surfaces and text") that this project already broke once, written
here so they are checked in review. The Ad Astra DS README does not state them; the house file is the source.

- **No single-side borders.** No left or top stripe on a selected item, callout, card or the version block. Selection =
  fill + text color. A callout = full 1 px border in the role color (`Summary` uses `border-accent`). Separate groups
  with space.
- **One border per visible level.** A container inside a bordered container has no border: it is told apart by fill and
  space. In practice `Collapsible`, `Summary` and tables are the frame; code blocks, inline `code`, `pre.code-plain`
  and tag chips inside them lose their border (`prose.css`, "Un borde por nivel visible"). Tag chips are always a fill,
  never a border. The `CodeBlock` header is not divided from the code by a border.
- **Wrapping.** Prose moves a whole word to the next line: `hyphens: manual`, `overflow-wrap: normal`, no `break-all` or
  `word-break`. Inline `code`, chips and slugs are `white-space: nowrap`. Only an inline token over 36 characters
  without spaces (`code-long`, set by the build) may break, as a last resort. Paragraphs use `text-wrap: pretty`;
  headings `balance`. `overflow-wrap: anywhere` is allowed only for user-supplied tokens (the 404 slug) and `code-long`.
- **Justified prose.** `.doc-prose p` is `text-align: justify` from `md` (768 px) up, with the right `lang` (the `<article>`
  carries the doc's `lang`). Under `md` the column is about 38 characters and justifying opens gaps, so it is
  `start`. Not justified: tables, lists, code, headings, the Resumen box.
- **Expandable sections animate.** `Collapsible` (`details`) animates height and opacity on open and on close with
  `::details-content` and `interpolate-size`, using `--duration-panel` (180 ms) and `--ease-out-brand`; the chevron uses
  the same duration. Browsers without `::details-content` open instantly. `prefers-reduced-motion` removes the animation.
  A hash link that opens a section re-aligns the scroll once the animation ends (`reveal.ts`).

## Code blocks

`CodeBlock`: a figure with a header row and a `pre`.

- Surface `surface-sunken`, 1 px `border` (none when it sits inside a bordered container), radius `rounded-md`. The
  header is not divided from the code by a border.
- Header: language label in `text-data` uppercase `ink-subtle` on the left; **Copiar** button on the right
  (icon + text). On success the label changes to "Copiado", the icon to a check, and a `role="status"` region
  announces it. Resets after 1.5 s.
- Body: `text-code`, `ink`, horizontal scroll (`overflow-x: auto`), never wrapped, `tabindex="0"` so keyboard users can
  scroll it. Inline `code` in docs uses the same font on `surface-sunken` with a 1 px `border`.
- Syntax highlighting (M1, build-time with shiki) uses theme colors taken from tokens: `--code-token-*` in
  `src/styles/prose.css` map to roles (`accent`, `success`, `warning`, `info`, `ink-muted`, `ink-subtle`), and
  `code-colors.test.ts` measures each at 4.5:1 on `surface-sunken`. No third-party theme palette.
- The M4 "Ejecutar" button goes in the header next to Copiar; the output panel opens below the `pre`.

## Placeholders

A section that does not exist yet shows `Placeholder`: dashed `border-strong` box, a `text-data` tag with the milestone
(M1, M4, M5) and one sentence saying what will be there. Never a blank box and never fake data.

## Copy

Neutral Spanish, tú, no exclamation marks, no emojis, no hype. Sentence-case titles. Technical terms (native, resource,
event) stay in English; the surrounding sentence is Spanish. Every string lives in the dictionary (`src/lib/i18n.ts`,
ES and EN, same keys); components call `tr('area.clave')`, never inline copy. English is plain and literal, same rules
(no exclamation marks, no hype). The language switch is two pills (ES / EN) with `aria-pressed`; the choice persists.
`?lang=en|es` overrides it for a shared link.

## Done checklist additions

- [ ] Works at 375 px: no horizontal scroll on the page (code blocks scroll inside themselves).
- [ ] Drawer: Esc, scrim and navigation close it; closed it is not focusable.
- [ ] No single-side borders and no box inside a box (see "Surfaces and text").
- [ ] Nothing wraps mid-token; page has no horizontal scroll at 375 px even with every section open.
- [ ] New doc-style page has lead, Resumen, Ejemplo mínimo first, and collapsible detail.
- [ ] Tokens only. `bun run tokens` produces no diff.
- [ ] `bun run check` is green.
