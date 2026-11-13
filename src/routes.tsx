import type { RouteObject } from 'react-router-dom'
import { Shell } from '@/components/shell/Shell'
import Doc from '@/pages/Doc'
import AiUsage from '@/pages/AiUsage'
import Docs from '@/pages/Docs'
import Home from '@/pages/Home'
import Native from '@/pages/Native'
import NativeGroup from '@/pages/NativeGroup'
import Natives from '@/pages/Natives'
import NotFound from '@/pages/NotFound'
import Roadmap from '@/pages/Roadmap'
import Tools from '@/pages/Tools'

/** Árbol de rutas. Cada `to` de `config/nav.ts` debe resolver acá (lo prueba routes.test.ts). */
export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/docs', element: <Docs /> },
      { path: '/docs/:slug', element: <Doc /> },
      { path: '/natives', element: <Natives /> },
      { path: '/natives/ns/:group', element: <NativeGroup /> },
      { path: '/natives/:slug', element: <Native /> },
      { path: '/tools', element: <Tools /> },
      { path: '/roadmap', element: <Roadmap /> },
      { path: '/dashboard', element: <AiUsage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
