// Mash Potato — M0 shell screen.
// Purpose: prove the theme + the three fonts load in a ~480px mobile column.
// This is static sample UI only — no data model, no backend, no real scores.

type RubricRow = { label: string; weight: number }

// The group's shared rubric (the moat: weights live on the GROUP). Static sample.
const rubric: RubricRow[] = [
  { label: 'Story', weight: 30 },
  { label: 'Acting', weight: 25 },
  { label: 'Cinematography', weight: 20 },
  { label: 'Pacing', weight: 15 },
  { label: 'Score & Sound', weight: 10 },
]

function App() {
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
                Dune: Part Two
              </h2>
              <p className="mt-0.5 font-mono text-xs text-muted">2024 · Film</p>
            </div>
            <span className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-[11px] text-muted">
              4 / 4 in
            </span>
          </div>

          <div className="mt-6 flex items-end justify-between">
            <div className="flex flex-col">
              {/* The big consensus number — always Fraunces, always teal, always "Mashed" */}
              <span className="font-display text-[72px] font-semibold leading-[0.9] text-teal">
                8.4
              </span>
              <span className="mt-2 text-xs font-bold uppercase tracking-[0.3em] text-teal">
                Mashed
              </span>
            </div>
            <div className="mb-1 flex flex-col items-end gap-1.5 font-mono text-sm">
              <span className="text-gold">you · 7.9</span>
              <span className="text-muted">spread · 2.1</span>
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

        {/* ---- Group rubric (static sample) ---- */}
        <section className="mt-7">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">
              Group rubric
            </p>
            <p className="font-mono text-[11px] text-muted">weights · 100%</p>
          </div>
          <ul className="flex flex-col gap-2">
            {rubric.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3.5"
              >
                <span className="text-sm">{row.label}</span>
                <span className="font-mono text-sm text-muted">{row.weight}%</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- Footer ---- */}
        <footer className="mt-auto pt-8 text-center font-mono text-[11px] text-muted">
          M0 · theme &amp; fonts check — no data yet
        </footer>
      </div>
    </div>
  )
}

export default App
