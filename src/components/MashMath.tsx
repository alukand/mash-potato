import { useState } from 'react'
import { formatScore, memberWeightedScore } from '../lib/scoring'
import type { MemberScorecard } from '../lib/scoring'
import type { SessionRubricEntry } from '../lib/api'
import { weightsFromRubric } from '../lib/mapping'
import { scoreColor } from '../lib/scoreColor'

interface MashMathProps {
  rubric: SessionRubricEntry[]
  /** Locked scorecards only. */
  scorecards: MemberScorecard[]
  userId: string
  memberName: (id: string) => string
  mashed: number | null
}

// "See the math": a staged walkthrough of exactly how the Mashed score is
// built — your scores × the rubric's weights, summed, then averaged across
// everyone who locked in. Pure presentation; all math comes from scoring.ts.
export function MashMath({ rubric, scorecards, userId, memberName, mashed }: MashMathProps) {
  const [open, setOpen] = useState(false)

  const weights = weightsFromRubric(rubric)
  const weightTotal = rubric.reduce((sum, e) => sum + e.weight, 0)
  const myCard = scorecards.find((s) => s.memberId === userId) ?? scorecards[0]
  const myLabel = myCard?.memberId === userId ? 'Your' : `${memberName(myCard?.memberId ?? '')}'s`

  if (!myCard || rubric.length === 0) return null

  const rows = rubric
    .filter((e) => typeof myCard.scores[e.key] === 'number')
    .map((e) => ({
      key: e.key,
      label: e.label,
      score: myCard.scores[e.key],
      pct: weightTotal > 0 ? (e.weight / weightTotal) * 100 : 0,
    }))
  const myWeighted = memberWeightedScore(myCard.scores, weights)

  // Staggered entrances: each step waits for the previous one.
  const delay = (i: number) => ({ animationDelay: `${i * 260}ms` })
  let step = 0

  return (
    <section className="mp-rise mt-7" style={{ animationDelay: '120ms' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface-2 px-4 py-3 text-left transition-colors hover:border-teal/50"
      >
        <span className="text-[13px] font-semibold">How the Mashed score works</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mp-card mt-2 rounded-[22px] p-5">
          {/* step 1: your scores × weights */}
          <p className="mp-rise font-mono text-[10px] uppercase tracking-[0.2em] text-muted" style={delay(step)}>
            1. {myLabel} scores × the group's weights
          </p>
          <div className="mt-2">
            {rows.map((r) => {
              step += 1
              return (
                <div
                  key={r.key}
                  className="mp-rise flex items-baseline justify-between border-b border-line/40 py-1.5 last:border-0"
                  style={delay(step)}
                >
                  <span className="min-w-0 truncate text-[12px]">{r.label}</span>
                  <span className="tabular shrink-0 font-mono text-[12px] text-muted">
                    <span style={{ color: scoreColor(r.score) }}>{r.score}</span>
                    {' × '}
                    {Math.round(r.pct)}%
                    {' = '}
                    <span className="text-text">{((r.score * r.pct) / 100).toFixed(1)}</span>
                  </span>
                </div>
              )
            })}
          </div>

          {/* step 2: sum -> weighted score */}
          <p
            className="mp-rise mt-3 text-right font-mono text-[12px] text-muted"
            style={delay((step += 1))}
          >
            added up = <span className="font-bold text-gold">{formatScore(myWeighted)}</span>{' '}
            <span className="text-[10px] uppercase tracking-wide">{myLabel} weighted score</span>
          </p>

          {/* step 3: everyone's weighted scores */}
          <p
            className="mp-rise mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted"
            style={delay((step += 1))}
          >
            2. Everyone who locked in
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {scorecards.map((s) => {
              step += 1
              const w = memberWeightedScore(s.scores, weights)
              const isYou = s.memberId === userId
              return (
                <span
                  key={s.memberId}
                  className={`mp-rise rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                    isYou ? 'border-gold/40 bg-gold/10 text-gold' : 'border-line bg-surface-2 text-muted'
                  }`}
                  style={delay(step)}
                >
                  {memberName(s.memberId)} {formatScore(w)}
                </span>
              )
            })}
          </div>

          {/* step 4: average -> Mashed */}
          <p
            className="mp-rise mt-4 border-t border-line/60 pt-3 text-right font-mono text-[13px]"
            style={delay((step += 1))}
          >
            <span className="text-muted">
              average of {scorecards.length} ={' '}
            </span>
            <span className="font-bold text-teal">{formatScore(mashed)}</span>{' '}
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal">
              Mashed
            </span>
          </p>

          <p className="mp-rise mt-3 text-[12px] leading-snug text-muted" style={delay((step += 1))}>
            That's the whole trick: categories your group weights higher move the score more, and
            the Mashed score is simply everyone's weighted score averaged.
          </p>
        </div>
      )}
    </section>
  )
}
