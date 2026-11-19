declare module 'virtual:astra-docs' {
  import type { DocContent, DocMeta } from '@/lib/docs/types'
  export const docs: DocMeta[]
  export const loaders: Record<string, () => Promise<{ default: DocContent }>>
}

declare module 'virtual:astra-doc/*' {
  import type { DocContent } from '@/lib/docs/types'
  const content: DocContent
  export default content
}

declare module 'virtual:astra-natives' {
  import type { NativeGroup } from '@/lib/natives/types'
  export const groups: NativeGroup[]
  export const total: number
}
