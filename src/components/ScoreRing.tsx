import { useEffect, useState } from 'react'
import { formatScore } from '../lib/scoring'

interface ScoreRingProps {
  value: number | null
  max?: number
  label?: string
  size?: number
  stroke?: number
}

// The signature Mashed gauge: a teal arc that fills to the consensus score
// while the number counts up beneath it. Both effects collapse to an instant
// jump under prefers-reduced-motion (the arc via the global CSS guard, the
// count-up explicitly here).
export function ScoreRing({
  value,
  max = 10,
  label = 'Mashed',
  size = 188,
  stroke = 13,
}: ScoreRingProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const fraction = Math.max(0, Math.min(1, (value ?? 0) / max))
  const target = circumference * (1 - fraction)

  // Arc: start empty, then animate to the target offset after mount.
  const [offset, setOffset] = useState(circumference)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(target))
    return () => cancelAnimationFrame(id)
  }, [target])

  // Number: count up 0 -> value in sync with the arc.
  const [shown, setShown] = useState<number | null>(value === null ? null : 0)
  useEffect(() => {
    if (value === null) {
      setShown(null)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value)
      return
    }
    const start = performance.now()
    const duration = 1100
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(value * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // Guarantee the final value even if rAF is throttled (e.g. a backgrounded
    // tab never fires the frames) — the number must never freeze mid-count.
    const settle = setTimeout(() => setShown(value), duration + 100)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
    }
  }, [value])

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Mashed score ${formatScore(value)} out of ${max}`}
    >
      {/* soft glow behind the arc */}
      <span
        aria-hidden
        className="absolute inset-3 rounded-full blur-2xl"
        style={{ backgroundColor: 'color-mix(in oklab, var(--color-teal) 17%, transparent)' }}
      />
      <svg width={size} height={size} className="relative -rotate-90">
        <defs>
          <linearGradient id="mp-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6FE3DB" />
            <stop offset="1" stopColor="#3FA9A2" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#mp-ring)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.2, 0.7, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="tabular font-display font-semibold leading-none text-teal"
          style={{ fontSize: Math.round(size * 0.31) }}
        >
          {formatScore(shown)}
        </span>
        <span className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.35em] text-teal">
          {label}
        </span>
      </div>
    </div>
  )
}
