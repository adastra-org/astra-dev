// `ToolResult`: what a tool run returns, as the client reports it in `steps[].result`. The server
// never trusts it: the shape is checked field by field (unknown fields, wrong types and over-cap
// strings are a 400, nothing is cut silently) and, before the model sees it, it is serialized
// and escaped (`renderResult`). Same numbers as `src/lib/ask/tool-result.ts` in the client.
// Documented in docs/chat/README.md (phase 2) and docs/chat/tools-security.md.
import { AppError } from '../errors.ts'
import { cleanText } from './prompt.ts'

/** What the MODEL receives. The client's UI keeps more; these are the caps of the wire format. */
export const RESULT_CAPS = {
  stdout: 1200,
  errorMessage: 300,
  diagnostics: 10,
  diagnosticMessage: 140,
  /** Safety ceiling for `durationMs` (the sandbox itself stops at about 4 s). */
  durationMs: 600_000,
} as const

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

export const ERROR_TYPES = [
  'syntax',
  'runtime',
  'limit',
  'timeout',
  'crash',
  'rejected',
] as const
export type ErrorType = (typeof ERROR_TYPES)[number]

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
  stdoutChars: number
  error: { type: ErrorType; message: string; line: number | null } | null
  diagnostics: ToolDiagnostic[]
  durationMs: number
  truncated: boolean
}

const bad = (message: string) => new AppError('bad_request', message)
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function exact(
  o: Record<string, unknown>,
  keys: readonly string[],
  where: string,
) {
  for (const k of Object.keys(o))
    if (!keys.includes(k)) throw bad(`${where}: unknown field \`${k}\`.`)
  for (const k of keys)
    if (!(k in o)) throw bad(`${where}: missing field \`${k}\`.`)
}

const int = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

/** Strict check of one result. `tool` is the tool the step claims; the result must name the same one. */
export function parseToolResult(raw: unknown, tool: string): ToolResult {
  const w = 'result'
  if (!isRecord(raw)) throw bad(`${w} must be an object.`)
  exact(
    raw,
    [
      'v',
      'tool',
      'ok',
      'status',
      'stdout',
      'stdoutChars',
      'error',
      'diagnostics',
      'durationMs',
      'truncated',
    ],
    w,
  )
  if (raw.v !== 1) throw bad(`${w}.v must be 1.`)
  if (raw.tool !== tool) throw bad(`${w}.tool does not match the step.`)
  if (typeof raw.ok !== 'boolean') throw bad(`${w}.ok must be a boolean.`)
  if (
    typeof raw.status !== 'string' ||
    !(RESULT_STATUSES as readonly string[]).includes(raw.status)
  )
    throw bad(`${w}.status is not a known status.`)
  if (typeof raw.stdout !== 'string' || raw.stdout.length > RESULT_CAPS.stdout)
    throw bad(`${w}.stdout must be a string of at most ${RESULT_CAPS.stdout}.`)
  if (!int(raw.stdoutChars, 0, 10_000_000))
    throw bad(`${w}.stdoutChars must be a non-negative integer.`)
  if (!int(raw.durationMs, 0, RESULT_CAPS.durationMs))
    throw bad(`${w}.durationMs must be a non-negative integer.`)
  if (typeof raw.truncated !== 'boolean')
    throw bad(`${w}.truncated must be a boolean.`)

  let error: ToolResult['error'] = null
  if (raw.error !== null) {
    if (!isRecord(raw.error)) throw bad(`${w}.error must be null or an object.`)
    exact(raw.error, ['type', 'message', 'line'], `${w}.error`)
    const { type, message, line } = raw.error
    if (
      typeof type !== 'string' ||
      !(ERROR_TYPES as readonly string[]).includes(type)
    )
      throw bad(`${w}.error.type is not a known type.`)
    if (
      typeof message !== 'string' ||
      message.length > RESULT_CAPS.errorMessage
    )
      throw bad(
        `${w}.error.message must be a string of at most ${RESULT_CAPS.errorMessage}.`,
      )
    if (line !== null && !int(line, 1, 1_000_000))
      throw bad(`${w}.error.line must be null or a positive integer.`)
    error = {
      type: type as ErrorType,
      message: cleanText(message, RESULT_CAPS.errorMessage),
      line: line as number | null,
    }
  }

  if (!Array.isArray(raw.diagnostics))
    throw bad(`${w}.diagnostics must be an array.`)
  if (raw.diagnostics.length > RESULT_CAPS.diagnostics)
    throw bad(`${w}.diagnostics has more than ${RESULT_CAPS.diagnostics}.`)
  const diagnostics: ToolDiagnostic[] = raw.diagnostics.map((d) => {
    if (!isRecord(d)) throw bad(`${w}.diagnostics items must be objects.`)
    exact(d, ['severity', 'line', 'column', 'message'], `${w}.diagnostics[]`)
    if (d.severity !== 'error' && d.severity !== 'warning')
      throw bad(`${w}.diagnostics[].severity is not valid.`)
    if (!int(d.line, 1, 1_000_000) || !int(d.column, 0, 1_000_000))
      throw bad(`${w}.diagnostics[] line/column are not valid.`)
    if (
      typeof d.message !== 'string' ||
      d.message.length > RESULT_CAPS.diagnosticMessage
    )
      throw bad(
        `${w}.diagnostics[].message must be a string of at most ${RESULT_CAPS.diagnosticMessage}.`,
      )
    return {
      severity: d.severity,
      line: d.line as number,
      column: d.column as number,
      message: cleanText(d.message, RESULT_CAPS.diagnosticMessage),
    }
  })

  return {
    v: 1,
    tool,
    ok: raw.ok,
    status: raw.status as ResultStatus,
    stdout: cleanText(raw.stdout, RESULT_CAPS.stdout),
    stdoutChars: raw.stdoutChars as number,
    error,
    diagnostics,
    durationMs: raw.durationMs as number,
    truncated: raw.truncated,
  }
}

/**
 * The text the model reads: one line of JSON in a fixed key order. NOT yet safe for a prompt:
 * `escapeData` is applied when it is placed inside `<resultado>` (see `renderSteps`).
 */
export const serializeResult = (r: ToolResult): string =>
  JSON.stringify({
    v: r.v,
    tool: r.tool,
    ok: r.ok,
    status: r.status,
    stdout: r.stdout,
    stdoutChars: r.stdoutChars,
    error: r.error,
    diagnostics: r.diagnostics,
    durationMs: r.durationMs,
    truncated: r.truncated,
  })
