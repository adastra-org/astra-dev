/** Periodos que ofrece el selector (el server admite hasta 90 días). */
export const RANGES = [14, 30, 90] as const
export type Range = (typeof RANGES)[number]
