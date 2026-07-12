import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  addMember,
  deleteRubricPreset,
  fetchGroupLog,
  fetchGroupRubrics,
  fetchMyRubricPresets,
  saveMyRubric,
  saveRubricPreset,
  searchProfiles,
  setFavoriteRubricPreset,
  signOut,
} from '../lib/api'
import type {
  GroupInfo,
  GroupLogEntry,
  GroupRubricRow,
  MemberInfo,
  UserRubricPreset,
  UserSearchResult,
} from '../lib/api'
import { RUBRIC_CATALOG, defaultRubricRows, mashRubrics } from '../lib/rubricCatalog'
import type { MemberRubric } from '../lib/rubricCatalog'
import { AVATAR_PALETTE } from '../lib/palette'
import { GroupLog } from '../components/GroupLog'

interface GroupScreenProps {
  group: GroupInfo
  members: MemberInfo[]
  userId: string
  /** Refetch the group's members (called after adding someone). */
  onMembersChanged: () => void
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
}

const searchInputClass =
  'w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-text ' +
  'placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60'

// Live group view. Members + rubrics come from Postgres through RLS.
//
// Rubrics are PER MEMBER: everyone edits their own, and the group's effective
// rubric is the mash — each category's weight is the mean across members,
// counting 0 for anyone who doesn't carry it (see rubricCatalog.mashRubrics).

export function GroupScreen({ group, members, userId, onMembersChanged, onOpenTitle }: GroupScreenProps) {
  const isOwner = group.role === 'owner'

  const [others, setOthers] = useState<MemberRubric[]>([])
  const [saved, setSaved] = useState<GroupRubricRow[] | null>(null)
  const [rows, setRows] = useState<GroupRubricRow[] | null>(null)
  const [log, setLog] = useState<GroupLogEntry[]>([])
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  // ---- personal presets ----
  const [presets, setPresets] = useState<UserRubricPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [showSavePreset, setShowSavePreset] = useState(false)
  const [presetBusy, setPresetBusy] = useState(false)

  // ---- add members (owner) ----
  const [showAdd, setShowAdd] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  const memberIds = members.map((m) => m.userId)

  useEffect(() => {
    let cancelled = false
    fetchGroupRubrics(group.id)
      .then((all) => {
        if (cancelled) return
        const mine = all.find((m) => m.userId === userId)?.rows ?? defaultRubricRows()
        setSaved(mine)
        setRows(mine)
        setOthers(all.filter((m) => m.userId !== userId))
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Load failed'))
    fetchMyRubricPresets(userId)
      .then((p) => !cancelled && setPresets(p))
      .catch(() => {})
    fetchGroupLog(group.id)
      .then((entries) => !cancelled && setLog(entries))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [group.id, userId])

  async function handleSavePreset() {
    if (rows === null || presetName.trim().length === 0) return
    setPresetBusy(true)
    setError(null)
    try {
      await saveRubricPreset(userId, presetName.trim(), rows)
      setPresets(await fetchMyRubricPresets(userId))
      setPresetName('')
      setShowSavePreset(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the preset')
    } finally {
      setPresetBusy(false)
    }
  }

  async function handleToggleFavorite(preset: UserRubricPreset) {
    setPresetBusy(true)
    setError(null)
    try {
      await setFavoriteRubricPreset(userId, preset.isFavorite ? null : preset.id)
      setPresets(await fetchMyRubricPresets(userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the favorite')
    } finally {
      setPresetBusy(false)
    }
  }

  async function handleDeletePreset(preset: UserRubricPreset) {
    setPresetBusy(true)
    setError(null)
    try {
      await deleteRubricPreset(userId, preset.id)
      setPresets((prev) => prev.filter((p) => p.id !== preset.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the preset')
    } finally {
      setPresetBusy(false)
    }
  }

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    let stale = false
    const timer = setTimeout(() => {
      searchProfiles(q, memberIds)
        .then((r) => !stale && setResults(r))
        .catch(() => !stale && setResults([]))
        .finally(() => !stale && setSearching(false))
    }, 350)
    return () => {
      stale = true
      clearTimeout(timer)
    }
    // memberIds derives from members (stable per load); intentionally omitted
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, members])

  async function handleAdd(user: UserSearchResult) {
    setError(null)
    setAddedIds((prev) => new Set(prev).add(user.userId))
    try {
      await addMember(group.id, user.userId)
      onMembersChanged()
      setResults((prev) => prev.filter((r) => r.userId !== user.userId))
    } catch (err) {
      setAddedIds((prev) => {
        const next = new Set(prev)
        next.delete(user.userId)
        return next
      })
      setError(err instanceof Error ? err.message : 'Could not add that person')
    }
  }

  const dirty = rows !== null && saved !== null && JSON.stringify(rows) !== JSON.stringify(saved)
  const enabledRows = (rows ?? []).filter((r) => r.enabled)
  const total = enabledRows.reduce((sum, r) => sum + r.weight, 0)
  const addable = RUBRIC_CATALOG.filter(
    (c) => c.kind !== 'base' && !(rows ?? []).some((r) => r.key === c.key),
  )

  // Live preview: the group's mashed rubric with YOUR current (unsaved) edits.
  const effective =
    rows === null ? [] : mashRubrics([...others, { userId, rows }])
  const effectiveMax = Math.max(1, ...effective.map((r) => r.weight))

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
      await saveMyRubric(group.id, userId, rows)
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
        {isOwner ? (
          <div className="mt-3">
            {!showAdd ? (
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-line py-2.5 text-[13px] font-semibold text-teal transition-colors hover:border-teal/50"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M19 8v6M22 11h-6" />
                </svg>
                Add friends
              </button>
            ) : (
              <div className="mp-card rounded-2xl p-4">
                <input
                  type="text"
                  autoFocus
                  maxLength={60}
                  placeholder="Search by name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={searchInputClass}
                />
                {searching && (
                  <p className="mt-2 px-1 font-mono text-[10px] text-muted">searching…</p>
                )}
                {results.length > 0 && (
                  <ul className="mt-2 overflow-hidden rounded-xl border border-line bg-surface-2">
                    {results.map((u, i) => (
                      <li key={u.userId}>
                        <button
                          type="button"
                          onClick={() => void handleAdd(u)}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface ${
                            i > 0 ? 'border-t border-line/50' : ''
                          }`}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-line font-mono text-[12px] font-bold text-bg">
                            {u.displayName.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {u.displayName}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-teal">
                            Add
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim().length >= 2 && !searching && results.length === 0 && (
                  <p className="mt-2 px-1 text-[12px] leading-snug text-muted">
                    Nobody by that name yet. They need a Mash Potato account first — have them
                    sign up, then search again.
                  </p>
                )}
                {addedIds.size > 0 && (
                  <p className="mt-2 px-1 text-[12px] text-teal">
                    Added ✓ — they start with the default rubric and can tune it here.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
            Only the group owner can add members.
          </p>
        )}
      </section>

      {/* ---- Group log: everything rated together ---- */}
      {log.length > 0 && (
        <div className="mt-7">
          <GroupLog entries={log} onOpenTitle={onOpenTitle} animationDelay="80ms" />
        </div>
      )}

      {/* ---- The group's mashed rubric (compact) + editor toggle ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '160ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Group rubric
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-teal">Mashed</p>
        </div>
        <div className="mp-card rounded-[26px] px-5 py-1">
          {effective.length === 0 ? (
            <p className="py-4 text-[13px] text-muted">Loading…</p>
          ) : (
            effective.map((row, i) => (
              <div key={row.key} className={`py-3 ${i > 0 ? 'border-t border-line/50' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <p className="text-[13px] font-medium">{row.label}</p>
                  <span className="tabular font-mono text-[13px] font-semibold text-teal">
                    {row.weight}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(row.weight / effectiveMax) * 100}%`,
                      backgroundImage: 'linear-gradient(90deg, #3FA9A2, #6FE3DB)',
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
        <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
          The average of {others.length + 1} rubric{others.length === 0 ? '' : 's'} — a category
          someone doesn't carry counts as 0 for them, so lone picks weigh less.
        </p>
        <button
          type="button"
          onClick={() => setEditOpen((o) => !o)}
          aria-expanded={editOpen}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
        >
          {editOpen ? 'Close the editor' : dirty ? 'Edit your rubric · unsaved changes' : 'Edit your rubric'}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${editOpen ? 'rotate-180' : ''}`} aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </section>

      {/* ---- Your rubric (everyone edits their own; collapsed by default) ---- */}
      {editOpen && (
      <section className="mp-rise mt-5">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Your rubric
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
                    </div>
                  </div>
                  {row.enabled && (
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
                  )}
                </div>
              ))
          )}
        </div>

        {rows !== null && addable.length > 0 && (
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
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 px-2 text-[12px] leading-snug text-coral">
            {error}
          </p>
        )}

        {/* ---- apply a rubric: app default / favorite / saved presets ---- */}
        <div className="mt-4">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Apply a rubric
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy || rows === null}
                onClick={() => setRows(defaultRubricRows())}
                className="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text disabled:opacity-50"
              >
                App default
              </button>
            </div>
            {presets.map((p) => (
              <div key={p.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy || presetBusy}
                  onClick={() => setRows(p.rows.map((r) => ({ ...r })))}
                  className="min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-[12px] font-semibold transition-colors hover:border-teal/50 disabled:opacity-50"
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  disabled={presetBusy}
                  onClick={() => void handleToggleFavorite(p)}
                  aria-label={p.isFavorite ? `Unfavorite ${p.name}` : `Favorite ${p.name}`}
                  title={
                    p.isFavorite
                      ? 'Your favorite — used when you join a group'
                      : 'Make this your favorite'
                  }
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors disabled:opacity-50 ${
                    p.isFavorite
                      ? 'border-gold/40 bg-gold/10 text-gold'
                      : 'border-line text-muted hover:text-gold'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={p.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={presetBusy}
                  onClick={() => void handleDeletePreset(p)}
                  aria-label={`Delete ${p.name}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-coral disabled:opacity-50"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {showSavePreset ? (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                maxLength={40}
                placeholder="Preset name…"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] text-text placeholder:text-muted/70 outline-none focus:border-teal/60"
              />
              <button
                type="button"
                disabled={presetBusy || presetName.trim().length === 0}
                onClick={() => void handleSavePreset()}
                className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
              >
                {presetBusy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSavePreset(false)
                  setPresetName('')
                }}
                className="shrink-0 rounded-full px-2 py-2 font-mono text-[10px] uppercase text-muted hover:text-text"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={rows === null}
              onClick={() => setShowSavePreset(true)}
              className="mt-2 w-full rounded-xl border border-dashed border-line px-3 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text disabled:opacity-50"
            >
              + Save current as a preset
            </button>
          )}
          <p className="mt-2 px-1 text-[11px] leading-snug text-muted">
            Your ★ favorite is the rubric you bring when you join or create a group.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy || !dirty || total === 0}
          className={`mt-3 w-full rounded-full py-3 text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-45 ${
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
          {justSaved ? 'Saved ✓' : busy ? 'Saving…' : 'Save your rubric'}
        </button>
        <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
          Every member sets their own rubric — the group scores with the mash of everyone's,
          above. New sessions use it; past reveals keep the rubric they were scored under.
        </p>
      </section>
      )}

      {/* ---- Sign out ---- */}
      <section className="mp-rise mt-8 text-center" style={{ animationDelay: '240ms' }}>
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
