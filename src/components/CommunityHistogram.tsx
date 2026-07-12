import { scoreColor } from '../lib/scoreColor'

interface CommunityHistogramProps {
  /** 10 slots: bins[i] = how many rated (i + 1). */
  bins: number[]
  /** The community average (Mashed), 1–10, for the marker. */
  mashed: number | null
}

// A Letterboxd-style rating distribution: one bar per score 1–10 along the
// app's coral→gold→lime ramp, so consensus vs. spread reads at a glance —
// the same "agreement as headline" idea the group Reveal is built on.
export function CommunityHistogram({ bins, mashed }: CommunityHistogramProps) {
  const total = bins.reduce((sum, n) => sum + n, 0)
  if (total === 0) return null
  const max = Math.max(...bins)

  return (
    <div className="mt-4 border-t border-line/60 pt-4">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          How everyone scored it
        </p>
        <p className="font-mono text-[10px] text-muted">
          {total} {total === 1 ? 'rating' : 'ratings'}
        </p>
      </div>

      <div className="relative flex h-16 items-end gap-[3px]">
        {bins.map((n, i) => {
          const score = i + 1
          const heightPct = max > 0 ? (n / max) * 100 : 0
          return (
            <div
              key={score}
              className="group relative flex-1"
              style={{ height: '100%' }}
              title={`${score}: ${n} ${n === 1 ? 'rating' : 'ratings'}`}
            >
              <div className="absolute bottom-0 flex w-full flex-col justify-end" style={{ height: '100%' }}>
                <div
                  className="w-full rounded-t-[3px] transition-all"
                  style={{
                    height: n > 0 ? `max(6px, ${heightPct}%)` : '2px',
                    backgroundColor: n > 0 ? scoreColor(score) : 'var(--color-line)',
                    opacity: n > 0 ? 1 : 0.5,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between px-0.5 font-mono text-[9px] text-muted">
        <span>1</span>
        {mashed !== null && (
          <span className="text-teal">avg {mashed.toFixed(1)}</span>
        )}
        <span>10</span>
      </div>
    </div>
  )
}
