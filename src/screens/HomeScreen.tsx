import { analyze, categoryStat, formatScore, CATEGORY_LABELS, CATEGORY_IDS } from '../lib/scoring'
import { scoreColor } from '../lib/scoreColor'
import {
  sampleScorecards,
  sampleWeights,
  sampleTitle,
  memberName,
  memberColor,
  CURRENT_MEMBER_ID,
} from '../lib/fixtures'
import { ScoreRing } from '../components/ScoreRing'

// The latest REVEALED session: the Mashed result + where the group split.
// All numbers come from the tested scoring core over sample fixtures.

/** Position of a 1..10 score along the plot track, as a percentage. */
const pct = (score: number) => ((score - 1) / 9) * 100

export function HomeScreen() {
  const locked = sampleScorecards.filter((s) => s.locked)
  const result = analyze(sampleScorecards, sampleWeights)
  const youWeighted =
    result.perMember.find((m) => m.memberId === CURRENT_MEMBER_ID)?.weighted ?? null
  const delta =
    youWeighted !== null && result.mashed !== null ? youWeighted - result.mashed : null
  const weightTotal = CATEGORY_IDS.reduce((sum, id) => sum + sampleWeights[id], 0)

  const leaderboard = [...result.perMember].sort((a, b) => b.weighted - a.weighted)

  const categories = CATEGORY_IDS.map((id) => {
    const stat = categoryStat(id, locked)
    return {
      id,
      label: CATEGORY_LABELS[id],
      weightPct: Math.round((sampleWeights[id] / weightTotal) * 100),
      mean: stat?.mean ?? 0,
      min: stat?.min ?? 0,
      max: stat?.max ?? 0,
      dots: locked.map((s) => ({ memberId: s.memberId, score: s.scores[id] })),
    }
  })

  const aligned = result.mostUnited
  const clash = result.mostContested
  const outlier = result.outlier

  return (
    <>
      {/* ---- Hero: title + Mashed ring + member leaderboard ---- */}
      <section
        className="mp-rise rounded-[26px] border border-line/70 p-6 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.95)]"
        style={{ backgroundImage: 'linear-gradient(to bottom, var(--color-surface), #1b1622)' }}
      >
        <div className="flex items-start gap-4">
          {/* Poster placeholder until TMDB metadata lands (later milestone). */}
          <div
            aria-hidden
            className="grid h-[84px] w-14 shrink-0 place-items-center rounded-xl font-display text-2xl font-semibold text-bg"
            style={{ backgroundImage: 'linear-gradient(160deg, #E7B24E, #E07A5F)' }}
          >
            {sampleTitle.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                {sampleTitle.mediaType === 'movie' ? 'Film' : 'TV'} · {sampleTitle.year}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-teal">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                Revealed
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-[27px] font-semibold leading-[1.05]">
              {sampleTitle.name}
            </h2>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <ScoreRing value={result.mashed} size={150} stroke={11} />
          <ul className="flex min-w-0 flex-1 flex-col gap-1">
            {leaderboard.map((m) => {
              const isYou = m.memberId === CURRENT_MEMBER_ID
              return (
                <li
                  key={m.memberId}
                  className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                    isYou ? 'bg-gold/10' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: memberColor(m.memberId) }}
                    />
                    <span
                      className={`truncate text-[13px] ${isYou ? 'font-semibold text-gold' : ''}`}
                    >
                      {isYou ? 'You' : memberName(m.memberId)}
                    </span>
                  </span>
                  <span
                    className={`tabular font-mono text-[13px] ${
                      isYou ? 'font-semibold text-gold' : 'text-muted'
                    }`}
                  >
                    {formatScore(m.weighted)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-line/60 pt-4 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="text-muted">
            Spread <span className="text-text">{formatScore(result.spread)}</span>
          </span>
          <span className="text-gold">
            You {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${formatScore(Math.abs(delta))}`} vs group
          </span>
          <span className="text-muted">
            <span className="text-text">
              {result.lockedCount}/{result.totalCount}
            </span>{' '}
            locked
          </span>
        </div>
      </section>

      {/* ---- The Reveal: disagreement as a headline (the moat) ---- */}
      {aligned && clash && (
        <section className="mp-rise mt-8 px-1" style={{ animationDelay: '80ms' }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">
            The Reveal
          </p>
          <h3 className="mt-2.5 font-display text-[25px] font-medium leading-[1.25]">
            United on <span className="text-teal">{CATEGORY_LABELS[aligned.category]}</span> —
            split over <span className="text-coral">{CATEGORY_LABELS[clash.category]}</span>.
          </h3>
          <p className="mt-2 font-mono text-[11px] text-muted">
            agreement range {aligned.range} · clash range {clash.range}
          </p>
          {outlier && (
            <div className="mt-4 flex items-center gap-2.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-bg"
                style={{ backgroundColor: memberColor(outlier.memberId) }}
              >
                {memberName(outlier.memberId).charAt(0)}
              </span>
              <p className="text-[13px] leading-snug text-muted">
                <span className="font-semibold text-text">{memberName(outlier.memberId)}</span>{' '}
                broke away — scored {CATEGORY_LABELS[outlier.category]}{' '}
                <span className="tabular font-mono text-gold">{outlier.score}</span> against the
                group's <span className="tabular font-mono">{formatScore(outlier.mean)}</span>
              </p>
            </div>
          )}
        </section>
      )}

      {/* ---- Category dot plot: every member's score, per category ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '160ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Category breakdown
          </p>
          <p className="font-mono text-[10px] text-muted">1 – 10</p>
        </div>
        <div className="rounded-[26px] border border-line bg-surface px-4 pb-1 pt-1">
          <ul>
            {categories.map((c, i) => (
              <li
                key={c.id}
                className={`flex items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}
              >
                <div className="w-[96px] shrink-0">
                  <p className="text-[13px] font-medium leading-tight">{c.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">weight {c.weightPct}%</p>
                </div>
                <div className="relative h-5 flex-1">
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line/50" />
                  <span
                    className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-line/80"
                    style={{ left: `${pct(c.min)}%`, width: `${pct(c.max) - pct(c.min)}%` }}
                  />
                  {c.dots.map((d) => (
                    <span
                      key={d.memberId}
                      className={`absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ${
                        d.memberId === CURRENT_MEMBER_ID ? 'bg-gold' : 'bg-muted'
                      }`}
                      style={{ left: `${pct(d.score)}%` }}
                    />
                  ))}
                  <span
                    className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal"
                    style={{ left: `${pct(c.mean)}%` }}
                  />
                </div>
                <span
                  className="tabular w-8 shrink-0 text-right font-mono text-[13px] font-semibold"
                  style={{ color: scoreColor(c.mean) }}
                >
                  {c.mean.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-4 border-t border-line/50 px-1 pb-3 pt-3 font-mono text-[10px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-gold" /> you
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-muted" /> others
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-[3px] rounded-full bg-teal" /> group mean
            </span>
          </div>
        </div>
      </section>
    </>
  )
}
