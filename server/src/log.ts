// One JSON line per event. Never log the question, the answer, cookies or tokens: the logger drops
// those keys defensively, and callers must not pass them in the first place.

const FORBIDDEN = new Set([
  'question',
  'answer',
  'text',
  'history',
  'messages',
  'cookie',
  'authorization',
  'apikey',
  'token',
])

export type LogFields = Record<string, unknown>

export interface Logger {
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields): void
}

const scrub = (fields: LogFields): LogFields =>
  Object.fromEntries(
    Object.entries(fields).filter(([k]) => !FORBIDDEN.has(k.toLowerCase())),
  )

export function createLogger(
  write: (line: string) => void = (l) => console.log(l),
  now: () => Date = () => new Date(),
): Logger {
  const emit =
    (level: string) =>
    (event: string, fields: LogFields = {}) =>
      write(
        JSON.stringify({
          ts: now().toISOString(),
          level,
          event,
          ...scrub(fields),
        }),
      )
  return { info: emit('info'), warn: emit('warn'), error: emit('error') }
}

export const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
}
