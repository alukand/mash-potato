import { useEffect, useState } from 'react'
import { fetchMyGenreRubrics, fetchMyGenreRule, setMyGenreRule } from '../lib/api'
import type { GroupRubricRow } from '../lib/api'
import { GENRES, genreOrderText } from '../lib/genres'
import type { GenreKey, GenreRule } from '../lib/genres'
import type { TasteMode } from '../lib/rubricCatalog'
import { GenreRubricSheet } from './GenreRubricSheet'

// Profile: which genre leads your solo ratings, and your own rubric for each
// genre (Cinephiles). A genre rubric is yours everywhere: solo and in every
// group you're in. Normies score each genre's standard card and set nothing.
export function GenreRubrics({ userId, mode }: { userId: string; mode: TasteMode | null }) {
  const [rule, setRule] = useState<GenreRule | null>(null)
  const [mine, setMine] = useState<Map<GenreKey, GroupRubricRow[] | null> | null>(null)
  const [editing, setEditing] = useState<GenreKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stale = false
    Promise.all([fetchMyGenreRule(userId), fetchMyGenreRubrics(userId)])
      .then(([r, m]) => {
        if (stale) return
        setRule(r)
        setMine(m)
      })
      .catch(() => !stale && setError('Your genre rubrics could not load.'))
    return () => {
      stale = true
    }
  }, [userId])

  async function changeRule(next: GenreRule) {
    if (busy || rule === next) return
    const prev = rule
    setBusy(true)
    setError(null)
    setRule(next)
    try {
      await setMyGenreRule(userId, next)
    } catch (err) {
      setRule(prev)
      setError(err instanceof Error ? err.message : 'Could not change that.')
    } finally {
      setBusy(false)
    }
  }

  const pill = (on: boolean) =>
    `min-h-11 flex-1 rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
      on ? 'border-teal/50 bg-teal/10 text-teal' : 'border-line text-muted hover:text-text active:bg-surface-2'
    }`

  return (
    <div>
      <p className="text-[13px] font-semibold">Which genre picks the rubric</p>
      <p className="mt-1 text-[12px] leading-snug text-muted">
        Most titles have more than one genre. This decides which one your solo ratings use;
        each group sets its own for its rounds.
      </p>
      <div role="radiogroup" aria-label="Which genre picks the rubric" className="mt-2.5 flex gap-2">
        {(['first', 'order'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rule === value}
            disabled={busy || rule === null}
            onClick={() => void changeRule(value)}
            className={pill(rule === value)}
          >
            {value === 'first' ? "TMDB's first genre" : 'Our genre order'}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-muted">
        {rule === 'order'
          ? `Our order: ${genreOrderText()}.`
          : 'The first genre TMDB lists for a title picks its rubric.'}
      </p>

      <div className="mt-5 border-t border-line/50 pt-4">
        {mode === 'casual' ? (
          <p className="text-[13px] leading-snug text-muted">
            Normies score each genre&apos;s standard card: a horror film adds Fear Factor, a
            documentary scores Editing in place of Writing. Switch to Cinephile to make your own.
          </p>
        ) : (
          <>
            <p className="text-[13px] leading-snug text-muted">
              Each genre starts from its standard: your usual rubric plus what the genre adds.
              Make one your own and it&apos;s used for that genre everywhere, solo and in all your
              groups.
            </p>
            {mine === null ? (
              <p className="py-4 text-[13px] text-muted">{error ? '' : 'Loading…'}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line/50">
                {GENRES.map((g) => {
                  const own = mine.get(g.key)
                  return (
                    <li key={g.key}>
                      <button
                        type="button"
                        onClick={() => setEditing(g.key)}
                        className="group flex min-h-12 w-full items-center gap-3 py-2.5 text-left transition-colors active:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium transition-colors group-hover:text-teal">
                            {g.label}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                            {own ? 'Your own rubric' : g.change ? `Standard: ${g.change}` : 'Standard: your usual rubric'}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                            own ? 'border-gold/40 bg-gold/10 text-gold' : 'border-line text-muted'
                          }`}
                        >
                          {own ? 'Yours' : 'Standard'}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}

      {editing && (
        <GenreRubricSheet
          userId={userId}
          genre={editing}
          initial={mine?.get(editing) ?? null}
          onSaved={(rows) => {
            setMine((prev) => new Map(prev ?? []).set(editing, rows))
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
