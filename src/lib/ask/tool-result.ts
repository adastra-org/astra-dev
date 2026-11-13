// `ToolResult`: the fixed shape of what a tool run returns. Four readers use the same object:
//   - the UI (card under the code: state, output, error with line, duration),
//   - the model, after `toWire` (capped, then serialized and escaped by the server),
//   - the server, which validates it field by field (`server/src/chat/tool-result.ts`),
//   - the tests.
// Same names and numbers as the server file. Documented in docs/chat/README.md (phase 2).
import type { Diagnostic } from '@/lib/sandbox/lint'
import type { RunResult } from '@/lib/sandbox/run'

export const RESULT_STATUSES = [
  'ok',
  'error',
  'limit',
  'timeout',
  'cancelled',
  'crash',
  'rejected',
] as const
export type ResultStatus = (typeof RESULT_STATUSES)[number]

export type ErrorType =
  | 'syntax'
  | 'runtime'
  | 'limit'
  | 'timeout'
  | 'crash'
  | 'rejected'

export interface ToolDiagnostic {
  severity: 'error' | 'warning'
  line: number
  column: number
  message: string
}

export interface ToolResult {
  v: 1
  tool: string
  ok: boolean
  status: ResultStatus
  stdout: string
  /** Length of the whole output before any cut. */
  stdoutChars: number
  error: { type: ErrorType; message: string; line: number | null } | null
  diagnostics: ToolDiagnostic[]
  durationMs: number
  /** Something was cut: stdout, an error message or the diagnostics. */
  truncated: boolean
}

/** What the UI keeps. The model gets less (`WIRE_CAPS`). */
export const UI_CAPS = { stdout: 8000, errorMessage: 2000, diagnostics: 50 }

/** Caps of the wire format: the server rejects anything over these. */
export const WIRE_CAPS = {
  stdout: 1200,
  errorMessage: 300,
  diagnostics: 10,
  diagnosticMessage: 140,
} as const

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s)

const emptyResult = (tool: string): ToolResult => ({
  v: 1,
  tool,
  ok: false,
  status: 'error',
  stdout: '',
  stdoutChars: 0,
  error: null,
  diagnostics: [],
  durationMs: 0,
  truncated: false,
})

/** The tool could not even start (unknown name, body too long, runtime missing). */
export function rejected(tool: string, message: string): ToolResult {
  return {
    ...emptyResult(tool),
    status: 'rejected',
    error: { type: 'rejected', message: clip(message, 300), line: null },
  }
}

// Lua syntax errors read "snippet:3: unexpected symbol near 'x'" or "... near <eof>" or
// "unfinished string". A runtime `error("... near ...")` is mislabeled; it only changes a tag.
const SYNTAX = /\bnear\b|unfinished (?:string|long)|malformed number/

/** A finished sandbox run → result. `lines` are the stdout lines the sandbox accepted. */
export function fromRun(tool: string, r: RunResult): ToolResult {
  const full = r.lines.join('\n')
  const stdout = clip(full, UI_CAPS.stdout)
  const base: ToolResult = {
    ...emptyResult(tool),
    stdout,
    stdoutChars: full.length,
    durationMs: Math.max(0, Math.round(r.ms)),
    truncated: full.length > stdout.length,
  }
  switch (r.status) {
    case 'finished': {
      const o = r.outcome
      if (o.status === 'ok') return { ...base, ok: true, status: 'ok' }
      if (o.status === 'limit')
        return {
          ...base,
          status: 'limit',
          error: { type: 'limit', message: `limit:${o.reason}`, line: null },
        }
      const message = clip(o.message, UI_CAPS.errorMessage)
      return {
        ...base,
        status: 'error',
        error: {
          type: SYNTAX.test(o.message) ? 'syntax' : 'runtime',
          message,
          line: o.line,
        },
        truncated: base.truncated || message.length < o.message.length,
      }
    }
    case 'timeout':
      return {
        ...base,
        status: 'timeout',
        error: { type: 'timeout', message: 'timeout', line: null },
      }
    case 'cancelled':
      return { ...base, status: 'cancelled' }
    case 'crash':
      return {
        ...base,
        status: 'crash',
        error: {
          type: 'crash',
          message: clip(r.reason ?? r.message, 300),
          line: null,
        },
      }
  }
}

/** A lint run → result. `ok` = no `error` diagnostic. */
export function fromLint(
  tool: string,
  diagnostics: readonly Diagnostic[],
  durationMs: number,
): ToolResult {
  const list = diagnostics
    .slice(0, UI_CAPS.diagnostics)
    .map((d): ToolDiagnostic => ({
      severity: d.severity,
      line: Math.max(1, Math.round(d.line)),
      column: Math.max(0, Math.round(d.column)),
      message: d.message,
    }))
  const firstError = list.find((d) => d.severity === 'error')
  return {
    ...emptyResult(tool),
    ok: firstError === undefined,
    status: firstError ? 'error' : 'ok',
    error: firstError
      ? {
          type: 'syntax',
          message: clip(firstError.message, UI_CAPS.errorMessage),
          line: firstError.line,
        }
      : null,
    diagnostics: list,
    durationMs: Math.max(0, Math.round(durationMs)),
    truncated: diagnostics.length > list.length,
  }
}

/** The lint tool itself failed (worker crashed or timed out). */
export function lintFailed(tool: string, message: string): ToolResult {
  return {
    ...emptyResult(tool),
    status: 'crash',
    error: { type: 'crash', message: clip(message, 300), line: null },
  }
}

/** The capped copy that goes to the server and, escaped, to the model. */
export function toWire(r: ToolResult): ToolResult {
  const stdout = clip(r.stdout, WIRE_CAPS.stdout)
  const error = r.error
    ? { ...r.error, message: clip(r.error.message, WIRE_CAPS.errorMessage) }
    : null
  const diagnostics = r.diagnostics
    .slice(0, WIRE_CAPS.diagnostics)
    .map((d) => ({
      ...d,
      message: clip(d.message, WIRE_CAPS.diagnosticMessage),
    }))
  const cut =
    stdout.length < r.stdout.length ||
    (error !== null &&
      r.error !== null &&
      error.message.length < r.error.message.length) ||
    diagnostics.length < r.diagnostics.length ||
    diagnostics.some(
      (d, i) => d.message.length < r.diagnostics[i]!.message.length,
    )
  return {
    ...r,
    stdout,
    error,
    diagnostics,
    truncated: r.truncated || cut,
  }
}
