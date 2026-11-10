import type { RouteObject } from 'react-router-dom'
import { Shell } from '@/components/shell/Shell'
import Doc from '@/pages/Doc'
import Docs from '@/pages/Docs'
import Home from '@/pages/Home'
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
      { path: '/tools', element: <Tools /> },
      { path: '/roadmap', element: <Roadmap /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
