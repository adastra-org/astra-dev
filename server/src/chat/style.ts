// `style` in `POST /chat`: how Ether should sound (tone and length), picked in the client
// onboarding. Bounded on purpose: a plain object with two enum fields, never free text. A wrong
// shape or an unknown value is a 400, never silently ignored. The model sees fixed sentences
// chosen here from the enum, so nothing the client typed ever reaches the prompt.
import { AppError } from '../errors.ts'

export const TONES = ['neutral', 'formal', 'cercano'] as const
export const LENGTHS = ['brief', 'balanced', 'detailed'] as const
export type Tone = (typeof TONES)[number]
export type Length = (typeof LENGTHS)[number]

export interface ChatStyle {
  tone: Tone
  length: Length
}

export const DEFAULT_STYLE: ChatStyle = { tone: 'neutral', length: 'balanced' }

const bad = (message: string) => new AppError('bad_request', message)

const pick = <T extends string>(
  field: string,
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => {
  if (value === undefined || value === null) return fallback
  if (
    typeof value !== 'string' ||
    !(allowed as readonly string[]).includes(value)
  )
    throw bad(`\`style.${field}\` must be one of: ${allowed.join(', ')}.`)
  return value as T
}

/** Absent, `null` or `{}` = defaults. Anything else must be `{tone?, length?}` with enum values. */
export function parseStyle(raw: unknown): ChatStyle {
  if (raw === undefined || raw === null) return DEFAULT_STYLE
  if (typeof raw !== 'object' || Array.isArray(raw))
    throw bad('`style` must be an object.')
  const o = raw as Record<string, unknown>
  for (const k of Object.keys(o))
    if (k !== 'tone' && k !== 'length')
      throw bad(`\`style\` has an unknown field: ${k.slice(0, 20)}.`)
  return {
    tone: pick('tone', o.tone, TONES, DEFAULT_STYLE.tone),
    length: pick('length', o.length, LENGTHS, DEFAULT_STYLE.length),
  }
}

export const isDefaultStyle = (s: ChatStyle) =>
  s.tone === DEFAULT_STYLE.tone && s.length === DEFAULT_STYLE.length

const TONE_LINE: Record<Tone, string> = {
  neutral: 'neutro, claro y directo',
  formal: 'formal, de usted en español, sin coloquialismos',
  cercano: 'cercano y cordial, de tú en español, sin exagerar',
}
const LENGTH_LINE: Record<Length, string> = {
  brief: 'muy breve: lo esencial, máximo unas 120 palabras',
  balanced: 'equilibrado: máximo unas 250 palabras',
  detailed:
    'detallado: puedes extenderte hasta unas 400 palabras, con pasos o ejemplos',
}

/** Body of the `<estilo>` block. Empty for the defaults, so the prompt stays as it was. */
export function renderStyle(s: ChatStyle): string {
  if (isDefaultStyle(s)) return ''
  return `tono: ${TONE_LINE[s.tone]}\nlargo: ${LENGTH_LINE[s.length]}`
}

/** Compact label for the request log: enums only. */
export const styleLabel = (s: ChatStyle) => `${s.tone}/${s.length}`
