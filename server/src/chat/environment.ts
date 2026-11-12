// Facts about the situation of the question, given to the model as data inside <entorno> (never in
// the system prompt). Everything here is escaped like the rest of the user message: a handle or a
// commit subject is text somebody else wrote.
import type { Role } from '../config.ts'
import type { HeadInfo } from './head.ts'
import { cleanText, escapeData } from './prompt.ts'

export type ChatLang = 'es' | 'en'

export interface ChatEnv {
  /** UI language of the visitor. */
  lang: ChatLang
  now: Date
  head: HeadInfo | null
  /** Version of the running build. */
  version: string
  user: { handle: string | null; role: Role }
}

export const parseLang = (v: unknown): ChatLang => (v === 'en' ? 'en' : 'es')

/** `<entorno>` body. One fact per line; absent facts are left out. */
export function renderEnv(e: ChatEnv): string {
  const line = (k: string, v: string) => `${k}: ${escapeData(v)}`
  const lines = [
    line('idioma_de_la_interfaz', e.lang),
    line('fecha', e.now.toISOString().slice(0, 10)),
    line('version_del_sitio', cleanText(e.version, 32)),
  ]
  if (e.head) {
    const date = e.head.committedAt
      ? ` (${cleanText(e.head.committedAt, 32)})`
      : ''
    lines.push(
      line('rama', cleanText(e.head.branch, 60)),
      line(
        'ultimo_commit',
        `${cleanText(e.head.sha, 12)} "${cleanText(e.head.subject, 120)}"${date}`,
      ),
    )
  }
  const handle = e.user.handle ? cleanText(e.user.handle, 40) : 'anonimo'
  lines.push(line('quien_pregunta', `${handle} (rol: ${e.user.role})`))
  return lines.join('\n')
}
