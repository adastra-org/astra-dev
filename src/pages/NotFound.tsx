import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/doc/PageHeader'
import { useTitle } from '@/lib/title'

export default function NotFound() {
  useTitle('No encontrada')
  return (
    <>
      <PageHeader
        eyebrow="Error 404"
        title="Página no encontrada"
        lead="La dirección no existe o se movió. Vuelve al inicio o busca en la documentación."
      />
      <Link to="/" className="text-label text-accent">
        Ir al inicio
      </Link>
    </>
  )
}
