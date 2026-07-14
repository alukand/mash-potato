import type { ResolvedRubricEntry } from '../lib/rubricCatalog'

interface RubricReceiptProps {
  /** Resolved categories with provenance (group rows vs genre auto-adds). */
  entries: ResolvedRubricEntry[]
  /** Genre add-ons left out of this round (only meaningful with onToggleGenre). */
  excludedKeys?: Set<string>
  /** When set, genre-sourced chips become binary opt-out toggles. */
  onToggleGenre?: (key: string) => void
  title?: string
  className?: string
}

// The rubric "receipt": what tonight's round will be scored on, shown before
// anyone scores. Base categories are read-only (weights live on the group,
// never per movie); genre add-ons are marked, and at round creation they can
// be left out — on/off only, the one per-round adjustment that stays fair.
export function RubricReceipt({
  entries,
  excludedKeys,
  onToggleGenre,
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
        {entries.map((e) => {
          if (e.source === 'group') {
            return (
              <span
                key={e.key}
                className="flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted"
              >
                {e.label}
                <span className="tabular ml-1.5 font-mono text-[10px] text-text">{e.weight}</span>
              </span>
            )
          }
          const off = excludedKeys?.has(e.key) ?? false
          const canToggle = !!onToggleGenre
          const chipInner = (
            <>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {e.label}
              {!off && (
                <span className="tabular font-mono text-[10px] opacity-80">{e.weight}</span>
              )}
              {canToggle && !off && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0 opacity-70" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              )}
            </>
          )
          if (!canToggle) {
            return (
              <span
                key={e.key}
                className="flex items-center gap-1 rounded-full border border-teal/40 bg-teal/10 px-2.5 py-1 text-[11px] font-medium text-teal"
              >
                {chipInner}
              </span>
            )
          }
          return (
            <button
              key={e.key}
              type="button"
              onClick={() => onToggleGenre(e.key)}
              aria-pressed={!off}
              aria-label={off ? `Include ${e.label} tonight` : `Leave ${e.label} out tonight`}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors active:scale-95 ${
                off
                  ? 'border-dashed border-line text-muted hover:text-text'
                  : 'border-teal/40 bg-teal/10 text-teal'
              }`}
            >
              {chipInner}
            </button>
          )
        })}
      </div>
      {genreCount > 0 && (
        <p className="mt-2 px-1 text-[12px] leading-snug text-muted">
          {onToggleGenre
            ? 'Added for this title’s genres. Tap one to leave it out tonight.'
            : 'Teal categories were added for this title’s genres.'}
        </p>
      )}
    </div>
  )
}
