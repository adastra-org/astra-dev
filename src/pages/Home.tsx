import { ArrowRight, BookOpen, Milestone, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/doc/PageHeader'
import { NAV } from '@/config/nav'
import { useLang } from '@/lib/use-lang'
import { useTitle } from '@/lib/title'

const CARDS: Record<string, LucideIcon> = {
  '/docs': BookOpen,
  '/tools': Wrench,
  '/roadmap': Milestone,
}

export default function Home() {
  const { tr } = useLang()
  useTitle()
  return (
    <>
      <PageHeader
        eyebrow={tr('home.eyebrow')}
        title="Astra Dev"
        lead={tr('home.lead')}
      />
      <ul className="grid gap-4 md:grid-cols-3">
        {NAV.filter((n) => n.to in CARDS).map((n) => {
          const Icon = CARDS[n.to]!
          return (
            <li key={n.to}>
              <Link
                to={n.to}
                className="bg-surface-raised border-border hover:border-border-strong group flex h-full flex-col gap-3 rounded-md border p-5 transition-colors"
              >
                <Icon className="text-accent size-5" aria-hidden="true" />
                <h2 className="text-h4">{tr(n.label)}</h2>
                <p className="text-body-sm text-ink-muted flex-1">
                  {tr(n.description)}
                </p>
                <span className="text-label text-accent flex items-center gap-2">
                  {tr('home.open')}
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
