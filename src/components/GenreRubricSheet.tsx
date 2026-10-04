import { useState } from 'react'
import { saveMyGenreRubric } from '../lib/api'
import type { GroupRubricRow } from '../lib/api'
import { genreDef, standardRowsFor } from '../lib/genres'
import type { GenreKey } from '../lib/genres'
import { RubricRowsEditor } from './RubricRowsEditor'
import { Sheet } from './Sheet'
import { CtaButton } from './ui'

// Your own rubric for one genre, in the one rubric editor. It starts from
// the genre's standard (your mode's card plus what the genre adds), is used
// for your ratings of that genre alone and in every group, and can go back
// to the standard at any time.
export function GenreRubricSheet({
  userId,
  genre,
  initial,
  note,
  onSaved,
  onClose,
}: {
  userId: string
  genre: GenreKey
  /** Your own rows for the genre, or null to start from the standard. */
  initial: GroupRubricRow[] | null
  /** A line under the title, e.g. when a round under way is unaffected. */
  note?: string
  /** Saved: your rows, or null when you chose the standard. */
  onSaved: (rows: GroupRubricRow[] | null) => void
  onClose: () => void
}) {
  const g = genreDef(genre)
  const [rows, setRows] = useState<GroupRubricRow[]>(() => initial ?? standardRowsFor('buff', genre))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: GroupRubricRow[] | null) {
    setBusy(true)
    setError(null)
    try {
      await saveMyGenreRubric(userId, genre, next)
      onSaved(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rubric.')
      setBusy(false)
    }
  }

  return (
    <Sheet label={`Your ${g.label} rubric`} onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-semibold leading-tight">Your {g.label} rubric</h2>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            Used for every {g.label} title you rate, alone and in all your groups.
            {g.change ? ` The standard ${g.change}.` : ' The standard is your usual rubric.'}
          </p>
          {note && <p className="mt-1.5 text-[12px] leading-snug text-gold">{note}</p>}
        </div>
        <button
          type="button"
          data-sheet-close
          aria-label="Close"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-text active:bg-surface-2"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="mt-4">
        <RubricRowsEditor rows={rows} onChange={setRows} disabled={busy} />
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(null)}
          className="min-h-11 flex-1 rounded-full border border-line px-4 text-[13px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2 disabled:opacity-60"
        >
          Use the standard
        </button>
        <CtaButton onClick={() => void save(rows)} disabled={busy} className="min-h-11 flex-1 px-4 text-[13px]">
          {busy ? 'Saving…' : `Save my ${g.label} rubric`}
        </CtaButton>
      </div>
    </Sheet>
  )
}
