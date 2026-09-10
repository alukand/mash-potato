import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { GroupRubricRow } from '../lib/api'
import { DEFAULT_WEIGHTS, RUBRIC_CATALOG } from '../lib/rubricCatalog'
import { RubricMix } from './RubricMix'

/** One category editor for saved presets and your contribution to a group. */
export function RubricRowsEditor({ rows, onChange, disabled = false, reorder = true }: {
  rows: GroupRubricRow[]
  onChange: (rows: GroupRubricRow[]) => void
  disabled?: boolean
  reorder?: boolean
}) {
  const [addOpen, setAddOpen] = useState(false)
  const sorted = [...rows].sort((a, b) => a.sort - b.sort)
  const enabled = rows.filter((r) => r.enabled)
  const total = enabled.reduce((sum, row) => sum + row.weight, 0)
  const addable = RUBRIC_CATALOG.filter((c) => !rows.some((r) => r.key === c.key))
  function update(key: string, patch: Partial<GroupRubricRow>) {
    onChange(rows.map((r) => r.key === key ? { ...r, ...patch } : r))
  }
  function move(index: number, delta: number) {
    const next = [...sorted]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next.map((r, i) => ({ ...r, sort: i })))
  }
  return (
    <div>
      <p className="mb-3 text-[13px] leading-snug text-muted">Give more weight to what matters most. Turn categories on or off.{reorder && ' Use the arrows to reorder them.'}</p>
      <RubricMix rows={rows} />
      <div className="divide-y divide-line/50">
        {sorted.map((row, index) => (
          <div key={row.key} className="py-3">
            <div className="flex items-center gap-2">
              <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-[14px] font-medium">
                <input type="checkbox" checked={row.enabled} disabled={disabled || (row.enabled && enabled.length <= 1)} onChange={(e) => update(row.key, { enabled: e.target.checked })} className="h-5 w-5 shrink-0 accent-teal" />
                <span className={row.enabled ? '' : 'text-muted'}>{row.label}</span>
              </label>
              {reorder && ([-1, 1] as const).map((delta) => (
                <button key={delta} type="button" disabled={disabled || (delta === -1 ? index === 0 : index === sorted.length - 1)} onClick={() => move(index, delta)} aria-label={`Move ${row.label} ${delta === -1 ? 'up' : 'down'}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-text disabled:opacity-30">{delta === -1 ? '↑' : '↓'}</button>
              ))}
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-[12px] text-muted">
              <span>{row.enabled ? 'Weight' : 'Off, weight kept'}</span>
              <span className="font-mono text-gold">{row.weight}{row.enabled && total > 0 && <span className="ml-2 text-muted">{Math.round(row.weight / total * 100)}% of your rubric</span>}</span>
            </div>
            {row.enabled && <input type="range" min={0} max={100} step={5} value={row.weight} disabled={disabled} aria-label={`${row.label} weight`} onChange={(e) => update(row.key, { weight: Number(e.target.value) })} className="mp-slider mt-1" style={{ '--thumb': 'var(--color-gold)', '--fill': row.weight } as CSSProperties} />}
          </div>
        ))}
      </div>
      {total === 0 && <p role="alert" className="mt-2 text-[13px] text-coral">Give at least one enabled category a weight above zero to save.</p>}
      {addable.length > 0 && <>
        <button type="button" disabled={disabled} aria-expanded={addOpen} onClick={() => setAddOpen((open) => !open)} className="mt-3 min-h-11 w-full rounded-full border border-line px-4 text-[13px] font-semibold text-teal disabled:opacity-50">{addOpen ? 'Close category list' : '+ Add categories'}</button>
        {addOpen && <div className="mp-rise mt-2 divide-y divide-line/50">{addable.map((c) => <button key={c.key} type="button" disabled={disabled} onClick={() => onChange([...sorted, { key: c.key, label: c.label, weight: DEFAULT_WEIGHTS[c.key] ?? 20, enabled: true, sort: Math.max(-1, ...rows.map((r) => r.sort)) + 1 }])} className="flex min-h-11 w-full items-center gap-3 py-3 text-left disabled:opacity-50"><span className="flex-1"><span className="block text-[14px] font-medium">{c.label}</span><span className="text-[12px] text-muted">{c.blurb}</span></span><span className="text-[13px] text-teal">Add</span></button>)}</div>}
      </>}
    </div>
  )
}
