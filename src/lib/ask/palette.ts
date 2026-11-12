// Proveedor del palette: "Preguntar a Ether". Requiere `subscriber`: el registro ni lo invoca para
// quien no tiene ese nivel (el nivel lo fija `askStore.loadViewer`). Se registra al importar este
// módulo, igual que los proveedores públicos.
import { t } from '@/lib/i18n'
import { registerPaletteProvider } from '@/lib/palette/registry'
import type { PaletteProvider } from '@/lib/palette/types'
import { askStore } from './store'

export const askProvider: PaletteProvider = {
  id: 'ask-ether',
  label: 'ask.palette.group',
  // Después de los públicos (10 a 40): la búsqueda por texto responde primero y al instante.
  order: 50,
  permission: 'subscriber',
  search: (query, ctx) => {
    const q = query.trim()
    return [
      q
        ? {
            id: 'ask:query',
            title: t(ctx.lang, 'ask.palette.ask', { q }),
            subtitle: t(ctx.lang, 'ask.palette.askHint'),
            icon: 'sparkles' as const,
            run: () => askStore.open(q),
          }
        : {
            id: 'ask:open',
            title: t(ctx.lang, 'ask.palette.open'),
            subtitle: t(ctx.lang, 'ask.palette.openHint'),
            icon: 'sparkles' as const,
            run: () => askStore.open(),
          },
    ]
  },
}

registerPaletteProvider(askProvider)
