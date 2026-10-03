import { useState } from 'react'
import { setGroupGames } from '../lib/api'
import type { GroupInfo } from '../lib/api'
import type { TakesMode } from '../lib/roundGames'

// How this group plays its rounds (20261003120000): the fight over the
// biggest split, and the best-take vote. The owner switches them; everyone
// else reads how it is set. Mounted with a per-group key, so the local copy
// starts fresh for each group.

const TAKES_OPTIONS: { mode: TakesMode; label: string; blurb: string }[] = [
  { mode: 'off', label: 'Off', blurb: 'No takes. The scorecard keeps its one-liner.' },
  {
    mode: 'blind',
    label: 'Blind',
    blurb: "Written with your scorecard and sealed like your scores. Everyone's drops at the reveal.",
  },
  {
    mode: 'after',
    label: 'After the reveal',
    blurb: 'Written once the scores are out, so a take can answer the reveal.',
  },
]

export function GroupGamesSettings({
  group,
  isOwner,
  onChanged,
}: {
  group: GroupInfo
  isOwner: boolean
  /** Refetch the group list so every screen sees the new settings. */
  onChanged: () => Promise<void>
}) {
  const [fights, setFights] = useState(group.fights)
  const [takesMode, setTakesMode] = useState<TakesMode>(group.takesMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  async function save(patch: { fights?: boolean; takesMode?: TakesMode }, note: string) {
    setBusy(true)
    setError(null)
    setSavedNote(null)
    const before = { fights, takesMode }
    if (patch.fights !== undefined) setFights(patch.fights)
    if (patch.takesMode !== undefined) setTakesMode(patch.takesMode)
    try {
      await setGroupGames(group.id, patch)
      setSavedNote(note)
      await onChanged()
    } catch (err) {
      setFights(before.fights)
      setTakesMode(before.takesMode)
      setError(err instanceof Error ? err.message : 'Could not change the games.')
    } finally {
      setBusy(false)
    }
  }

  const pill = (on: boolean) =>
    `min-h-11 flex-1 rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
      on ? 'border-teal/50 bg-teal/10 text-teal' : 'border-line text-muted hover:text-text active:bg-surface-2'
    }`

  return (
    <section className="mp-rise mt-7" style={{ animationDelay: '110ms' }}>
      <div className="mb-3 flex items-baseline justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Round games</p>
      </div>
      <div className="mp-card rounded-[26px] p-5">
        <p className="text-[14px] font-semibold">Fight over the biggest split</p>
        <p className="mt-1 text-[13px] leading-snug text-muted">
          When a reveal splits three points or more on one category, the top and bottom scores
          each make one argument and everyone else who played picks the winner. It needs three
          locked cards: two to fight, one to judge.
        </p>
        {isOwner ? (
          <div role="radiogroup" aria-label="Fights" className="mt-3 flex gap-2">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={fights === value}
                disabled={busy}
                onClick={() =>
                  fights !== value &&
                  void save({ fights: value }, value ? 'Fights are on.' : 'Fights are off.')
                }
                className={pill(fights === value)}
              >
                {value ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-teal">
            {fights ? 'On' : 'Off'}
          </p>
        )}

        <div className="mt-5 border-t border-line/50 pt-4">
          <p className="text-[14px] font-semibold">Best take</p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            Everyone writes a take and the group votes on the best one. Votes stay sealed and
            close a day after the reveal.
          </p>
          {isOwner ? (
            <div role="radiogroup" aria-label="Best take" className="mt-3 flex gap-2">
              {TAKES_OPTIONS.map((o) => (
                <button
                  key={o.mode}
                  type="button"
                  role="radio"
                  aria-checked={takesMode === o.mode}
                  disabled={busy}
                  onClick={() =>
                    takesMode !== o.mode &&
                    void save(
                      { takesMode: o.mode },
                      o.mode === 'off' ? 'Takes are off.' : 'Saved. It starts with the next round.',
                    )
                  }
                  className={pill(takesMode === o.mode)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-teal">
              {TAKES_OPTIONS.find((o) => o.mode === takesMode)?.label}
            </p>
          )}
          <p className="mt-2 text-[12px] leading-snug text-muted">
            {TAKES_OPTIONS.find((o) => o.mode === takesMode)?.blurb} A round keeps the setting it
            started with.
          </p>
        </div>

        {!isOwner && (
          <p className="mt-4 text-[12px] leading-snug text-muted">
            The group owner sets these.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[13px] leading-snug text-coral">
            {error}
          </p>
        )}
        {savedNote && !error && (
          <p role="status" className="mp-save-confirm mt-3 text-[13px] leading-snug text-teal">
            {savedNote}
          </p>
        )}
      </div>
    </section>
  )
}
