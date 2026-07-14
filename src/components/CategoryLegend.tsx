import { useState } from 'react'
import { catalogCategory } from '../lib/rubricCatalog'

interface CategoryLegendProps {
  /** Ordered categories to define (a session's rubric or the group's). */
  entries: { key: string; label: string }[]
  className?: string
}

// A quiet key to the rubric: what each category means, one line apiece.
// Collapsed by default so the scoring moment stays uncluttered; definitions
// come from the catalog, and a group's custom category says so.
export function CategoryLegend({ entries, className = '' }: CategoryLegendProps) {
  const [open, setOpen] = useState(false)
  if (entries.length === 0) return null
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
        What the categories mean
      </button>
      {open && (
        <dl className="mt-2 space-y-1.5 rounded-2xl border border-line/60 bg-surface-2/50 px-4 py-3">
          {entries.map((e) => (
            <div key={e.key} className="flex items-baseline gap-2">
              <dt className="shrink-0 text-[13px] font-semibold leading-snug">
                {catalogCategory(e.key)?.label ?? e.label}
              </dt>
              <dd className="min-w-0 text-[13px] leading-snug text-muted">
                {catalogCategory(e.key)?.blurb ?? 'A category this group added.'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
