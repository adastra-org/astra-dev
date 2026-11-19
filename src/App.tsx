import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { LangProvider } from './lib/i18n-context'
import { routes } from './routes'

const router = createBrowserRouter(routes)

export default function App() {
  return (
    <LangProvider>
      <RouterProvider router={router} />
    </LangProvider>
  )
}
