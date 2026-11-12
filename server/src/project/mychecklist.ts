// MyChecklist adapter (`checklist.wefaber.net`), read-only.
//
// API shape, taken from the product's own repo (faku-org/mychecklist, ADR 0010 and 0013, and
// `server/mcp/generated/client.d.ts`): Code Mode. `POST {base}/codemode/execute` with
// `Authorization: Bearer mck_…` and body `{ code }`. The code runs in a sandbox where
// `codemode.checklist.lists.list()` and `codemode.checklist.items.list({ listId, limit, offset })`
// exist; the answer is `{ ok: true, result }`. A token minted in `read` mode only gets
// `checklist:read`, which is all this adapter uses.
//
// UNVERIFIED against the live service (no token was available when this was written): it is tested
// against a fake `fetch` that mimics the documented shape. Anything unexpected becomes
// `status: 'error'`, never an exception, so the rest of the page still renders.
import type { ChecklistGroup, ExternalChecklist } from './types.ts'
import { plainText } from './plan.ts'

export interface ChecklistSource {
  load(): Promise<ExternalChecklist>
}

export interface MyChecklistOptions {
  baseUrl: string
  /** `mck_…` token in read mode. Secret. */
  token: string
  /** Name of the list to show. */
  listName: string
  timeoutMs?: number
  fetch?: typeof fetch
}

interface McItem {
  id: string
  shortId: string | null
  parentId: string | null
  text: string
  done: boolean
}

/** Server-side script. The list name goes in as JSON, never concatenated as code. */
export const buildScript = (listName: string) => `
return (async () => {
  const lists = await codemode.checklist.lists.list();
  const list = lists.find((l) => l.name === ${JSON.stringify(listName)});
  if (!list) return null;
  const items = [];
  for (let offset = 0; offset < 2000; offset += 500) {
    const page = await codemode.checklist.items.list({ listId: list.id, limit: 500, offset });
    items.push(...page);
    if (page.length < 500) break;
  }
  return { name: list.name, items };
})()
`

const asItem = (raw: unknown): McItem | null => {
  if (raw === null || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.text !== 'string') return null
  return {
    id: r.id,
    shortId: typeof r.shortId === 'string' ? r.shortId : null,
    parentId: typeof r.parentId === 'string' ? r.parentId : null,
    text: r.text,
    done: r.done === true,
  }
}

/** Top-level items become groups (their children are the checkboxes); loose ones go in one group. */
export function groupItems(items: readonly McItem[]): ChecklistGroup[] {
  const byParent = new Map<string | null, McItem[]>()
  for (const it of items) {
    const list = byParent.get(it.parentId) ?? []
    list.push(it)
    byParent.set(it.parentId, list)
  }
  const toItem = (it: McItem) => ({
    id: it.id,
    shortId: it.shortId,
    text: plainText(it.text),
    done: it.done,
  })
  const groups: ChecklistGroup[] = []
  const loose: McItem[] = []
  for (const top of byParent.get(null) ?? []) {
    const children = byParent.get(top.id)
    if (children?.length)
      groups.push({ title: plainText(top.text), items: children.map(toItem) })
    else loose.push(top)
  }
  if (loose.length)
    groups.push({
      title: groups.length ? 'Sin grupo' : null,
      items: loose.map(toItem),
    })
  return groups
}

const empty = (
  name: string,
  status: ExternalChecklist['status'],
): ExternalChecklist => ({ status, name, groups: [], open: 0, total: 0 })

export class MyChecklistSource implements ChecklistSource {
  readonly #opts: MyChecklistOptions
  readonly #fetch: typeof fetch

  constructor(opts: MyChecklistOptions) {
    this.#opts = opts
    this.#fetch = opts.fetch ?? fetch
  }

  async load(): Promise<ExternalChecklist> {
    const { listName } = this.#opts
    try {
      const res = await this.#fetch(
        `${this.#opts.baseUrl.replace(/\/+$/, '')}/codemode/execute`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.#opts.token}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({ code: buildScript(listName) }),
          redirect: 'error',
          signal: AbortSignal.timeout(this.#opts.timeoutMs ?? 8000),
        },
      )
      if (!res.ok) return empty(listName, 'error')
      const body = (await res.json()) as { ok?: unknown; result?: unknown }
      if (body.ok !== true) return empty(listName, 'error')
      if (body.result === null) return empty(listName, 'not_found')
      const r = body.result as { name?: unknown; items?: unknown }
      if (!Array.isArray(r.items)) return empty(listName, 'error')
      const items = r.items.map(asItem).filter((i): i is McItem => i !== null)
      const groups = groupItems(items)
      const all = groups.flatMap((g) => g.items)
      return {
        status: 'ok',
        name: typeof r.name === 'string' ? r.name : listName,
        groups,
        open: all.filter((i) => !i.done).length,
        total: all.length,
      }
    } catch {
      return empty(listName, 'error')
    }
  }
}

/** Used when no token is configured: the page says the source is off instead of failing. */
export class DisabledChecklistSource implements ChecklistSource {
  readonly #name: string
  constructor(name: string) {
    this.#name = name
  }
  load(): Promise<ExternalChecklist> {
    return Promise.resolve(empty(this.#name, 'disabled'))
  }
}
