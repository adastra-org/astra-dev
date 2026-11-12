import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/doc/PageHeader'
import { useLang } from '@/lib/use-lang'
import { useTitle } from '@/lib/title'

export default function NotFound() {
  const { tr } = useLang()
  useTitle(tr('notFound.title.short'))
  return (
    <>
      <PageHeader
        eyebrow={tr('notFound.eyebrow')}
        title={tr('notFound.title')}
        lead={tr('notFound.lead')}
      />
      <Link to="/" className="text-label text-accent">
        {tr('notFound.home')}
      </Link>
    </>
  )
}
