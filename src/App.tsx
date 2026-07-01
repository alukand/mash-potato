import { analyze, categoryStat, formatScore, CATEGORY_LABELS, CATEGORY_IDS } from './lib/scoring'
import { scoreColor } from './lib/scoreColor'
import {
  sampleScorecards,
  sampleWeights,
  sampleTitle,
  sampleMembers,
  memberName,
  CURRENT_MEMBER_ID,
} from './lib/fixtures'
import { Logo } from './components/Logo'
import { ScoreRing } from './components/ScoreRing'
import { BottomNav } from './components/BottomNav'

// Sample-data home screen. Numbers come from the tested scoring core
// (src/lib/scoring.ts); still no backend — Supabase wiring is a later milestone.

const AVATAR_COLORS = ['#e7b24e', '#51c5be', '#e07a5f', '#9c93ab']

function App() {
  const locked = sampleScorecards.filter((s) => s.locked)
  const result = analyze(sampleScorecards, sampleWeights)
  const youWeighted =
    result.perMember.find((m) => m.memberId === CURRENT_MEMBER_ID)?.weighted ?? null
  const weightTotal = CATEGORY_IDS.reduce((sum, id) => sum + sampleWeights[id], 0)

  const categories = CATEGORY_IDS.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    weightPct: Math.round((sampleWeights[id] / weightTotal) * 100),
    mean: categoryStat(id, locked)?.mean ?? 0,
  }))

  const clash = result.mostContested
  const aligned = result.mostUnited
  const outlier = result.outlier

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-[480px] px-5 pb-28">
        {/* ---- Header ---- */}
        <header className="flex items-center justify-between pt-7 pb-5">
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9" />
            <div>
              <h1 className="font-display text-[26px] font-semibold leading-none tracking-tight">
                Mash Potato
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Film Club · {sampleMembers.length} members
              </p>
            </div>
          </div>
          <div className="flex -space-x-2">
            {sampleMembers.map((m, i) => (
              <span
                key={m.id}
                title={m.name}
                className="grid h-8 w-8 place-items-center rounded-full border-2 border-bg font-mono text-[11px] font-bold text-bg"
                style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
              >
                {m.name.charAt(0)}
              </span>
            ))}
          </div>
        </header>

        {/* ---- Hero: the Mashed consensus ---- */}
        <section
          className="mp-rise rounded-[26px] border border-line p-6 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.95)]"
          style={{ backgroundImage: 'linear-gradient(to bottom, var(--color-surface), #1b1622)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                {sampleTitle.mediaType === 'movie' ? 'Film' : 'TV'} · {sampleTitle.year}
              </p>
              <h2 className="mt-1 font-display text-[26px] font-semibold leading-tight">
                {sampleTitle.name}
              </h2>
            </div>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              Revealed
            </span>
          </div>

          <div className="mt-5 flex justify-center">
            <ScoreRing value={result.mashed} />
          </div>

          {/* You vs the group */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between font-mono text-[11px]">
              <span className="text-gold">You {formatScore(youWeighted)}</span>
              <span className="text-muted">Spread {formatScore(result.spread)}</span>
              <span className="text-teal">Group {formatScore(result.mashed)}</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-surface-2">
              <span
                className="absolute -top-[5px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-surface bg-teal"
                style={{ left: `${(result.mashed ?? 0) * 10}%` }}
              />
              <span
                className="absolute -top-[5px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-surface bg-gold"
                style={{ left: `${(youWeighted ?? 0) * 10}%` }}
              />
            </div>
          </div>
        </section>

        {/* ---- The Reveal: agreement vs clash (the moat) ---- */}
        <section
          className="mp-rise mt-4 rounded-[26px] border border-line bg-surface p-5"
          style={{ animationDelay: '80ms' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              The Reveal
            </p>
            <span className="font-mono text-[10px] text-muted">where you landed</span>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
              <span className="h-9 w-1 shrink-0 rounded-full bg-teal" />
              <div className="flex-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Most aligned
                </p>
                <p className="mt-0.5 font-display text-lg font-semibold leading-tight text-teal">
                  {aligned ? CATEGORY_LABELS[aligned.category] : '—'}
                </p>
              </div>
              <span className="font-mono text-xs text-muted">
                range {aligned ? aligned.range : '—'}
              </span>
            </div>

            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
              <span className="h-9 w-1 shrink-0 rounded-full bg-coral" />
              <div className="flex-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  Most clash
                </p>
                <p className="mt-0.5 font-display text-lg font-semibold leading-tight text-coral">
                  {clash ? CATEGORY_LABELS[clash.category] : '—'}
                </p>
              </div>
              <span className="font-mono text-xs text-muted">
                range {clash ? clash.range : '—'}
              </span>
            </div>
          </div>

          {outlier && (
            <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-line bg-surface-2/40 px-3.5 py-2.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-bg"
                style={{ backgroundColor: '#e07a5f' }}
              >
                {memberName(outlier.memberId).charAt(0)}
              </span>
              <p className="text-[13px] leading-snug text-muted">
                <span className="font-semibold text-text">{memberName(outlier.memberId)}</span>{' '}
                broke away on {CATEGORY_LABELS[outlier.category]} —{' '}
                <span className="tabular font-mono text-gold">{outlier.score}</span> vs group{' '}
                <span className="tabular font-mono">{formatScore(outlier.mean)}</span>
              </p>
            </div>
          )}
        </section>

        {/* ---- Category breakdown (group avg score + weight) ---- */}
        <section className="mp-rise mt-4" style={{ animationDelay: '160ms' }}>
          <div className="mb-3 flex items-baseline justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Category breakdown
            </p>
            <p className="font-mono text-[10px] text-muted">score · weight</p>
          </div>
          <div className="rounded-[26px] border border-line bg-surface px-3">
            <ul>
              {categories.map((c, i) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-line/60' : ''}`}
                >
                  <div className="w-[104px] shrink-0">
                    <p className="text-sm font-medium leading-tight">{c.label}</p>
                    <p className="font-mono text-[10px] text-muted">weight {c.weightPct}%</p>
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.mean * 10}%`, backgroundColor: scoreColor(c.mean) }}
                    />
                  </div>
                  <span
                    className="tabular w-8 text-right font-mono text-sm font-semibold"
                    style={{ color: scoreColor(c.mean) }}
                  >
                    {c.mean.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <p
          className="mp-rise mt-6 text-center font-mono text-[10px] text-muted"
          style={{ animationDelay: '220ms' }}
        >
          M2 · sample data · scoring core + Supabase schema in place
        </p>
      </div>

      <BottomNav />
    </div>
  )
}

export default App
