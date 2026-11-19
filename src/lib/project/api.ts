// Cliente de "Proyecto". Habla con `/api/graphql` del server (nginx quita `/api`; en dev Vite lo
// proxea al server local). Las cookies de sesión viajan solas porque es mismo origen.
import type { ChecklistData, Evolution } from './types'
import { t, type MessageKey, type Vars } from '@/lib/i18n'

export type ApiErrorCode =
  | 'unauthenticated'
  | 'staff_required'
  | 'owner_required'
  | 'usage_unavailable'
  | 'project_unavailable'
  | 'rate_limited'
  | 'viewer_unavailable'
  | 'bad_request'
  | 'network'
  | 'internal'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly retryAfter: number | undefined
  constructor(code: ApiErrorCode, message: string, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.retryAfter = retryAfter
  }
}

const KNOWN = new Set<string>([
  'unauthenticated',
  'staff_required',
  'owner_required',
  'usage_unavailable',
  'project_unavailable',
  'rate_limited',
  'viewer_unavailable',
  'bad_request',
])

const asCode = (c: unknown): ApiErrorCode =>
  typeof c === 'string' && KNOWN.has(c) ? (c as ApiErrorCode) : 'internal'

interface GqlError {
  message?: string
  extensions?: { code?: unknown; retryAfter?: unknown }
}

export const ENDPOINT = `${import.meta.env.VITE_API_BASE ?? '/api'}/graphql`

/** Ejecuta una consulta de `project`. Un error de GraphQL o de HTTP se vuelve `ApiError`. */
export async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  let res: Response
  try {
    res = await fetcher(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      ...(signal ? { signal } : {}),
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError('network', 'No se pudo conectar con el servidor.')
  }
  let body: {
    data?: T | null
    errors?: GqlError[]
    error?: { code?: unknown; message?: string; retryAfter?: number }
  }
  try {
    body = await res.json()
  } catch {
    throw new ApiError('internal', `Respuesta inválida (${res.status}).`)
  }
  // Errores fuera de GraphQL (origen no permitido, 404 del proxy): `{ error: { code } }`.
  if (body.error)
    throw new ApiError(
      asCode(body.error.code),
      body.error.message ?? 'Error',
      body.error.retryAfter,
    )
  const first = body.errors?.[0]
  if (first)
    throw new ApiError(
      asCode(first.extensions?.code),
      first.message ?? 'Error',
      typeof first.extensions?.retryAfter === 'number'
        ? first.extensions.retryAfter
        : undefined,
    )
  if (!body.data) throw new ApiError('internal', 'Respuesta vacía.')
  return body.data
}

const CHECKLIST_QUERY = `query ProjectChecklist {
  project {
    checklist {
      generatedAt stale
      plan { id title version done partial total groups { label items { state text } } }
      milestones { number title state dueOn open closed url }
      external { status name open total groups { title items { id shortId text done } } }
    }
    complexity { repo generatedAt stale series { date sha files lines docLines churn } }
  }
}`

const EVOLUTION_QUERY = `query ProjectEvolution($days: Int!) {
  project {
    evolution(days: $days) {
      repo ref generatedAt stale truncated days
      totals { openIssues closedIssues openPrs mergedPrs commits }
      daily { date opened closed commits open }
      burndown { milestoneNumber milestoneTitle dueOn points { date remaining } ideal { date remaining } }
    }
  }
}`

export async function loadChecklist(
  signal?: AbortSignal,
  fetcher?: typeof fetch,
): Promise<ChecklistData> {
  const d = await gql<{ project: ChecklistData }>(
    CHECKLIST_QUERY,
    {},
    signal,
    fetcher,
  )
  return d.project
}

export async function loadEvolution(
  days: number,
  signal?: AbortSignal,
  fetcher?: typeof fetch,
): Promise<Evolution> {
  const d = await gql<{ project: { evolution: Evolution } }>(
    EVOLUTION_QUERY,
    { days },
    signal,
    fetcher,
  )
  return d.project.evolution
}

type Tr = (key: MessageKey, vars?: Vars) => string

/** Frase para el usuario según el error (sin detalles internos). */
export function describeError(
  e: unknown,
  tr: Tr = (key, vars) => t('es', key, vars),
): { title: string; hint: string } {
  const code = e instanceof ApiError ? e.code : 'internal'
  switch (code) {
    case 'unauthenticated':
      return {
        title: tr('rm.err.unauthenticated'),
        hint: tr('rm.err.unauthenticated.hint'),
      }
    case 'staff_required':
      return { title: tr('rm.err.staff'), hint: tr('rm.err.staff.hint') }
    case 'owner_required':
      return { title: tr('ai.err.owner'), hint: tr('ai.err.owner.hint') }
    case 'usage_unavailable':
      return {
        title: tr('ai.err.disabled'),
        hint: tr('ai.err.disabled.hint'),
      }
    case 'project_unavailable':
      return {
        title: tr('rm.err.unavailable'),
        hint: tr('rm.err.unavailable.hint'),
      }
    case 'rate_limited':
      return {
        title: tr('rm.err.rate'),
        hint:
          e instanceof ApiError && e.retryAfter
            ? tr('rm.err.rate.in', { n: e.retryAfter })
            : tr('rm.err.rate.wait'),
      }
    case 'network':
      return { title: tr('rm.err.network'), hint: tr('rm.err.network.hint') }
    default:
      return { title: tr('rm.err.other'), hint: tr('rm.err.other.hint') }
  }
}
