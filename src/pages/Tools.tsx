import { PageHeader } from '@/components/doc/PageHeader'
import { Placeholder } from '@/components/doc/Placeholder'
import { useTitle } from '@/lib/title'

export default function Tools() {
  useTitle('Herramientas')
  return (
    <>
      <PageHeader
        eyebrow="Herramientas"
        title="Herramientas"
        lead="Utilidades del equipo: mapeo, vehículos y conversión de assets."
      />
      <Placeholder milestone="M4">
        El catálogo de herramientas y el sandbox de código llegan más adelante.
      </Placeholder>
    </>
  )
}
