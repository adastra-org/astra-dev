import { useParams } from 'react-router-dom'
import { CodeBlock } from '@/components/doc/CodeBlock'
import { Collapsible } from '@/components/doc/Collapsible'
import { PageHeader } from '@/components/doc/PageHeader'
import { Placeholder } from '@/components/doc/Placeholder'
import { Summary } from '@/components/doc/Summary'
import { useTitle } from '@/lib/title'

const EXAMPLE = `-- Ejemplo mínimo: dibujar un texto en pantalla cada frame
CreateThread(function()
  while true do
    Wait(0)
    SetTextFont(4)
    SetTextScale(0.0, 0.5)
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName('Hola, Ad Astra')
    EndTextCommandDisplayText(0.5, 0.5)
  end
end)`

export default function Doc() {
  const { slug = '' } = useParams()
  useTitle(slug)
  return (
    <article className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Documento"
        title={slug}
        lead="Una línea que dice qué es y cuándo usarlo. Después, el ejemplo."
      />
      <Summary>
        Resumen de la página: qué hace, parámetros que importan y el error más
        común. Lo demás queda plegado.
      </Summary>
      <section aria-labelledby="ejemplo" className="flex flex-col gap-3">
        <h2 id="ejemplo" className="text-h3">
          Ejemplo mínimo
        </h2>
        <CodeBlock code={EXAMPLE} lang="lua" />
      </section>
      <section aria-labelledby="detalle" className="flex flex-col gap-3">
        <h2 id="detalle" className="text-h3">
          Detalle
        </h2>
        <Collapsible title="Parámetros">
          Tabla de parámetros con tipo y descripción.
        </Collapsible>
        <Collapsible title="Notas de Astra">
          Cómo usamos esto en Ad Astra y qué evitar.
        </Collapsible>
        <Collapsible title="Relacionados">
          Referencias cruzadas calculadas en build.
        </Collapsible>
      </section>
      <Placeholder milestone="M1">
        Contenido de ejemplo para fijar el formato. El render real de Markdown
        llega en M1.
      </Placeholder>
    </article>
  )
}
