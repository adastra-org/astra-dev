// Proveedor del palette para el dashboard de IA. Requiere `owner`: el registro ni lo invoca para
// nadie por debajo (el nivel lo fija `askStore.loadViewer`). Se registra al importar este módulo.
import { scoreMatch } from '@/lib/docs-query'
import { t } from '@/lib/i18n'
import { registerPaletteProvider } from '@/lib/palette/registry'
import type { PaletteProvider } from '@/lib/palette/types'

export const aiUsageProvider: PaletteProvider = {
  id: 'ai-usage',
  label: 'ai.palette.title',
  order: 60,
  permission: 'owner',
  search: (q, ctx) => {
    const item = {
      id: 'ai:usage',
      title: t(ctx.lang, 'ai.palette.title'),
      subtitle: t(ctx.lang, 'ai.palette.hint'),
      icon: 'tools' as const,
      to: '/ia',
    }
    if (!q.trim()) return [item]
    const hit = scoreMatch(q, {
      title: item.title,
      keywords: [
        'ia',
        'ai',
        'uso',
        'usage',
        'tokens',
        'gpu',
        'costos',
        'admin',
      ],
    })
    return hit > 0 ? [item] : []
  },
}

registerPaletteProvider(aiUsageProvider)
