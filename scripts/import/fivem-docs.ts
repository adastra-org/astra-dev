// Conversor de `citizenfx/fivem-docs` (Hugo) al Markdown de Astra: quita shortcodes, reescribe
// enlaces a slugs propios, baja los H1 y arma título, resumen y tags. Puro: recibe el texto y un
// contexto, no toca el disco (el runner lee y escribe).
import { parse } from 'yaml'
import { plainText } from '../docs/plain.ts'
import { ImportError, type GeneratedDoc } from './types.ts'

const ORIGIN = 'https://docs.fivem.net'
const FRONTMATTER = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/
const SUMMARY_MAX = 240

export interface ConvertContext {
  /** URL original (sin barra final) → slug. Incluye los `aliases` de cada doc. */
  urlToSlug: ReadonlyMap<string, string>
  /**
   * Native por nombre canónico (`native_link` solo enlaza a los que existen). Si GTA y CFX comparten
   * nombre, gana el de GTA (el comportamiento de cliente que documentan los manuales).
   */
  natives: ReadonlyMap<string, { id: string; slug: string }>
  /** `since` que llevan los docs generados (versión de Astra Dev en que entró el import). */
  since: string
  /** Lee un archivo de `static/` (shortcode `code`). `null`: no está. */
  readStatic: (path: string) => string | null
  /** Valores de los shortcodes `rmv` y `rmv2`. */
  manifestVersions: { rmv: string; rmv2: string }
}

export const slugifySegment = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** `scripting-manual/introduction/_index.md` → URL `/docs/scripting-manual/introduction`. */
export function docUrl(relPath: string): string {
  const parts = relPath.replace(/\.md$/, '').split('/')
  if (parts[parts.length - 1] === '_index') parts.pop()
  return `/docs${parts.length ? `/${parts.join('/')}` : ''}`
}

/** Slug propio: `fivem-` + la ruta. Un `_index` toma el nombre de su carpeta. */
export function docSlug(relPath: string): string {
  const parts = relPath.replace(/\.md$/, '').split('/')
  if (parts[parts.length - 1] === '_index') parts.pop()
  return ['fivem', ...parts].map(slugifySegment).filter(Boolean).join('-')
}

/** Slug de la página de un native: `SET_VEHICLE_DOOR_OPEN` → `set-vehicle-door-open`. */
export const nativeSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/_+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Sin barra final ni query; conserva el ancla aparte. */
function splitUrl(href: string): { path: string; hash: string } {
  const i = href.indexOf('#')
  const hash = i >= 0 ? href.slice(i) : ''
  const path = (i >= 0 ? href.slice(0, i) : href)
    .replace(/\?.*$/, '')
    .replace(/\/+$/, '')
  return { path, hash }
}

/** Resuelve `./x`, `../x` y `x` contra la URL del doc, como lo haría el navegador. */
function resolveRelative(base: string, href: string): string {
  const stack = `${base}/`.split('/').filter(Boolean)
  for (const seg of href.split('/')) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') stack.pop()
    else stack.push(seg)
  }
  return `/${stack.join('/')}`
}

export interface RewriteResult {
  href: string
  /** Slug del doc enlazado, si el destino es otro doc importado. */
  slug?: string
}

export function rewriteHref(
  base: string,
  href: string,
  ctx: Pick<ConvertContext, 'urlToSlug'>,
): RewriteResult {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return { href }
  const { path, hash } = splitUrl(href)
  const abs = path.startsWith('/') ? path : resolveRelative(base, path)
  const slug = ctx.urlToSlug.get(abs)
  if (slug) return { href: `/docs/${slug}${hash}`, slug }
  return { href: `${ORIGIN}${abs}${hash}` }
}

const ALERT =
  /\{\{[<%]\s*alert([^>%]*?)\s*[>%]\}\}([\s\S]*?)\{\{[<%]\s*\/alert\s*[>%]\}\}/g
const attr = (attrs: string, key: string): string | null =>
  new RegExp(`${key}\\s*=\\s*"([^"]*)"`).exec(attrs)?.[1] ?? null

const ALERT_LABEL: Record<string, string> = {
  warning: 'Warning',
  danger: 'Warning',
  info: 'Note',
  note: 'Note',
  success: 'Note',
}

function alertToQuote(attrs: string, inner: string): string {
  const kind = (
    attr(attrs, 'color') ??
    attr(attrs, 'theme') ??
    'info'
  ).toLowerCase()
  const label = attr(attrs, 'title') ?? ALERT_LABEL[kind] ?? 'Note'
  const lines = inner.trim().split('\n')
  return `\n> **${label}**\n>\n${lines.map((l) => `> ${l}`.trimEnd()).join('\n')}\n`
}

/**
 * Convierte shortcodes y enlaces fuera de los bloques de código (dentro solo se sustituyen `rmv` y
 * los shortcodes escapados). Devuelve el cuerpo y lo que encontró, para el grafo.
 */
export function convertBody(
  body: string,
  relPath: string,
  ctx: ConvertContext,
  warn: (msg: string) => void = () => {},
): { body: string; nativeRefs: string[]; links: string[] } {
  const base = docUrl(relPath)
  const nativeRefs = new Set<string>()
  const links = new Set<string>()
  let text = body.replace(/\r\n/g, '\n')

  // Shortcodes escapados (`{{%/* x */%}}`): se muestran literales. Se protegen antes de convertir.
  const literals: string[] = []
  text = text.replace(
    /\{\{([<%])\/\*([\s\S]*?)\*\/([>%])\}\}/g,
    (_m, a, inner, b) => {
      literals.push(`{{${a}${inner}${b}}}`)
      return `L${literals.length - 1}`
    },
  )

  text = text
    .replace(ALERT, (_m, attrs: string, inner: string) =>
      alertToQuote(attrs, inner),
    )
    .replace(
      /\{\{[<%]\s*native_link\s+"([^"]+)"\s*[>%]\}\}/g,
      (_m, n: string) => {
        const native = ctx.natives.get(n)
        if (!native) return `\`${n}\``
        nativeRefs.add(native.id)
        return `[\`${n}\`](/natives/${native.slug})`
      },
    )
    .replace(/\{\{[<%]\s*\/?(?:article-nav|steps)\s*[>%]\}\}/g, '')
    .replace(
      /\{\{[<%]\s*forum_topic\s+"(\d+)"\s*[>%]\}\}/g,
      (_m, id: string) => `[Forum topic ${id}](https://forum.cfx.re/t/${id})`,
    )
    .replace(
      /\{\{[<%]\s*youtube\s+id="([^"]+)"\s*[>%]\}\}/g,
      (_m, id: string) => `[Video: youtu.be/${id}](https://youtu.be/${id})`,
    )
    .replace(
      /\{\{[<%]\s*video\s+src="([^"]+)"\s*[>%]\}\}/g,
      (_m, src: string) => `[Video](${src})`,
    )
    .replace(/\{\{[<%]\s*rmv2\s*[>%]\}\}/g, ctx.manifestVersions.rmv2)
    .replace(/\{\{[<%]\s*rmv\s*[>%]\}\}/g, ctx.manifestVersions.rmv)
    .replace(
      /\{\{[<%]\s*events\s+"([^"]+)"\s*[>%]\}\}/g,
      (_m, kind: string) => {
        const slug = ctx.urlToSlug.get(
          `/docs/scripting-reference/events/${kind}-events`,
        )
        if (!slug) return ''
        links.add(slug)
        return `See the [${kind} events](/docs/${slug}).`
      },
    )
    .replace(/\{\{[<%]\s*code\s+([^>%]*?)\s*[>%]\}\}/g, (_m, attrs: string) => {
      const file = attr(attrs, 'file') ?? ''
      const lang = attr(attrs, 'language') ?? ''
      const content = ctx.readStatic(file.replace(/^\/?static\//, ''))
      if (content === null) {
        warn(`${relPath}: shortcode code sin archivo (${file})`)
        return `[${file}](https://github.com/citizenfx/fivem-docs/blob/master${file})`
      }
      return `\`\`\`${lang}\n${content.replace(/\n+$/, '')}\n\`\`\``
    })

  // Cualquier shortcode que quede es uno que no conocemos: se avisa y se quita.
  text = text.replace(/\{\{[<%][\s\S]*?[>%]\}\}/g, (m) => {
    warn(`${relPath}: shortcode desconocido ${m.slice(0, 40)}`)
    return ''
  })

  // Enlaces e imágenes, línea por línea, fuera de los bloques de código y de los `código`.
  let fence = false
  text = text
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fence = !fence
        return line
      }
      if (fence) return line
      // Un H1 se baja a H2: el título sale del frontmatter.
      line = line.replace(/^#(?!#)\s+/, '## ')
      return line
        .split(/(`[^`]*`)/)
        .map((chunk, i) =>
          i % 2
            ? chunk
            : chunk.replace(
                /(!?\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g,
                (_m, pre: string, href: string, post: string) => {
                  const r = rewriteHref(base, href, ctx)
                  if (r.slug) links.add(r.slug)
                  return `${pre}${r.href}${post}`
                },
              ),
        )
        .join('')
    })
    .join('\n')

  text = text.replace(/L(\d+)/g, (_m, i: string) => literals[Number(i)] ?? '')
  return {
    body: `${text.replace(/\n{3,}/g, '\n\n').trim()}\n`,
    nativeRefs: [...nativeRefs].sort(),
    links: [...links].sort(),
  }
}

/** Texto plano de la primera frase útil, para el `summary` cuando la fuente no trae `description`. */
export function firstParagraph(body: string): string {
  let fence = false
  const paras: string[] = []
  let cur: string[] = []
  const flush = () => {
    if (cur.length) paras.push(cur.join(' '))
    cur = []
  }
  for (const line of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence
      flush()
      continue
    }
    if (fence) continue
    if (!line.trim()) flush()
    else if (/^(#|>|\||[-*+]\s|\d+\.\s|<)/.test(line.trim())) flush()
    else cur.push(line.trim())
  }
  flush()
  const text = plainText(paras[0] ?? '')
  return text.length > SUMMARY_MAX
    ? `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…`
    : text
}

/** Convierte un doc de fivem-docs. `relPath` es relativo a `content/docs`. */
export function convertDoc(
  relPath: string,
  raw: string,
  ctx: ConvertContext,
  warn: (msg: string) => void = () => {},
): GeneratedDoc {
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const fm = FRONTMATTER.exec(text)
  let data: Record<string, unknown> = {}
  if (fm) {
    try {
      const parsed: unknown = parse(fm[1] ?? '')
      if (parsed && typeof parsed === 'object')
        data = parsed as Record<string, unknown>
    } catch (e) {
      throw new ImportError(relPath, `frontmatter YAML inválido: ${String(e)}`)
    }
  }
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  if (!title) throw new ImportError(relPath, 'falta `title` en el frontmatter')
  const converted = convertBody(
    fm ? text.slice(fm[0].length) : text,
    relPath,
    ctx,
    warn,
  )
  const section = relPath.split('/')[0]?.replace(/\.md$/, '') ?? ''
  const desc =
    typeof data.description === 'string' ? plainText(data.description) : ''
  const summary = desc || firstParagraph(converted.body) || title
  return {
    slug: docSlug(relPath),
    title,
    summary,
    tags: [slugifySegment(section) || 'fivem-docs', 'fivem-docs'].filter(
      (t, i, a) => a.indexOf(t) === i,
    ),
    since: ctx.since,
    lang: 'en',
    body: converted.body,
    nativeRefs: converted.nativeRefs,
    links: converted.links,
    url: docUrl(relPath),
    upstream: { source: 'fivem-docs', path: `content/docs/${relPath}` },
  }
}
