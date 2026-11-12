// Cliente de "Proyecto". Habla con `/api/graphql` del server (nginx quita `/api`; en dev Vite lo
// proxea al server local). Las cookies de sesión viajan solas porque es mismo origen.
import type { ChecklistData, Evolution } from './types'

export type ApiErrorCode =
  | 'unauthenticated'
  | 'staff_required'
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

/** Frase para el usuario según el error (sin detalles internos). */
export function describeError(e: unknown): { title: string; hint: string } {
  const code = e instanceof ApiError ? e.code : 'internal'
  switch (code) {
    case 'unauthenticated':
      return {
        title: 'Inicia sesión',
        hint: 'Esta sección es solo para el staff. Inicia sesión con tu cuenta de Ad Astra y recarga.',
      }
    case 'staff_required':
      return {
        title: 'Solo para el staff',
        hint: 'Tu cuenta no tiene el rol de staff.',
      }
    case 'project_unavailable':
      return {
        title: 'Datos no disponibles',
        hint: 'El server no pudo leer GitHub o no está configurado. Reintenta en unos minutos.',
      }
    case 'rate_limited':
      return {
        title: 'Demasiadas consultas',
        hint:
          e instanceof ApiError && e.retryAfter
            ? `Espera ${e.retryAfter} s y reintenta.`
            : 'Espera un momento y reintenta.',
      }
    case 'network':
      return {
        title: 'Sin conexión con el server',
        hint: 'No se pudo llegar a la API. Revisa tu conexión y reintenta.',
      }
    default:
      return {
        title: 'Algo falló',
        hint: 'Reintenta. Si sigue, avisa al equipo.',
      }
  }
}
