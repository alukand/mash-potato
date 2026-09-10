import type { CSSProperties } from 'react'

/** Purely visual feedback. No scores, state changes, sound or timed blocking. */
export function SuccessMark({ size = 40 }: { size?: number }) {
  return <span aria-hidden className="mp-success-mark grid shrink-0 place-items-center rounded-full bg-teal/15 text-teal" style={{ width: size, height: size }}>
    <svg width={size * .55} height={size * .55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path className="mp-check-draw" pathLength="1" d="m5 12 4 4L19 6" /></svg>
  </span>
}

export function RevealBurst() {
  return <span aria-hidden className="mp-reveal-burst pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
    {Array.from({ length: 12 }, (_, i) => <i key={i} className="mp-reveal-spark" style={{ '--angle': `${i * 30}deg`, '--distance': `${82 + (i % 3) * 23}px`, '--delay': `${(i % 3) * 35}ms`, '--spark': i % 3 === 0 ? 'var(--color-gold)' : 'var(--color-teal)' } as CSSProperties} />)}
  </span>
}

export function LoadingCards({ label = 'Getting things ready…' }: { label?: string }) {
  return <div role="status" className="py-3">
    <p className="mb-4 text-[13px] text-muted">{label}</p>
    <div aria-hidden className="space-y-4">{[0, 1].map((i) => <div key={i} className="flex gap-4 rounded-[22px] bg-surface p-5"><div className="mp-skeleton h-24 w-16 shrink-0 rounded-xl" /><div className="flex-1 space-y-3 pt-2"><div className="mp-skeleton h-3 w-2/3 rounded-full" /><div className="mp-skeleton h-5 w-full rounded-full" /><div className="mp-skeleton h-3 w-1/3 rounded-full" /></div></div>)}</div>
  </div>
}
