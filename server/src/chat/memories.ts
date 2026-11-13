// `memories` in `POST /chat`: short user preferences kept in the browser and sent with each
// question. Strict on purpose: a wrong shape or an over-limit list is a 400, never silently cut.
// The text is user data: it goes to the model inside <memorias>, never to the cache key, the
// logs or the usage record.
import { AppError } from '../errors.ts'
import { cleanText } from './prompt.ts'

/** Same numbers as `src/lib/ask/memories.ts` in the client. */
export const MEMORIES_MAX_ITEMS = 12
export const MEMORY_MAX_CHARS = 280
export const MEMORIES_MAX_TOTAL = 2000

const bad = (message: string) => new AppError('bad_request', message)

/** Absent or `null` = none. Anything else must be an array of 1..280-char strings, within the total cap. */
export function parseMemories(raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw bad('`memories` must be an array of strings.')
  if (raw.length > MEMORIES_MAX_ITEMS)
    throw bad(`\`memories\` has more than ${MEMORIES_MAX_ITEMS} items.`)
  const out: string[] = []
  let total = 0
  for (const m of raw) {
    if (typeof m !== 'string')
      throw bad('`memories` must be an array of strings.')
    if (m.length > MEMORY_MAX_CHARS)
      throw bad(`A memory is longer than ${MEMORY_MAX_CHARS} characters.`)
    const text = cleanText(m, MEMORY_MAX_CHARS)
    if (!text) throw bad('A memory is empty.')
    total += text.length
    out.push(text)
  }
  if (total > MEMORIES_MAX_TOTAL)
    throw bad(`\`memories\` is longer than ${MEMORIES_MAX_TOTAL} characters.`)
  return out
}
