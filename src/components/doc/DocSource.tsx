import type { DocOrigin } from '@/lib/docs/types'
import { useLang } from '@/lib/use-lang'
import { Collapsible } from './Collapsible'

/**
 * Procedencia de un doc importado, en lugar del historial de git (el archivo no es de este repo).
 * Atribución y enlace al original, como pide `docs/import/README.md`.
 */
export function DocSource({ origin }: { origin: DocOrigin }) {
  const { tr } = useLang()
  return (
    <Collapsible title={tr('doc.source')}>
      <p className="text-body-sm">{tr('doc.sourceLead')}</p>
      <ul className="text-body-sm flex flex-col gap-2">
        <li>
          <a
            href={origin.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-ink inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-8"
          >
            {tr('doc.sourcePage')}
          </a>
        </li>
        {origin.repoUrl && (
          <li>
            <a
              href={origin.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-ink inline-flex min-h-11 items-center underline underline-offset-4 md:min-h-8"
            >
              {tr('doc.sourceRepo')}
            </a>
          </li>
        )}
      </ul>
    </Collapsible>
  )
}
