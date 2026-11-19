// Loggable facts about a finished answer. Counts and flags only: never the text.
import type { ChatEvent } from './service.ts'

export const citedLog = (done: Extract<ChatEvent, { type: 'done' }>) => ({
  cited: done.cited.length,
  refused: done.refused,
  truncated: done.truncated,
})
