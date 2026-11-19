import { PageHeader } from '@/components/doc/PageHeader'
import { Placeholder } from '@/components/doc/Placeholder'
import { useLang } from '@/lib/use-lang'
import { useTitle } from '@/lib/title'

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
      <Placeholder milestone="M4">{tr('tools.placeholderText')}</Placeholder>
    </>
  )
}
