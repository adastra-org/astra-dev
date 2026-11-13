// `sources` in `POST /chat`: slugs of the sources the previous answer cited. Lets a follow-up
// ("explicame eso", "dame un ejemplo") lean on what was just discussed instead of a new search that
// the vague question cannot drive. Strict on purpose: a wrong shape is a 400, never silently cut.
// Slugs are only used as a filter over the index; unknown ones match nothing.
import { AppError } from '../errors.ts'

export const CARRY_MAX_SLUGS = 8
export const CARRY_MAX_SLUG_CHARS = 160
/** Site slugs: `get-vehicle-class`, `fivem-game-references-vehicle-colors`, `a/b.c`. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

const bad = (message: string) => new AppError('bad_request', message)

/** Absent or `null` = none. Anything else must be an array of 1..8 distinct, well-formed slugs. */
export function parseSources(raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw bad('`sources` must be an array of strings.')
  if (raw.length > CARRY_MAX_SLUGS)
    throw bad(`\`sources\` has more than ${CARRY_MAX_SLUGS} items.`)
  const out = new Set<string>()
  for (const s of raw) {
    if (typeof s !== 'string')
      throw bad('`sources` must be an array of strings.')
    if (s.length > CARRY_MAX_SLUG_CHARS || !SLUG.test(s))
      throw bad('`sources` has a malformed slug.')
    out.add(s)
  }
  return [...out]
}
