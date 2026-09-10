import type { CSSProperties } from 'react'
import type { GroupRubricRow } from '../lib/api'

/** Actual weight shares, not rating values. The text is the accessible chart. */
export function RubricMix({ rows, compact = false }: { rows: GroupRubricRow[]; compact?: boolean }) {
  const enabled = rows.filter((r) => r.enabled && r.weight > 0).sort((a, b) => a.sort - b.sort)
  const total = enabled.reduce((sum, r) => sum + r.weight, 0)
  const strongest = [...enabled].sort((a, b) => b.weight - a.weight)[0]
  const tied = enabled.filter((r) => r.weight === strongest?.weight)
  return <div className={compact ? 'my-3' : 'mb-5 rounded-2xl bg-surface-2/65 p-4'}>
    {!compact && <div className="mb-3 flex items-center justify-between gap-3"><span className="text-[13px] font-semibold">Your taste, in the mix</span><span className="font-mono text-[10px] text-muted">{enabled.length} categories</span></div>}
    <div aria-hidden className="relative flex h-3 gap-0.5 overflow-hidden rounded-full bg-line/50">
      {enabled.map((row, i) => <span key={row.key} className="mp-mix-segment" style={{ flex: row.weight, '--mix-opacity': .35 + ((i * 3) % 7) * .1 } as CSSProperties} />)}
    </div>
    {!compact && <p className="mt-3 text-[12px] leading-relaxed text-muted">{!strongest ? 'Add some weight to start your mix.' : tied.length === enabled.length && enabled.length > 1 ? 'An even mix. Every category gets an equal say.' : <><span className="font-semibold text-gold">{strongest.label}</span> {tied.length > 1 ? 'shares the lead' : 'leads your mix'}, with {Math.round(strongest.weight / total * 100)}% of the weight.</>}</p>}
  </div>
}
