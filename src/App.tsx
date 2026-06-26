import { analyze, formatScore, CATEGORY_LABELS, CATEGORY_IDS } from './lib/scoring'
import {
  sampleScorecards,
  sampleWeights,
  sampleTitle,
  memberName,
  CURRENT_MEMBER_ID,
} from './lib/fixtures'

// M1: the card's numbers are now derived by the tested scoring core
// (src/lib/scoring.ts) from sample fixtures. Still no backend or real data.

function App() {
  const result = analyze(sampleScorecards, sampleWeights)
  const youWeighted =
    result.perMember.find((m) => m.memberId === CURRENT_MEMBER_ID)?.weighted ?? null
  const weightTotal = CATEGORY_IDS.reduce((sum, id) => sum + sampleWeights[id], 0)

  const clashLabel = result.mostContested
    ? CATEGORY_LABELS[result.mostContested.category]
    : '—'
  const alignedLabel = result.mostUnited
    ? CATEGORY_LABELS[result.mostUnited.category]
    : '—'

  return (
    <div className="min-h-dvh bg-bg text-text">
      {/* Single mobile-first column, capped at ~480px */}
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col px-5 pb-8">
        {/* ---- Header ---- */}
        <header className="flex items-center gap-3 pt-8 pb-6">
          <span aria-hidden className="text-3xl leading-none">
            🥔
          </span>
          <div>
            <h1 className="font-display text-[28px] font-semibold leading-none tracking-tight">
              Mash Potato
            </h1>
            <p className="mt-1 text-sm text-muted">
              One group. One rubric. One Mashed score.
            </p>
          </div>
        </header>

        {/* ---- Hero: the Mashed consensus ---- */}
        <section className="rounded-3xl border border-line bg-surface p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
                Sample title
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-semibold leading-tight">
                {sampleTitle.name}
              </h2>
              <p className="mt-0.5 font-mono text-xs text-muted">
                {sampleTitle.year} · {sampleTitle.mediaType === 'movie' ? 'Film' : 'TV'}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-[11px] text-muted">
              {result.lockedCount} / {result.totalCount} in
            </span>
          </div>

          <div className="mt-6 flex items-end justify-between">
            <div className="flex flex-col">
              {/* The big consensus number — always Fraunces, always teal, always "Mashed" */}
              <span className="font-display text-[72px] font-semibold leading-[0.9] text-teal">
                {formatScore(result.mashed)}
              </span>
              <span className="mt-2 text-xs font-bold uppercase tracking-[0.3em] text-teal">
                Mashed
              </span>
            </div>
            <div className="mb-1 flex flex-col items-end gap-1.5 font-mono text-sm">
              <span className="text-gold">you · {formatScore(youWeighted)}</span>
              <span className="text-muted">spread · {formatScore(result.spread)}</span>
            </div>
          </div>
        </section>

        {/* ---- Two-tone legend (gold = personal, teal = group) ---- */}
        <div className="mt-3 flex items-center gap-4 px-1 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-gold" /> your score
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-teal" /> group “Mashed”
          </span>
        </div>

        {/* ---- The Reveal headline: where the group agreed vs clashed (the moat) ---- */}
        <section className="mt-5 rounded-3xl border border-line bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
            The Reveal
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Most clash
              </span>
              <span className="font-display text-lg font-semibold text-coral">
                {clashLabel}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Most aligned
              </span>
              <span className="font-display text-lg font-semibold text-teal">
                {alignedLabel}
              </span>
            </div>
          </div>
          {result.outlier && (
            <p className="mt-3 text-sm text-muted">
              Outlier · <span className="text-text">{memberName(result.outlier.memberId)}</span>{' '}
              rated {CATEGORY_LABELS[result.outlier.category]}{' '}
              <span className="font-mono text-gold">{result.outlier.score}</span> vs group{' '}
              <span className="font-mono">{formatScore(result.outlier.mean)}</span>
            </p>
          )}
        </section>

        {/* ---- Group rubric (weights live on the GROUP) ---- */}
        <section className="mt-5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
              Group rubric
            </p>
            <p className="font-mono text-[11px] text-muted">weights · 100%</p>
          </div>
          <ul className="flex flex-col gap-2">
            {CATEGORY_IDS.map((id) => (
              <li
                key={id}
                className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5"
              >
                <span className="text-sm">{CATEGORY_LABELS[id]}</span>
                <span className="font-mono text-sm text-muted">
                  {Math.round((sampleWeights[id] / weightTotal) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Footer ---- */}
        <footer className="mt-auto pt-8 text-center font-mono text-[11px] text-muted">
          M1 · scoring core wired — computed from fixtures, no backend yet
        </footer>
      </div>
    </div>
  )
}

export default App
