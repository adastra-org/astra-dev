import { PageHeader } from '@/components/doc/PageHeader'
import { Placeholder } from '@/components/doc/Placeholder'
import { useTitle } from '@/lib/title'

export default function Roadmap() {
  useTitle('Roadmap')
  return (
    <>
      <PageHeader
        eyebrow="Proyecto"
        title="Roadmap"
        lead="Tareas, issues y evolución del desarrollo de Ad Astra."
      />
      <Placeholder milestone="M5">
        La integración con el checklist y GitHub Projects llega más adelante.
      </Placeholder>
    </>
  )
}
