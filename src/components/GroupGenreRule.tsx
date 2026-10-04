import { useState } from 'react'
import { setGroupGenreRule } from '../lib/api'
import type { GroupInfo } from '../lib/api'
import { genreOrderText } from '../lib/genres'
import type { GenreRule } from '../lib/genres'

// Which genre picks a round's rubric in this group: TMDB's first-listed
// genre, or our order. The owner changes it; everyone reads it. A round keeps
// the genre it started with. Mounted with a per-group key.
export function GroupGenreRule({
  group,
  isOwner,
  onChanged,
}: {
  group: GroupInfo
  isOwner: boolean
  onChanged: () => Promise<void>
}) {
  const [rule, setRule] = useState<GenreRule>(group.genreRule)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function change(next: GenreRule) {
    if (busy || rule === next) return
    const prev = rule
    setBusy(true)
    setError(null)
    setRule(next)
    try {
      await setGroupGenreRule(group.id, next)
      await onChanged()
    } catch (err) {
      setRule(prev)
      setError(err instanceof Error ? err.message : 'Could not change that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-line/50 pt-4">
      <p className="text-[13px] font-semibold">Which genre picks the rubric</p>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        {group.tasteMode === 'casual'
          ? 'Every genre has its own standard card (a horror night adds Fear Factor).'
          : 'Every genre has its own rubric, and each member can make their own for it.'}{' '}
        Most titles have more than one genre; this decides which one a round is scored as.
      </p>
      {isOwner ? (
        <div role="radiogroup" aria-label="Which genre picks the rubric" className="mt-2.5 flex gap-2">
          {(['first', 'order'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rule === value}
              disabled={busy}
              onClick={() => void change(value)}
              className={`min-h-11 flex-1 rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                rule === value ? 'border-teal/50 bg-teal/10 text-teal' : 'border-line text-muted hover:text-text active:bg-surface-2'
              }`}
            >
              {value === 'first' ? "TMDB's first genre" : 'Our genre order'}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-teal">
          {rule === 'first' ? "TMDB's first genre" : 'Our genre order'}
        </p>
      )}
      <p className="mt-2 text-[12px] leading-snug text-muted">
        {rule === 'order'
          ? `Our order: ${genreOrderText()}.`
          : 'The first genre TMDB lists for a title picks its rubric.'}
        {!isOwner && ' The group owner sets this.'}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}
    </div>
  )
}
