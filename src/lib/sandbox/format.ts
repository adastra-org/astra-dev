// Formateo con StyLua (WASM). La sintaxis es `CfxLua`: Lua 5.4 más las extensiones de FiveM
// (hashes con backtick, `+=`, `<<`...), así que no rechaza lo que se escribe en un resource.
import type { Diagnostic } from './lint.ts'

/** Lo que usamos de `@johnnymorganz/stylua`; las builds web y node lo cumplen. */
export interface Stylua {
  Config: {
    new (): {
      syntax: number
      indent_type: number
      indent_width: number
      column_width: number
      quote_style: number
      call_parentheses: number
    }
  } & { new: () => StyluaConfig }
  formatCode(
    code: string,
    config: StyluaConfig,
    range: undefined,
    verify: number,
  ): string
  LuaVersion: { CfxLua: number }
  IndentType: { Spaces: number }
  QuoteStyle: { AutoPreferDouble: number }
  OutputVerification: { Full: number }
}

interface StyluaConfig {
  syntax: number
  indent_type: number
  indent_width: number
  column_width: number
  quote_style: number
}

export type FormatResult =
  | { ok: true; code: string }
  | { ok: false; diagnostic: Diagnostic }

/**
 * StyLua responde "error parsing:" y una lista de líneas "- mensaje (2:7 to 2:8), ...". Se toma
 * el primer punto: línea y columna del primer problema y su descripción.
 */
export function parseFormatError(raw: string): Diagnostic {
  const first =
    raw.split('\n').find((l) => l.trimStart().startsWith('- ')) ?? raw
  const m = /\((\d+):(\d+) to \d+:\d+\)/.exec(first)
  const message = first
    .replace(/^\s*-\s*/, '')
    .replace(/\s*\(\d+:\d+ to \d+:\d+\)/, '')
    .replace(/^error parsing:\s*/i, '')
    .trim()
  return {
    severity: 'error',
    line: m ? Number(m[1]) : 1,
    column: m ? Number(m[2]) : 1,
    message: message.slice(0, 300) || 'No se pudo formatear',
  }
}

export function formatLua(code: string, stylua: Stylua): FormatResult {
  const config = stylua.Config.new()
  config.syntax = stylua.LuaVersion.CfxLua
  config.indent_type = stylua.IndentType.Spaces
  config.indent_width = 2
  config.column_width = 80
  config.quote_style = stylua.QuoteStyle.AutoPreferDouble
  try {
    // `Full` vuelve a parsear la salida: si el formateo cambiara el programa, falla en vez de
    // devolver código distinto.
    const out = stylua.formatCode(
      code,
      config,
      undefined,
      stylua.OutputVerification.Full,
    )
    return { ok: true, code: out }
  } catch (e) {
    return { ok: false, diagnostic: parseFormatError(String(e)) }
  }
}
