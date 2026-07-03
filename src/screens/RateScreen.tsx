import { useState } from 'react'
import type { CSSProperties } from 'react'
import { memberWeightedScore, formatScore, CATEGORY_LABELS, CATEGORY_IDS } from '../lib/scoring'
import type { CategoryScores } from '../lib/scoring'
import { scoreColor } from '../lib/scoreColor'
import {
  sampleWeights,
  sampleBlindTitle,
  sampleMembers,
  blindLockedMemberIds,
  memberName,
  memberColor,
  CURRENT_MEMBER_ID,
} from '../lib/fixtures'

// The blind scoring flow: rate the five categories, watch your weighted score
// compute live (scoring.ts), lock in. Local state only for now — persistence
// and the real reveal arrive with Supabase. Lock STATUS is shown for others;
// their scores never are (that's the RLS blind rule, enforced server-side).

const INITIAL_SCORES: CategoryScores = {
  story: 5,
  acting: 5,
  cinematography: 5,
  pacing: 5,
  scoreSound: 5,
}

export function RateScreen() {
  const [scores, setScores] = useState<CategoryScores>(INITIAL_SCORES)
  const [locked, setLocked] = useState(false)

  const weighted = memberWeightedScore(scores, sampleWeights)
  const weightTotal = CATEGORY_IDS.reduce((sum, id) => sum + sampleWeights[id], 0)

  const lockedIds = locked ? [...blindLockedMemberIds, CURRENT_MEMBER_ID] : blindLockedMemberIds
  const waiting = sampleMembers.filter((m) => !lockedIds.includes(m.id))

  return (
    <>
      {/* ---- Title being scored ---- */}
      <section className="mp-rise mp-card rounded-[26px] p-6">
        <div className="flex items-start gap-4">
          <div
            aria-hidden
            className="relative grid h-[84px] w-14 shrink-0 place-items-center overflow-hidden rounded-xl font-display text-2xl font-semibold text-bg"
            style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
          >
            {sampleBlindTitle.name.charAt(0)}
            <span className="mp-poster-grain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                Now scoring · {sampleBlindTitle.mediaType === 'movie' ? 'Film' : 'TV'} ·{' '}
                {sampleBlindTitle.year}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                Blind
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-[27px] font-semibold leading-[1.05]">
              {sampleBlindTitle.name}
            </h2>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-line/60 pt-4">
          <div>
            <span className="tabular font-display text-[44px] font-semibold leading-none text-gold">
              {formatScore(weighted)}
            </span>
            <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-gold">
              Your weighted
            </p>
          </div>
          <div className="mb-1 flex flex-col items-end gap-1.5">
            <div className="flex -space-x-1.5">
              {lockedIds.map((id) => (
                <span
                  key={id}
                  title={memberName(id)}
                  className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface font-mono text-[9px] font-bold text-bg"
                  style={{ backgroundColor: memberColor(id) }}
                >
                  {memberName(id).charAt(0)}
                </span>
              ))}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {lockedIds.length}/{sampleMembers.length} locked
            </p>
          </div>
        </div>
      </section>

      {/* ---- The five category sliders ---- */}
      <section className="mp-rise mt-4" style={{ animationDelay: '80ms' }}>
        <div className="mp-card rounded-[26px] px-5 py-1">
          {CATEGORY_IDS.map((id, i) => {
            const value = scores[id]
            const color = scoreColor(value)
            return (
              <div key={id} className={`py-4 ${i > 0 ? 'border-t border-line/50' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[14px] font-medium leading-tight">{CATEGORY_LABELS[id]}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      weight {Math.round((sampleWeights[id] / weightTotal) * 100)}%
                    </p>
                  </div>
                  <span
                    className="tabular font-mono text-xl font-bold"
                    style={{ color }}
                  >
                    {value}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={value}
                  disabled={locked}
                  aria-label={`${CATEGORY_LABELS[id]} score`}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [id]: Number(e.target.value) }))
                  }
                  className="mp-slider mt-1.5"
                  style={
                    { '--thumb': color, '--fill': ((value - 1) / 9) * 100 } as CSSProperties
                  }
                />
              </div>
            )
          })}
        </div>
      </section>

      {/* ---- Blind note + lock in ---- */}
      <section className="mp-rise mt-4" style={{ animationDelay: '160ms' }}>
        <div className="flex items-center gap-2.5 px-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <p className="text-[12px] leading-snug text-muted">
            Everyone scores blind — no one sees anyone's numbers until the whole group locks in
            and the Reveal drops.
          </p>
        </div>

        {locked ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-teal/30 bg-teal/10 py-3.5 text-[14px] font-semibold text-teal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m4.5 12.5 5 5 10-11" />
            </svg>
            Locked in — waiting on {waiting.map((m) => m.name).join(', ') || 'no one'}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLocked(true)}
            className="mt-4 w-full rounded-full py-3.5 text-[14px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-[0.98]"
            style={{ backgroundImage: 'linear-gradient(180deg, #F2CD77, #DFA338)' }}
          >
            Lock in your scores
          </button>
        )}
      </section>
    </>
  )
}
