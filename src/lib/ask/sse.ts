// Parser incremental de Server-Sent Events. El server emite `event: <tipo>\ndata: <json>\n\n`;
// los trozos de red pueden cortar un evento en cualquier punto, así que se acumula hasta ver la
// línea en blanco. Sin React ni fetch: se prueba con texto.
import type { AskEvent } from './types'

const TYPES = new Set([
  'meta',
  'step',
  'thinking',
  'sources',
  'delta',
  'done',
  'tool_call',
  'confirm',
  'error',
])

export class SseParser {
  #buffer = ''

  /** Agrega un trozo y devuelve los eventos completos que ya se pueden leer. */
  push(chunk: string): AskEvent[] {
    this.#buffer += chunk.replace(/\r\n?/g, '\n')
    const out: AskEvent[] = []
    for (;;) {
      const end = this.#buffer.indexOf('\n\n')
      if (end === -1) break
      const block = this.#buffer.slice(0, end)
      this.#buffer = this.#buffer.slice(end + 2)
      const ev = parseBlock(block)
      if (ev) out.push(ev)
    }
    return out
  }
}

function parseBlock(block: string): AskEvent | null {
  let type = ''
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue // comentario / keep-alive
    if (line.startsWith('event:')) type = line.slice(6).trim()
    else if (line.startsWith('data:'))
      data.push(line.slice(5).replace(/^ /, ''))
  }
  if (!TYPES.has(type) || data.length === 0) return null
  try {
    const payload = JSON.parse(data.join('\n')) as Record<string, unknown>
    if (payload === null || typeof payload !== 'object') return null
    return { type, ...payload } as AskEvent
  } catch {
    return null
  }
}
