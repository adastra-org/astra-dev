// Native → Markdown → secciones. La página de un native usa el mismo motor que un doc: se arma un
// Markdown (firma, ejemplo, notas de Astra, descripción, parámetros…) y `renderMarkdown` lo
// convierte en las `Section` que ya pinta `DocSection`. Todo en build.
import type { Highlight } from '../docs/highlight.ts'
import { renderMarkdown } from '../docs/markdown.ts'
import { clip, plainText } from '../docs/plain.ts'
import type { Native } from '../import/types.ts'
import type { NativeText, NativeTranslation } from '../translate/store.ts'
import type {
  NativeContent,
  NativeRow,
  NativeVariant,
} from '../../src/lib/natives/types.ts'
import { groupIdOf, originUrl, type Manifest } from './corpus.ts'

export const SUMMARY_MAX = 200
/** El índice lleva un resumen más corto: es una línea de lista, no la página. */
export const ROW_SUMMARY_MAX = 96

/** Texto traducible de un native tal como está en la fuente. */
export function nativeText(n: Native): NativeText {
  return {
    description: n.description,
    returns: n.returns,
    params: Object.fromEntries(n.params.map((p) => [p.name, p.description])),
  }
}

/** Baja a `###` los encabezados `#`/`##` de un texto ajeno: la estructura de la página es nuestra. */
export function demoteHeadings(md: string): string {
  let fence = false
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence
      return !fence && /^#{1,2}\s/.test(line)
        ? line.replace(/^#{1,2}/, '###')
        : line
    })
    .join('\n')
}

/** Primer párrafo en texto plano, sin el `>` de las citas de aviso. */
export function summaryOf(description: string, max = SUMMARY_MAX): string {
  const para =
    description
      .trim()
      .replace(/^[ \t]*>[ \t]?/gm, '')
      .split(/\n\s*\n/)[0] ?? ''
  return clip(plainText(para), max)
}

/** `[X](#_0xHASH)` → `/natives/<slug>`; si el hash no está en el corpus queda el texto sin enlace. */
export function linkNatives(
  md: string,
  hashToSlug: ReadonlyMap<string, string>,
): string {
  return md.replace(
    /\[([^\]]+)\]\(#_?(0x[0-9a-fA-F]+)\)/g,
    (_m, text: string, hash: string) => {
      const slug = hashToSlug.get(hash.toUpperCase().replace(/^0X/, '0x'))
      return slug ? `[${text}](/natives/${slug})` : text
    },
  )
}

const cell = (s: string) =>
  s
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()

const code = (s: string) => `\`${s.replace(/`/g, "'")}\``

/** Markdown de la página. `text` es el idioma a mostrar (inglés, o la traducción). */
export function nativeMarkdown(
  n: Native,
  text: NativeText,
  hashToSlug: ReadonlyMap<string, string>,
): string {
  const link = (s: string) => linkNatives(demoteHeadings(s), hashToSlug)
  const out: string[] = ['```', n.signature, '```']
  const section = (title: string, body: string) => {
    if (body.trim()) out.push(`\n## ${title}\n\n${body.trim()}`)
  }

  section('Ejemplo mínimo', n.examples)
  section('Notas de Astra', link(n.astraNotes))

  const summary = summaryOf(text.description)
  const desc = text.description.trim()
  // Un párrafo sin formato que ya es el Resumen no se repite.
  const same = desc === summary && !/[\n[`*]/.test(desc)
  if (!same) section('Descripción', link(desc))

  if (n.params.length) {
    const rows = n.params.map(
      (p) =>
        `| ${code(p.name)} | ${code(p.type)} | ${cell(link(text.params[p.name] ?? p.description))} |`,
    )
    section(
      'Parámetros',
      ['| Nombre | Tipo | Descripción |', '| --- | --- | --- |', ...rows].join(
        '\n',
      ),
    )
  }

  const hasType = n.returnType && n.returnType !== 'void'
  if (hasType || text.returns.trim())
    section(
      'Devuelve',
      [hasType ? code(n.returnType) : '', link(text.returns)]
        .filter(Boolean)
        .join('\n\n'),
    )

  for (const e of n.extra) section(plainText(e.title) || 'Notas', link(e.body))

  return `${out.join('\n')}\n`
}

export interface RenderCtx {
  hashToSlug: ReadonlyMap<string, string>
  byId: ReadonlyMap<string, Native>
  /** Slugs de docs que mencionan cada id de native. */
  mentions: ReadonlyMap<string, readonly string[]>
  manifest: Manifest
  highlight: Highlight
}

/** Hash (`0x…` en mayúsculas) → slug, para resolver los enlaces `#_0x…` de los textos. */
export function hashIndex(natives: readonly Native[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const n of natives)
    for (const h of n.hashes) {
      const key = h.toUpperCase().replace(/^0X/, '0x')
      // Si dos natives comparten un hash (alias), gana el de GTA: es el nombre canónico.
      if (!out.has(key) || n.source === 'gta') out.set(key, n.slug)
    }
  return out
}

function variant(
  n: Native,
  text: NativeText,
  ctx: RenderCtx,
  file: string,
): NativeVariant {
  const r = renderMarkdown(
    file,
    nativeMarkdown(n, text, ctx.hashToSlug),
    ctx.highlight,
  )
  return {
    summary: summaryOf(text.description),
    sections: r.sections,
    toc: r.toc,
  }
}

/** Texto en español de un native: la traducción pisa solo lo que trae. */
export function translatedText(n: Native, t: NativeTranslation): NativeText {
  return {
    description: t.description || n.description,
    returns: t.returns || n.returns,
    params: { ...nativeText(n).params, ...t.params },
  }
}

export function renderNative(
  n: Native,
  es: NativeTranslation | undefined,
  ctx: RenderCtx,
): NativeContent {
  const file = `natives/${n.slug}`
  const seen = new Set<string>()
  const seeAlso = n.seeAlso.flatMap((id) => {
    const t = ctx.byId.get(id)
    if (!t || seen.has(t.slug) || t.slug === n.slug) return []
    seen.add(t.slug)
    return [{ slug: t.slug, name: t.name, luaName: t.luaName }]
  })
  return {
    slug: n.slug,
    name: n.name,
    luaName: n.luaName,
    source: n.source,
    group: groupIdOf(n),
    ns: n.ns,
    apiset: n.apiset,
    hashes: n.hashes,
    signature: n.signature,
    seeAlso,
    mentionedIn: [...(ctx.mentions.get(n.id) ?? [])],
    originUrl: originUrl(ctx.manifest, n),
    hasAstraNotes: n.astraNotes.trim() !== '',
    variants: {
      en: variant(n, nativeText(n), ctx, file),
      ...(es ? { es: variant(n, translatedText(n, es), ctx, file) } : {}),
    },
    ...(es ? { translated: es.translated } : {}),
  }
}

/** Fila del índice de búsqueda. El resumen es el del idioma de la interfaz (ES si hay). */
export function nativeRow(
  n: Native,
  group: string,
  es: NativeTranslation | undefined,
): NativeRow {
  const text = es ? translatedText(n, es) : nativeText(n)
  return {
    slug: n.slug,
    name: n.name,
    luaName: n.luaName,
    group,
    hashes: n.hashes.map((h) => h.toUpperCase().replace(/^0X/, '0x')),
    summary: summaryOf(text.description, ROW_SUMMARY_MAX),
    ...(es ? { translated: es.translated } : {}),
  }
}
