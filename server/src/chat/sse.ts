// Server-Sent Events encoding of a chat run.
//   event: meta     data: {"requestId","mode","degraded"}
//   event: sources  data: {"sources":[...]}
//   event: delta    data: {"text":"..."}            (many)
//   event: done     data: {"cited":[1],"refused":false,"truncated":false,"usage":{...}}
//   event: tool_call data: {"round","name","body"}   (phase 2: the model asked for a tool; `done.stop` = "tool_call")
//   event: confirm  data: {"reason","rounds"}        (phase 2: owner round cap; `done.stop` = "confirm")
//   event: error    data: {"code","message"}        (terminal, instead of done)
// Errors that happen before streaming (401, 403, 429, ...) are plain JSON responses, not SSE.
import type { ChatEvent } from './service.ts'

export const encodeEvent = (e: ChatEvent): string => {
  const { type, ...data } = e
  // JSON.stringify never emits a raw newline, so one `data:` line is always enough.
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store, no-transform',
  connection: 'keep-alive',
  // nginx: do not buffer the stream.
  'x-accel-buffering': 'no',
} as const

/** Wraps an event generator in a streaming Response. Cancelling the response aborts the run. */
export function sseResponse(
  run: (signal: AbortSignal) => AsyncGenerator<ChatEvent>,
  extraHeaders: Record<string, string> = {},
): Response {
  const abort = new AbortController()
  const encoder = new TextEncoder()
  const gen = run(abort.signal)
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gen.next()
        if (done) controller.close()
        else controller.enqueue(encoder.encode(encodeEvent(value)))
      } catch {
        controller.enqueue(
          encoder.encode(
            encodeEvent({
              type: 'error',
              code: 'internal',
              message: 'Internal error',
            }),
          ),
        )
        controller.close()
      }
    },
    cancel() {
      abort.abort()
      void gen.return(undefined)
    },
  })
  return new Response(stream, {
    headers: { ...SSE_HEADERS, ...extraHeaders },
  })
}
