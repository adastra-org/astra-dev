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
