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
- `src/lib/tokens.ts` + `tokens.test.ts` are copied from adastra-site: every text pair is checked at 4.5:1 and every
  control/focus pair at 3:1, in both themes.
- Components use **roles** through Tailwind (`bg-surface`, `bg-surface-raised`, `bg-surface-sunken`, `text-ink`,
  `text-ink-muted`, `text-ink-subtle`, `text-accent`, `border-border`, `border-border-strong`, `text-success`…), never
  hex and never brand colors (`vibrant`, `pink`, `primary-dark`). The one exception is `bg-brand-dark/70` for the
  scrim behind the mobile drawer. `public/favicon.svg` is an asset and carries hex values.
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
| sidebar | top bar         |     | menu  title      ES EN |
| 16 rem  +-----------------+     +-----------------------+
| sticky  | content         |     | content               |
|         |  max-w-5xl      |     | (sidebar = drawer)    |
+---------+-----------------+     +-----------------------+
```

- **Sidebar**: brand, four destinations (`config/nav.ts` is the only source), version at the bottom. Sticky full height
  on `lg+`. Under `lg` it is a drawer over the content with a scrim; it never pushes the content. Esc, the scrim, the
  close button and any navigation close it. Closed, it is `visibility: hidden`, so it is out of the tab order.
- **Top bar**: sticky, 56 px, solid `surface` (no glass). Left: menu button (under `lg`) and the current section.
  Right: language switch.
- **Language switch** (placeholder until M2): segmented ES / EN. ES is pressed, EN is disabled with a title. Copy
  is Spanish only. No state is stored.
- **Content**: centered, `max-w-5xl`; reading text caps at `max-w-prose` (65 ch). Wide elements (tables, graphs, code)
  may use the full width, per house "X first, then Y".
- **Skip link** to `#main` is the first tab stop. Route changes restore scroll (`ScrollRestoration`) and update
  `document.title` as `Page · Astra Dev`.
- Touch targets are 44 px under `lg` and 32 to 40 px from `lg` up.
- Motion: drawer 200 ms ease-out, chevron rotation, card arrow. Nothing loops. `prefers-reduced-motion` removes the
  transitions.

## Docs reading layout

The reader is a developer in the middle of a task, possibly with ADHD. A doc page is built so the first screen already
answers "is this the one" and the rest can wait.

1. **Eyebrow + title + lead.** The lead is one or two lines: what it is and when to use it (`PageHeader`).
2. **Resumen box** (`Summary`): what it does, the parameters that matter, the most common mistake. Accent left border,
   `surface-raised`. Always before any section.
3. **Ejemplo mínimo** (`CodeBlock`): the smallest working snippet, before the explanation.
4. **Detalle**, in collapsible sections (`Collapsible`, native `details`): Parámetros, Notas de Astra, Relacionados.
   Closed by default; the summary row is the whole target (44 px). Open only what the page needs at first glance.
5. Long pages keep the sidebar sticky and get a back-to-top button (M1, with the real doc engine).

Density rules: one idea per paragraph, no paragraph over five lines, lists over prose for parameters, no more than
three levels of heading, tables only for data that compares. Never use color alone to mark a state (icon + text).

## Code blocks

`CodeBlock`: a figure with a header row and a `pre`.

- Surface `surface-sunken`, 1 px `border`, radius `rounded-md`, header separated by a 1 px `border`.
- Header: language label in `text-data` uppercase `ink-subtle` on the left; **Copiar** button on the right
  (icon + text). On success the label changes to "Copiado", the icon to a check, and a `role="status"` region
  announces it. Resets after 1.5 s.
- Body: `text-code`, `ink`, horizontal scroll (`overflow-x: auto`), never wrapped, `tabindex="0"` so keyboard users can
  scroll it. Inline `code` (arrives with the Markdown renderer, M1) uses the same font on `surface-sunken`.
- Syntax highlighting arrives in M1 with theme colors taken from tokens (no third-party theme that brings its own
  palette). Until then the block is monochrome on purpose.
- The M4 "Ejecutar" button goes in the header next to Copiar; the output panel opens below the `pre`.

## Placeholders

A section that does not exist yet shows `Placeholder`: dashed `border-strong` box, a `text-data` tag with the milestone
(M1, M4, M5) and one sentence saying what will be there. Never a blank box and never fake data.

## Copy

Neutral Spanish, tú, no exclamation marks, no emojis, no hype. Sentence-case titles. Technical terms (native, resource,
event) stay in English; the surrounding sentence is Spanish. Strings are inline for now; M2 moves them to i18n.

## Done checklist additions

- [ ] Works at 375 px: no horizontal scroll on the page (code blocks scroll inside themselves).
- [ ] Drawer: Esc, scrim and navigation close it; closed it is not focusable.
- [ ] New doc-style page has lead, Resumen, Ejemplo mínimo first, and collapsible detail.
- [ ] Tokens only. `bun run tokens` produces no diff.
- [ ] `bun run check` is green.
