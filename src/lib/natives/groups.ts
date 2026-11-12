// Namespaces de natives, baked en el bundle por el build (`virtual:astra-natives`).
import { groups, total } from 'virtual:astra-natives'
import type { NativeGroup } from './types'

export { groups, total }

export const groupById = (id: string): NativeGroup | undefined =>
  groups.find((g) => g.id === id)
