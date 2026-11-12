import type { FormatResult } from './format.ts'
import type { Diagnostic } from './lint.ts'

export type ToolsRequest = { op: 'lint' | 'format'; code: string }

export type ToolsResponse =
  | { op: 'lint'; diagnostics: Diagnostic[] }
  | { op: 'format'; result: FormatResult }
  | { op: 'failed'; message: string }
