import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLang } from '@/lib/use-lang'

/** Botón flotante para volver arriba en páginas largas. Aparece tras 600 px de scroll. */
export function BackToTop() {
  const { tr } = useLang()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  if (!show) return null
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0 })}
      className="bg-surface-overlay text-ink border-border-strong hover:bg-surface-raised text-label fixed right-4 bottom-4 z-20 flex min-h-11 items-center gap-2 rounded-md border px-4 md:right-8 md:bottom-8"
    >
      <ArrowUp className="size-4" aria-hidden="true" />
      {tr('doc.backToTop')}
    </button>
  )
}
