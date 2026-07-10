import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { fetchGroupRubric, saveGroupRubric, signOut } from '../lib/api'
import type { GroupInfo, GroupRubricRow, MemberInfo } from '../lib/api'
import { RUBRIC_CATALOG } from '../lib/rubricCatalog'
import { AVATAR_PALETTE } from '../lib/palette'

interface GroupScreenProps {
  group: GroupInfo
  members: MemberInfo[]
  userId: string
}

// Live group view. Members + rubric come from Postgres through RLS; the
// rubric editor is owner-only (the rubric_categories policy enforces it — the
// UI hiding the controls is just courtesy).
//
// The rubric is dynamic: base categories ship enabled, and the owner can
// toggle categories on/off, reweight them, and add more from the catalog.
// Genre categories also auto-join matching sessions (see rubricCatalog.ts).

export function GroupScreen({ group, members, userId }: GroupScreenProps) {
  const isOwner = group.role === 'owner'

  const [saved, setSaved] = useState<GroupRubricRow[] | null>(null)
  const [rows, setRows] = useState<GroupRubricRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchGroupRubric(group.id)
      .then((r) => {
        if (cancelled) return
        setSaved(r)
        setRows(r)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Load failed'))
    return () => {
      cancelled = true
    }
  }, [group.id])

  const dirty = rows !== null && saved !== null && JSON.stringify(rows) !== JSON.stringify(saved)
  const enabledRows = (rows ?? []).filter((r) => r.enabled)
  const total = enabledRows.reduce((sum, r) => sum + r.weight, 0)
  const maxWeight = Math.max(1, ...enabledRows.map((r) => r.weight))
  const addable = RUBRIC_CATALOG.filter(
    (c) => c.kind !== 'base' && !(rows ?? []).some((r) => r.key === c.key),
  )

  function updateRow(key: string, patch: Partial<GroupRubricRow>) {
    setRows((prev) =>
      prev === null ? prev : prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    )
  }

  function addCategory(key: string) {
    const cat = RUBRIC_CATALOG.find((c) => c.key === key)
    if (!cat) return
    setRows((prev) => {
      if (prev === null) return prev
      const nextSort = Math.max(0, ...prev.map((r) => r.sort)) + 1
      return [...prev, { key: cat.key, label: cat.label, weight: 20, enabled: true, sort: nextSort }]
    })
  }

  async function handleSave() {
    if (rows === null) return
    setBusy(true)
    setError(null)
    try {
      await saveGroupRubric(group.id, rows)
      setSaved(rows)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* ---- Members ---- */}
      <section className="mp-rise">
        <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Members
        </p>
        <div className="mp-card rounded-[26px] px-4">
          <ul>
            {members.map((m, i) => {
              const isYou = m.userId === userId
              return (
                <li
                  key={m.userId}
                  className={`flex items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[13px] font-bold text-bg"
                    style={{ backgroundColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
                  >
                    {m.displayName.charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate text-[14px] font-medium">
                    {m.displayName}
                    {isYou && <span className="ml-1.5 text-muted">(you)</span>}
                  </span>
                  {m.role === 'owner' && (
                    <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                      Owner
                    </span>
                  )}
                </li>
              )
            })}
            {members.length === 0 && (
              <li className="py-3.5 text-[13px] text-muted">Loading members…</li>
            )}
          </ul>
        </div>
        <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
          Inviting friends arrives with the next milestone — for now the crew is just you.
        </p>
      </section>

      {/* ---- The shared rubric ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '80ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Group rubric
          </p>
          <p className="tabular font-mono text-[10px] text-muted">
            total <span className={total === 0 ? 'text-coral' : 'text-text'}>{total}</span>
          </p>
        </div>

        <div className="mp-card rounded-[26px] px-5 py-1">
          {rows === null ? (
            <p className="py-4 text-[13px] text-muted">Loading rubric…</p>
          ) : (
            [...rows]
              .sort((a, b) => a.sort - b.sort)
              .filter((r) => isOwner || r.enabled)
              .map((row, i) => (
                <div
                  key={row.key}
                  className={`py-3.5 ${i > 0 ? 'border-t border-line/50' : ''} ${
                    row.enabled ? '' : 'opacity-45'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[13px] font-medium">{row.label}</p>
                    <div className="flex shrink-0 items-center gap-2.5">
                      {row.enabled && (
                        <span className="tabular font-mono text-[13px] font-semibold text-teal">
                          {row.weight}
                        </span>
                      )}
                      {isOwner && (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={row.enabled}
                          aria-label={`${row.label} enabled`}
                          disabled={busy || (row.enabled && enabledRows.length <= 1)}
                          onClick={() => updateRow(row.key, { enabled: !row.enabled })}
                          className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${
                            row.enabled ? 'bg-teal/70' : 'bg-line'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg transition-all ${
                              row.enabled ? 'left-[18px]' : 'left-0.5'
                            }`}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                  {row.enabled &&
                    (isOwner ? (
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={row.weight}
                        disabled={busy}
                        aria-label={`${row.label} weight`}
                        onChange={(e) => updateRow(row.key, { weight: Number(e.target.value) })}
                        className="mp-slider mt-1"
                        style={
                          {
                            '--thumb': 'var(--color-teal)',
                            '--fill': row.weight,
                          } as CSSProperties
                        }
                      />
                    ) : (
                      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(row.weight / maxWeight) * 100}%`,
                            backgroundImage: 'linear-gradient(90deg, #3FA9A2, #6FE3DB)',
                          }}
                        />
                      </div>
                    ))}
                </div>
              ))
          )}
        </div>

        {/* ---- add more categories (owner) ---- */}
        {isOwner && rows !== null && addable.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
              Add categories
            </p>
            <div className="flex flex-wrap gap-1.5">
              {addable.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={busy}
                  onClick={() => addCategory(c.key)}
                  title={c.blurb}
                  className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-teal/50 hover:text-text"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-2.5 px-1 text-[11px] leading-snug text-muted">
              Genre categories (Humor, Fear Factor, …) also join matching sessions automatically —
              add one here to score it on everything.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 px-2 text-[12px] leading-snug text-coral">
            {error}
          </p>
        )}

        {isOwner && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || !dirty || total === 0}
            className={`mt-4 w-full rounded-full py-3 text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-45 ${
              justSaved
                ? 'border border-teal/30 bg-teal/10 text-teal'
                : 'text-bg shadow-[0_12px_32px_-12px_rgba(81,197,190,0.45),inset_0_1px_0_rgba(255,255,255,0.3)]'
            }`}
            style={
              justSaved
                ? undefined
                : { backgroundImage: 'linear-gradient(180deg, #6FE3DB, #3FA9A2)' }
            }
          >
            {justSaved ? 'Saved ✓' : busy ? 'Saving…' : 'Save rubric'}
          </button>
        )}
        <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
          Weights set how much each category counts — they don't need to sum to 100. Changes apply
          to new sessions; past reveals keep the rubric they were scored under.
        </p>
      </section>

      {/* ---- Sign out ---- */}
      <section className="mp-rise mt-8 text-center" style={{ animationDelay: '160ms' }}>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-full border border-line px-5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
        >
          Sign out
        </button>
      </section>
    </>
  )
}
