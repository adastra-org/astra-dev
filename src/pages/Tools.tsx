import { CodeBlock } from '@/components/doc/CodeBlock'
import { PageHeader } from '@/components/doc/PageHeader'
import { useLang } from '@/lib/use-lang'
import { useTitle } from '@/lib/title'

const SOON = [
  'tools.soon.mapping',
  'tools.soon.vehicles',
  'tools.soon.assets',
] as const

export default function Tools() {
  const { tr } = useLang()
  useTitle(tr('tools.title'))
  return (
    <>
      <PageHeader
        eyebrow={tr('tools.title')}
        title={tr('tools.title')}
        lead={tr('tools.lead')}
      />
      <section aria-labelledby="tools-sandbox" className="flex flex-col gap-4">
        <h2 id="tools-sandbox" className="text-h3 text-ink">
          {tr('tools.sandbox.title')}
        </h2>
        <p className="text-body text-ink-muted max-w-prose">
          {tr('tools.sandbox.lead')}
        </p>
        <CodeBlock
          code={tr('tools.sandbox.sample')}
          lang="lua"
          runnable
          editable
        />
        <p className="text-body-sm text-ink-subtle max-w-prose">
          {tr('tools.sandbox.limits')}
        </p>
      </section>
      <section
        aria-labelledby="tools-soon"
        className="mt-10 flex flex-col gap-3"
      >
        <h2 id="tools-soon" className="text-h3 text-ink">
          {tr('tools.soon.title')}
        </h2>
        <ul className="text-body-sm text-ink-muted flex flex-wrap gap-2">
          {SOON.map((k) => (
            <li
              key={k}
              className="border-border-strong rounded-md border border-dashed px-3 py-1.5"
            >
              {tr(k)}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
