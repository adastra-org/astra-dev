// Tools the chat can run in the browser (phase 2). The server only decides WHEN (the model's tag);
// everything runs here, in the M4 sandbox, and the page treats the model's text as untrusted code.
//
// Adding a tool is one entry in `CLIENT_TOOLS` plus its entry in `server/src/chat/tools.ts`
// (`TOOLS`). The store's loop and the schema do not change. The memory tools (#41) are such entries,
// defined in `memory-tools.ts`.
import { createMemoryTools, type MemoryToolContext } from './memory-tools'
import type { MemoryStore } from './memories'
import {
  fromLint,
  fromRun,
  lintFailed,
  rejected,
  type ToolResult,
} from './tool-result'

export interface ToolContext {
  /** Aborts the run (the user pressed Stop, or the page is going away). */
  signal: AbortSignal
  /** Only for the memory tools: what the store gives them for this call. */
  memory?: MemoryToolContext
}

export interface ClientTool {
  name: string
  /** Same cap as the server's `bodyMax`: a longer body is never run. */
  bodyMax: number
  run(body: string, ctx: ToolContext): Promise<ToolResult>
}

/** The sandbox calls, injectable so tests do not need a Worker. */
export interface SandboxDeps {
  runLua(code: string): Promise<{
    result: Promise<import('@/lib/sandbox/run').RunResult>
    cancel: () => void
  }>
  lint(
    code: string,
  ): Promise<
    | { ok: true; value: import('@/lib/sandbox/lint').Diagnostic[] }
    | { ok: false; message: string }
  >
}

const liveDeps: SandboxDeps = {
  // Loaded on demand: the runtime weighs nothing until the first call.
  runLua: async (code) => (await import('@/lib/sandbox/run')).runLua(code),
  lint: async (code) => (await import('@/lib/sandbox/tools')).lint(code),
}

const now = () => performance.now()

export function createTools(
  deps: SandboxDeps = liveDeps,
  memories?: MemoryStore,
) {
  const tools: Record<string, ClientTool> = {
    ...createMemoryTools(memories),
    ejecutar: {
      name: 'ejecutar',
      bodyMax: 4000,
      async run(body, { signal }) {
        if (signal.aborted) return rejected('ejecutar', 'cancelled')
        let handle: Awaited<ReturnType<SandboxDeps['runLua']>>
        try {
          handle = await deps.runLua(body)
        } catch {
          return rejected('ejecutar', 'sandbox_unavailable')
        }
        const stop = () => handle.cancel()
        signal.addEventListener('abort', stop)
        try {
          return fromRun('ejecutar', await handle.result)
        } finally {
          signal.removeEventListener('abort', stop)
        }
      },
    },
    check: {
      name: 'check',
      bodyMax: 4000,
      async run(body, { signal }) {
        if (signal.aborted) return rejected('check', 'cancelled')
        const t0 = now()
        try {
          const r = await deps.lint(body)
          if (!r.ok) return lintFailed('check', r.message)
          return fromLint('check', r.value, now() - t0)
        } catch {
          return rejected('check', 'sandbox_unavailable')
        }
      },
    },
  }
  return tools
}

export const CLIENT_TOOLS = createTools()

/** Names sent to the server as `tools`. */
export const TOOL_NAMES: readonly string[] = Object.keys(CLIENT_TOOLS)

/**
 * Runs one tool call from the model. Never throws and never runs what it should not: an unknown
 * name, an empty body or one over the cap come back as a `rejected` result (the model sees it).
 */
export async function runTool(
  name: string,
  body: string,
  signal: AbortSignal,
  registry: Record<string, ClientTool> = CLIENT_TOOLS,
  memory?: MemoryToolContext,
): Promise<ToolResult> {
  const tool = Object.hasOwn(registry, name) ? registry[name] : undefined
  if (!tool) return rejected(name.slice(0, 32), 'unknown_tool')
  if (!body.trim()) return rejected(name, 'empty_body')
  if (body.length > tool.bodyMax) return rejected(name, 'body_too_long')
  try {
    return await tool.run(body, memory ? { signal, memory } : { signal })
  } catch {
    return rejected(name, 'tool_failed')
  }
}
