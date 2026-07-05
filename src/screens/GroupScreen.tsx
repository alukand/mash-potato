import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { CATEGORY_LABELS, CATEGORY_IDS } from '../lib/scoring'
import type { RubricWeights } from '../lib/scoring'
import { fetchWeights, saveWeights, signOut } from '../lib/api'
import type { GroupInfo, MemberInfo } from '../lib/api'
import { AVATAR_PALETTE } from '../lib/palette'

interface GroupScreenProps {
  group: GroupInfo
  members: MemberInfo[]
  userId: string
}

// Live group view. Members + rubric come from Postgres through RLS; the
// weight editor is owner-only (the rubric_weights policy enforces it — the
// UI hiding the sliders is just courtesy).

export function GroupScreen({ group, members, userId }: GroupScreenProps) {
  const isOwner = group.role === 'owner'

  const [saved, setSaved] = useState<RubricWeights | null>(null)
  const [weights, setWeights] = useState<RubricWeights | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchWeights(group.id)
      .then((w) => {
        if (cancelled) return
        setSaved(w)
        setWeights(w)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Load failed'))
    return () => {
      cancelled = true
    }
  }, [group.id])

  const dirty =
    weights !== null && saved !== null && CATEGORY_IDS.some((id) => weights[id] !== saved[id])
  const total = weights === null ? 0 : CATEGORY_IDS.reduce((sum, id) => sum + weights[id], 0)
  const maxWeight = weights === null ? 1 : Math.max(1, ...CATEGORY_IDS.map((id) => weights[id]))

  async function handleSave() {
    if (weights === null) return
    setBusy(true)
    setError(null)
    try {
      await saveWeights(group.id, weights)
      setSaved(weights)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* ---- Members ---- */}
      <section className="mp-rise">
        <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Members
        </p>
        <div className="mp-card rounded-[26px] px-4">
          <ul>
            {members.map((m, i) => {
              const isYou = m.userId === userId
              return (
                <li
                  key={m.userId}
                  className={`flex items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[13px] font-bold text-bg"
                    style={{ backgroundColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
                  >
                    {m.displayName.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate text-[14px] font-medium">
                    {m.displayName}
                    {isYou && <span className="ml-1.5 text-muted">(you)</span>}
                  </span>
                  {m.role === 'owner' && (
                    <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                      Owner
                    </span>
                  )}
                </li>
              )
            })}
            {members.length === 0 && (
              <li className="py-3.5 text-[13px] text-muted">Loading members…</li>
            )}
          </ul>
        </div>
        <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
          Inviting friends arrives with the next milestone — for now the crew is just you.
        </p>
      </section>

      {/* ---- The shared rubric ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '80ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Group rubric
          </p>
          <p className="tabular font-mono text-[10px] text-muted">
            total <span className={total === 0 ? 'text-coral' : 'text-text'}>{total}</span>
          </p>
        </div>

        <div className="mp-card rounded-[26px] px-5 py-1">
          {weights === null ? (
            <p className="py-4 text-[13px] text-muted">Loading rubric…</p>
          ) : (
            CATEGORY_IDS.map((id, i) => (
              <div key={id} className={`py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <p className="text-[13px] font-medium">{CATEGORY_LABELS[id]}</p>
                  <span className="tabular font-mono text-[13px] font-semibold text-teal">
                    {weights[id]}
                  </span>
                </div>
                {isOwner ? (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={weights[id]}
                    disabled={busy}
                    aria-label={`${CATEGORY_LABELS[id]} weight`}
                    onChange={(e) =>
                      setWeights((prev) =>
                        prev === null ? prev : { ...prev, [id]: Number(e.target.value) },
                      )
                    }
                    className="mp-slider mt-1"
                    style={
                      {
                        '--thumb': 'var(--color-teal)',
                        '--fill': weights[id],
                      } as CSSProperties
                    }
                  />
                ) : (
                  <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(weights[id] / maxWeight) * 100}%`,
                        backgroundImage: 'linear-gradient(90deg, #3FA9A2, #6FE3DB)',
                      }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 px-2 text-[12px] leading-snug text-coral">
            {error}
          </p>
        )}

        {isOwner && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || !dirty || total === 0}
            className={`mt-4 w-full rounded-full py-3 text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-45 ${
              justSaved
                ? 'border border-teal/30 bg-teal/10 text-teal'
                : 'text-bg shadow-[0_12px_32px_-12px_rgba(81,197,190,0.45),inset_0_1px_0_rgba(255,255,255,0.3)]'
            }`}
            style={
              justSaved
                ? undefined
                : { backgroundImage: 'linear-gradient(180deg, #6FE3DB, #3FA9A2)' }
            }
          >
            {justSaved ? 'Saved ✓' : busy ? 'Saving…' : 'Save weights'}
          </button>
        )}
        <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
          Weights are how much each category counts — they don't need to sum to 100; scores
          normalise automatically.
        </p>
      </section>

      {/* ---- Sign out ---- */}
      <section className="mp-rise mt-8 text-center" style={{ animationDelay: '160ms' }}>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-full border border-line px-5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
        >
          Sign out
        </button>
      </section>
    </>
  )
}
