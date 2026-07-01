import { useEffect, useState } from 'react'
import { formatScore } from '../lib/scoring'

interface ScoreRingProps {
  value: number | null
  max?: number
  label?: string
  size?: number
  stroke?: number
}

// The signature Mashed gauge: a teal arc that fills to the consensus score,
// with the big number (Fraunces, teal) centred inside. The arc animates in on
// mount; the global reduced-motion guard makes that instant when requested.
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

  // Start empty, then animate to the target offset after mount.
  const [offset, setOffset] = useState(circumference)
  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(target))
    return () => cancelAnimationFrame(id)
  }, [target])

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Mashed score ${formatScore(value)} out of ${max}`}
    >
      <svg width={size} height={size} className="-rotate-90">
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
        <span className="tabular font-display text-[60px] font-semibold leading-none text-teal">
          {formatScore(value)}
        </span>
        <span className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.35em] text-teal">
          {label}
        </span>
      </div>
    </div>
  )
}
