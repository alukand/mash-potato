import type { ResolvedRubricEntry } from '../lib/rubricCatalog'

interface RubricReceiptProps {
  /** Resolved categories with provenance (group rows vs genre auto-adds). */
  entries: ResolvedRubricEntry[]
  title?: string
  className?: string
}

// The rubric "receipt": what tonight's round will be scored on, shown before
// anyone scores. Pure receipt, never a form: weights live on the group and
// never change per movie. Genre add-ons are marked teal; whether to rate one
// is each member's own call on their scorecard (skip it and it simply isn't
// on their card).
export function RubricReceipt({
  entries,
  title = "Tonight's rubric",
  className = '',
}: RubricReceiptProps) {
  if (entries.length === 0) return null
  const genreCount = entries.filter((e) => e.source === 'genre').length

  return (
    <div className={className}>
      <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {entries.map((e) =>
          e.source === 'group' ? (
            <span
              key={e.key}
              className="flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted"
            >
              {e.label}
              <span className="tabular ml-1.5 font-mono text-[10px] text-text">{e.weight}</span>
            </span>
          ) : (
            <span
              key={e.key}
              className="flex items-center gap-1 rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1 text-[11px] font-medium text-teal"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {e.label}
              <span className="tabular font-mono text-[10px] opacity-80">{e.weight}</span>
            </span>
          ),
        )}
      </div>
      {genreCount > 0 && (
        <p className="mt-2 px-1 text-[12px] leading-snug text-muted">
          Teal categories were added for this title’s genres. Everyone picks their own
          extras to rate or skip while scoring.
        </p>
      )}
    </div>
  )
}
