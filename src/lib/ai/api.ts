// Cliente del dashboard de IA. Misma ruta y mismos errores que "Proyecto" (`gql` de project/api).
import { gql } from '@/lib/project/api'
import type { AiUsage } from './types'

const QUERY = `query AiUsage($days: Int!) {
  aiUsage(days: $days) {
    days from to generatedAt lostRecords
    totals {
      requests cacheHits cacheHitRate inputTokens outputTokens gpuMs gpuMeasured costUsdEst
      avgTtftMs avgGenTps rateLimited budgetExceeded errors fallbacks activeViewers
    }
    daily { date requests inputTokens outputTokens gpuMs costUsdEst }
    models { provider model requests inputTokens outputTokens gpuMs costUsdEst avgTtftMs avgGenTps fallbacks }
    viewers { viewerId handle role requests tokens gpuMs }
    outcomes { outcome count }
  }
}`

export async function loadAiUsage(
  days: number,
  signal?: AbortSignal,
): Promise<AiUsage> {
  const data = await gql<{ aiUsage: AiUsage }>(QUERY, { days }, signal)
  return data.aiUsage
}
