// Proveedor del palette: "Preguntar a Ether". Requiere `subscriber`: el registro ni lo invoca para
// quien no tiene ese nivel (el nivel lo fija `askStore.loadViewer`). Se registra al importar este
// módulo, igual que los proveedores públicos.
import { registerPaletteProvider } from '@/lib/palette/registry'
import type { PaletteProvider } from '@/lib/palette/types'
import { askStore } from './store'

export const askProvider: PaletteProvider = {
  id: 'ask-ether',
  label: 'Preguntar a Ether',
  // Después de los públicos (10 a 40): la búsqueda por texto responde primero y al instante.
  order: 50,
  permission: 'subscriber',
  search: (query) => {
    const q = query.trim()
    return [
      q
        ? {
            id: 'ask:query',
            title: `Preguntar: «${q}»`,
            subtitle:
              'Ether responde con lo que dice la documentación y cita las páginas',
            icon: 'sparkles' as const,
            run: () => askStore.open(q),
          }
        : {
            id: 'ask:open',
            title: 'Abrir Ask Ether',
            subtitle: 'Pregunta en lenguaje natural sobre la documentación',
            icon: 'sparkles' as const,
            run: () => askStore.open(),
          },
    ]
  },
}

registerPaletteProvider(askProvider)
