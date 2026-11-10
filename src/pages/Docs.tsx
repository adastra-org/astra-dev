import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/doc/PageHeader'
import { Placeholder } from '@/components/doc/Placeholder'
import { useTitle } from '@/lib/title'

export default function Docs() {
  useTitle('Documentación')
  return (
    <>
      <PageHeader
        eyebrow="Documentación"
        title="Documentación"
        lead="Natives y sistemas del servidor con resumen arriba, ejemplo mínimo primero y detalle plegable."
      />
      <div className="flex flex-col gap-6">
        <Placeholder milestone="M1">
          El motor de docs en Markdown llega en el siguiente milestone. Mientras
          tanto, la página de ejemplo muestra el formato de lectura.
        </Placeholder>
        <Link
          to="/docs/ejemplo"
          className="text-label text-accent flex w-fit items-center gap-2"
        >
          Ver documento de ejemplo
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </>
  )
}
