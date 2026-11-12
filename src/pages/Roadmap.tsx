import { PageHeader } from '@/components/doc/PageHeader'
import { Placeholder } from '@/components/doc/Placeholder'
import { useLang } from '@/lib/use-lang'
import { useTitle } from '@/lib/title'

export default function Roadmap() {
  const { tr } = useLang()
  useTitle(tr('roadmap.title'))
  return (
    <>
      <PageHeader
        eyebrow={tr('roadmap.eyebrow')}
        title={tr('roadmap.title')}
        lead={tr('roadmap.lead')}
      />
      <Placeholder milestone="M5">{tr('roadmap.placeholderText')}</Placeholder>
    </>
  )
}
