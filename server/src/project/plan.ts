// Parser for `docs/plan/README.md`: milestone headings (`## M5 — Title (0.10.0)`) and their
// checkboxes (`[ ]` todo, `[~]` partial, `[x]` done). The file is read from GitHub at the
// configured ref, so the Proyecto page follows the plan without a redeploy.
import type { PlanGroup, PlanItemState, PlanMilestone } from './types.ts'

const HEADING = /^##\s+(M\d+)\s+[—–-]\s+(.+?)\s*\((\d+\.\d+\.\d+)\)\s*$/
const ITEM = /^\s*-\s+\[( |x|X|~)\]\s+(.*)$/
const MAX_TEXT = 400

const STATE: Record<string, PlanItemState> = {
  ' ': 'todo',
  x: 'done',
  X: 'done',
  '~': 'partial',
}

/** Plain text from the Markdown of a plan line: links, emphasis and code ticks are dropped. */
export function plainText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT)
}

export function parsePlan(markdown: string): PlanMilestone[] {
  const out: PlanMilestone[] = []
  let current: PlanMilestone | null = null
  let group: PlanGroup | null = null
  /** Last paragraph line seen since the previous list: it names the next list. */
  let pending: string | null = null

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      const h = HEADING.exec(line)
      current = h
        ? {
            id: h[1]!,
            title: plainText(h[2]!),
            version: h[3]!,
            groups: [],
            done: 0,
            partial: 0,
            total: 0,
          }
        : null
      if (current) out.push(current)
      group = null
      pending = null
      continue
    }
    if (!current) continue

    const m = ITEM.exec(line)
    if (m) {
      if (!group) {
        // The first list of a milestone is its main list; later ones carry the intro line.
        group = {
          label: current.groups.length === 0 ? null : pending,
          items: [],
        }
        current.groups.push(group)
      }
      const state = STATE[m[1]!]!
      group.items.push({ state, text: plainText(m[2]!) })
      current.total++
      if (state === 'done') current.done++
      else if (state === 'partial') current.partial++
      continue
    }

    if (line.trim() === '') continue
    // Indented continuation of an item: append to its text.
    if (group && /^\s{2,}\S/.test(line) && !line.trim().startsWith('-')) {
      const last = group.items.at(-1)
      if (last) last.text = plainText(`${last.text} ${line.trim()}`)
      continue
    }
    // Any other paragraph ends the current list and may name the next one.
    group = null
    pending = plainText(line).slice(0, 160) || null
  }
  return out
}
