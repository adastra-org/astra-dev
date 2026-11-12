// Compatibility check between two embedders: query vectors (embedded on the VPS) are compared
// against document vectors (embedded on the PC or on Cloudflare), so they must be the same model
// with the same task prefixes. The check embeds the same texts with both and demands a cosine
// close to 1 for every pair (after the same Matryoshka truncation the index applies).
import {
  cosine,
  normalize,
  truncate,
  type EmbedderClient,
} from '@wefaber/embed'

export type Embeds = Pick<EmbedderClient, 'embedMany' | 'model'>

export interface CompatResult {
  pairs: number
  min: number
  mean: number
  threshold: number
  /** The lowest-scoring texts (up to 3), to see what drifts. */
  worst: { text: string; cosine: number }[]
  ok: boolean
}

const head = (v: number[], dims: number) =>
  dims === v.length ? normalize(v) : truncate(v, dims)

export async function compareEmbedders(
  a: Embeds,
  b: Embeds,
  texts: readonly string[],
  opts: { dims: number; threshold?: number; batchSize?: number },
): Promise<CompatResult> {
  if (!texts.length) throw new RangeError('compareEmbedders needs texts')
  const threshold = opts.threshold ?? 0.99
  const batchSize = opts.batchSize ?? 16
  const list = [...texts]
  const va = await a.embedMany(list, { batchSize })
  const vb = await b.embedMany(list, { batchSize })
  const scores = list.map((text, i) => ({
    text,
    cosine: cosine(head(va[i]!, opts.dims), head(vb[i]!, opts.dims)),
  }))
  const sorted = [...scores].sort((x, y) => x.cosine - y.cosine)
  const min = sorted[0]!.cosine
  const mean = scores.reduce((s, x) => s + x.cosine, 0) / scores.length
  return {
    pairs: scores.length,
    min,
    mean,
    threshold,
    worst: sorted.slice(0, 3),
    ok: min >= threshold,
  }
}

/** `n` items spread evenly over `items` (deterministic: same corpus, same sample). */
export function sampleEvenly<T>(items: readonly T[], n: number): T[] {
  if (n >= items.length) return [...items]
  return Array.from(
    { length: n },
    (_, i) => items[Math.floor((i * items.length) / n)]!,
  )
}
