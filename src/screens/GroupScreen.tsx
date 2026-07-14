import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  addMember,
  deleteGroup,
  deleteRubricPreset,
  fetchGroupLog,
  fetchGroupRubrics,
  fetchMyRubricPresets,
  fetchRecommendations,
  removeMember,
  renameGroup,
  saveMyRubric,
  saveRubricPreset,
  searchProfiles,
  setFavoriteRubricPreset,
} from '../lib/api'
import type {
  GroupInfo,
  GroupLogEntry,
  GroupRubricRow,
  MemberInfo,
  TmdbResult,
  UserRubricPreset,
  UserSearchResult,
} from '../lib/api'
import { DEFAULT_WEIGHTS, RUBRIC_CATALOG, defaultRubricRows, mashRubrics } from '../lib/rubricCatalog'
import type { MemberRubric } from '../lib/rubricCatalog'
import { AVATAR_PALETTE } from '../lib/palette'
import { CtaButton, GroupMark, fieldClass, fieldClassSm } from '../components/ui'
import { CategoryLegend } from '../components/CategoryLegend'
import { GroupLog } from '../components/GroupLog'
import { PosterShelf } from '../components/PosterShelf'
import { SessionPanel } from '../components/SessionPanel'

interface GroupScreenProps {
  group: GroupInfo
  groups: GroupInfo[]
  members: MemberInfo[]
  userId: string
  /** Refetch the group's members (called after adding/removing someone). */
  onMembersChanged: () => void
  /** Refetch the group list itself (rename / leave / delete). */
  onGroupsChanged: () => Promise<void>
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  /** Open a member's public profile. */
  onOpenUser: (userId: string) => void
  onSwitchGroup: (groupId: string) => void
  onCreateGroup: () => void
  /** Jump to the Rate tab for the active group. */
  onGoRate: () => void
}

// Live group view. Members + rubrics come from Postgres through RLS.
//
// Section order tells the story: the round (SessionPanel), the memory (log),
// the identity (rubric), and only then the admin (members + manage). Account
// actions live on the Profile, not here.
//
// Rubrics are PER MEMBER: everyone edits their own, and the group's effective
// rubric is the mash — each category's weight is the mean across members,
// counting 0 for anyone who doesn't carry it (see rubricCatalog.mashRubrics).

export function GroupScreen({
  group,
  groups,
  members,
  userId,
  onMembersChanged,
  onGroupsChanged,
  onOpenTitle,
  onOpenUser,
  onSwitchGroup,
  onCreateGroup,
  onGoRate,
}: GroupScreenProps) {
  const isOwner = group.role === 'owner'

  const [others, setOthers] = useState<MemberRubric[]>([])
  const [saved, setSaved] = useState<GroupRubricRow[] | null>(null)
  const [rows, setRows] = useState<GroupRubricRow[] | null>(null)
  const [log, setLog] = useState<GroupLogEntry[]>([])
  const [recs, setRecs] = useState<{
    seed: string
    mediaType: 'movie' | 'tv'
    items: TmdbResult[]
  } | null>(null)
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

  // ---- manage group (rename / remove / leave / delete) ----
  const [manageOpen, setManageOpen] = useState(false)
  const manageRef = useRef<HTMLElement | null>(null)
  const [newName, setNewName] = useState(group.name)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false) // leave (member) / delete (owner)
  const [manageBusy, setManageBusy] = useState(false)
  const [manageError, setManageError] = useState<string | null>(null)
  const [renamed, setRenamed] = useState(false)

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
    setRecs(null)
    fetchGroupLog(group.id)
      .then((entries) => {
        if (cancelled) return
        setLog(entries)
        // Recommendations seed from the group's best-rated title.
        const seed = [...entries]
          .filter((e) => e.tmdbId !== null && e.mashed !== null)
          .sort((a, b) => (b.mashed ?? 0) - (a.mashed ?? 0))[0]
        if (!seed || seed.tmdbId === null) return
        const seedTmdbId = seed.tmdbId
        const ratedIds = new Set(
          entries.filter((e) => e.mediaType === seed.mediaType).map((e) => e.tmdbId),
        )
        fetchRecommendations(seedTmdbId, seed.mediaType)
          .then(
            (items) =>
              !cancelled &&
              setRecs({
                seed: seed.titleName,
                mediaType: seed.mediaType,
                items: items.filter((it) => !ratedIds.has(it.tmdbId)).slice(0, 12),
              }),
          )
          .catch(() => {})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [group.id, userId])

  // Manage panel state belongs to one group at a time.
  useEffect(() => {
    setManageOpen(false)
    setNewName(group.name)
    setConfirmRemoveId(null)
    setConfirmEnd(false)
    setManageError(null)
    setRenamed(false)
  }, [group.id, group.name])

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

  async function handleRename() {
    const name = newName.trim()
    if (name.length === 0 || name === group.name) return
    setManageBusy(true)
    setManageError(null)
    try {
      await renameGroup(group.id, name)
      await onGroupsChanged()
      setRenamed(true)
      setTimeout(() => setRenamed(false), 2000)
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Could not rename the group')
    } finally {
      setManageBusy(false)
    }
  }

  async function handleRemoveMember(memberId: string) {
    setManageBusy(true)
    setManageError(null)
    try {
      await removeMember(group.id, memberId)
      setConfirmRemoveId(null)
      onMembersChanged()
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Could not remove that member')
    } finally {
      setManageBusy(false)
    }
  }

  /** Member: leave the group. Owner: delete it for everyone. */
  async function handleEndMembership() {
    setManageBusy(true)
    setManageError(null)
    try {
      if (isOwner) await deleteGroup(group.id)
      else await removeMember(group.id, userId)
      await onGroupsChanged()
      // this screen unmounts (or switches group) via the refreshed list
    } catch (err) {
      setManageError(
        err instanceof Error
          ? err.message
          : isOwner
            ? 'Could not delete the group'
            : 'Could not leave the group',
      )
      setManageBusy(false)
    }
  }

  // The gear next to the switcher: open the settings panel and bring it into
  // view (it lives in the admin corner at the bottom of the tab).
  function openSettings() {
    setManageOpen(true)
    setConfirmRemoveId(null)
    setConfirmEnd(false)
    setManageError(null)
    setNewName(group.name)
    requestAnimationFrame(() =>
      manageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  const dirty = rows !== null && saved !== null && JSON.stringify(rows) !== JSON.stringify(saved)
  const enabledRows = (rows ?? []).filter((r) => r.enabled)
  const total = enabledRows.reduce((sum, r) => sum + r.weight, 0)
  // Anything you don't already carry is addable, base categories included: a
  // member seeded from an old preset may be missing a base row entirely, and
  // this is their only non-destructive way back in.
  const addable = RUBRIC_CATALOG.filter(
    (c) => !(rows ?? []).some((r) => r.key === c.key),
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
      return [
        ...prev,
        { key: cat.key, label: cat.label, weight: DEFAULT_WEIGHTS[cat.key] ?? 20, enabled: true, sort: nextSort },
      ]
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
      {/* ---- your groups: pick which one you're looking at ---- */}
      <div className="mp-rise -mx-5 mb-5 flex items-center gap-2 px-5">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((g) => {
            const active = g.id === group.id
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => !active && onSwitchGroup(g.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-[12px] font-semibold transition-colors ${
                  active
                    ? 'border-teal/50 bg-teal/10 text-teal'
                    : 'border-line bg-surface-2 text-muted hover:text-text'
                }`}
              >
                <GroupMark groupId={g.id} name={g.name} size={22} />
                {g.name}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onCreateGroup}
            aria-label="Create a group"
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
        </div>
        {/* pinned: this group's settings (rename, members, leave/delete) */}
        <button
          type="button"
          onClick={openSettings}
          aria-label={`${group.name} settings`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:border-teal/50 hover:text-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
          </svg>
        </button>
      </div>

      {/* ---- the group's latest round: invite / blind progress / the Reveal ---- */}
      <div className="mb-7">
        <SessionPanel group={group} members={members} userId={userId} onGoRate={onGoRate} />
      </div>

      {/* ---- Group log: everything rated together (the group's memory) ---- */}
      {log.length > 0 && (
        <div className="mb-7">
          <GroupLog entries={log} onOpenTitle={onOpenTitle} animationDelay="60ms" />
        </div>
      )}

      {/* ---- what to mash next, seeded by the group's best round ---- */}
      {recs && recs.items.length > 0 && (
        <div className="mp-rise mb-7" style={{ animationDelay: '90ms' }}>
          <PosterShelf
            heading={`Because you loved ${recs.seed}`}
            items={recs.items}
            onPick={(it) => onOpenTitle(it.tmdbId, recs.mediaType)}
          />
        </div>
      )}

      {/* ---- The group's mashed rubric (compact) + editor toggle ---- */}
      <section className="mp-rise" style={{ animationDelay: '120ms' }}>
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
        <p className="mt-3 px-2 text-[13px] leading-snug text-muted">
          The average of {others.length + 1} rubric{others.length === 0 ? '' : 's'}: a category
          someone doesn't carry counts as 0 for them, so lone picks weigh less.
        </p>
        <CategoryLegend entries={effective} className="mt-3 px-2" />
        <button
          type="button"
          onClick={() => setEditOpen((o) => !o)}
          aria-expanded={editOpen}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
        >
          {editOpen ? 'Close the editor' : 'Edit your rubric'}
          {!editOpen && dirty && <span className="text-gold">unsaved</span>}
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
          <p role="alert" className="mt-3 px-2 text-[13px] leading-snug text-coral">
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
                      ? 'Your favorite: the rubric you bring to new groups'
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
                className={`flex-1 ${fieldClassSm}`}
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
          <p className="mt-2 px-1 text-[12px] leading-snug text-muted">
            Your ★ favorite is the rubric you bring when you join or create a group.
          </p>
        </div>

        {justSaved ? (
          <div className="mt-3 w-full rounded-full border border-teal/30 bg-teal/10 py-3 text-center text-[13px] font-bold text-teal">
            Saved ✓
          </div>
        ) : (
          <CtaButton
            tone="teal"
            disabled={busy || !dirty || total === 0}
            onClick={() => void handleSave()}
            className="mt-3 w-full py-3 text-[13px] disabled:opacity-45"
          >
            {busy ? 'Saving…' : 'Save your rubric'}
          </CtaButton>
        )}
        <p className="mt-3 px-2 text-[13px] leading-snug text-muted">
          Every member sets their own rubric; the group scores with the mash of everyone's,
          above. New sessions use it, and past reveals keep the rubric they were scored under.
        </p>
      </section>
      )}

      {/* ---- Members + settings: the admin corner, deliberately last ---- */}
      <section ref={manageRef} className="mp-rise mt-7 scroll-mt-4" style={{ animationDelay: '180ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Members <span className="tabular ml-1 font-mono text-[10px]">{members.length || ''}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setManageOpen((o) => !o)
              setConfirmRemoveId(null)
              setConfirmEnd(false)
              setManageError(null)
              setNewName(group.name)
            }}
            aria-expanded={manageOpen}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              manageOpen
                ? 'border-teal/40 bg-teal/10 text-teal'
                : 'border-line text-muted hover:text-text'
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
            </svg>
            {manageOpen ? 'Done' : 'Settings'}
          </button>
        </div>
        <div className="mp-card rounded-[26px] px-4">
          <ul>
            {members.map((m, i) => {
              const isYou = m.userId === userId
              const removable = manageOpen && isOwner && !isYou && m.role !== 'owner'
              return (
                <li
                  key={m.userId}
                  className={`py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isYou}
                      onClick={() => !isYou && onOpenUser(m.userId)}
                      className="group flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[13px] font-bold text-bg transition-transform group-active:scale-95"
                        style={{ backgroundColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
                      >
                        {m.displayName.charAt(0).toUpperCase()}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-[14px] font-medium ${isYou ? '' : 'transition-colors group-hover:text-teal'}`}>
                        {m.displayName}
                        {isYou && <span className="ml-1.5 text-muted">(you)</span>}
                      </span>
                    </button>
                    {m.role === 'owner' && (
                      <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                        Owner
                      </span>
                    )}
                    {removable && (
                      <button
                        type="button"
                        disabled={manageBusy}
                        onClick={() =>
                          setConfirmRemoveId((prev) => (prev === m.userId ? null : m.userId))
                        }
                        aria-label={`Remove ${m.displayName}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:border-coral/50 hover:text-coral disabled:opacity-50"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                          <path d="M6 6l12 12M18 6 6 18" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {removable && confirmRemoveId === m.userId && (
                    <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-coral/30 bg-coral/5 px-3.5 py-2.5">
                      <p className="text-[13px] leading-snug text-muted">
                        Remove {m.displayName}? Their scores on past reveals stay in the log.
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(null)}
                          className="rounded-full px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          disabled={manageBusy}
                          onClick={() => void handleRemoveMember(m.userId)}
                          className="rounded-full bg-coral/90 px-3 py-1.5 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
                        >
                          {manageBusy ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
            {members.length === 0 && (
              <li className="py-3.5 text-[13px] text-muted">Loading members…</li>
            )}
          </ul>
        </div>

        {isOwner && (
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
                  className={fieldClass}
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
                          className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                            i > 0 ? 'border-t border-line/50' : ''
                          }`}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-line font-mono text-[12px] font-bold text-bg transition-transform group-active:scale-95">
                            {u.displayName.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium transition-colors group-hover:text-teal">
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
                  <p className="mt-2 px-1 text-[13px] leading-snug text-muted">
                    Nobody by that name yet. They need a Mash Potato account first: have them
                    sign up, then search again.
                  </p>
                )}
                {addedIds.size > 0 && (
                  <p className="mt-2 px-1 text-[12px] text-teal">
                    Added ✓ They start with the default rubric and can tune it here.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---- manage panel: rename (owner), leave / delete ---- */}
        {manageOpen && (
          <div className="mp-rise mt-4">
            {isOwner && (
              <div className="mp-card rounded-2xl p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                  Group name
                </p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    maxLength={80}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    aria-label="Group name"
                    className={`flex-1 ${fieldClassSm}`}
                  />
                  <button
                    type="button"
                    disabled={
                      manageBusy || newName.trim().length === 0 || newName.trim() === group.name
                    }
                    onClick={() => void handleRename()}
                    className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
                  >
                    {manageBusy ? 'Saving…' : renamed ? 'Saved ✓' : 'Rename'}
                  </button>
                </div>
              </div>
            )}

            {!confirmEnd ? (
              <button
                type="button"
                disabled={manageBusy}
                onClick={() => setConfirmEnd(true)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-coral/50 hover:text-coral disabled:opacity-50"
              >
                {isOwner ? 'Delete this group' : `Leave ${group.name}`}
              </button>
            ) : (
              <div className="mt-3 rounded-2xl border border-coral/30 bg-coral/5 p-4">
                <p className="text-[13px] font-semibold leading-snug">
                  {isOwner ? `Delete ${group.name} for everyone?` : `Leave ${group.name}?`}
                </p>
                <p className="mt-1 text-[13px] leading-snug text-muted">
                  {isOwner
                    ? 'Every round, reveal, and rubric goes with it. There is no undo.'
                    : 'Your scores on past reveals stay. The owner can add you back later.'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmEnd(false)}
                    className="flex-1 rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text"
                  >
                    {isOwner ? 'Keep it' : 'Stay'}
                  </button>
                  <button
                    type="button"
                    disabled={manageBusy}
                    onClick={() => void handleEndMembership()}
                    className="flex-1 rounded-full bg-coral/90 py-2.5 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {manageBusy
                      ? isOwner
                        ? 'Deleting…'
                        : 'Leaving…'
                      : isOwner
                        ? 'Delete for good'
                        : 'Leave group'}
                  </button>
                </div>
              </div>
            )}

            {isOwner && (
              <p className="mt-2 px-2 text-[12px] leading-snug text-muted">
                Owners can't leave their own group; deleting it is the way out.
              </p>
            )}
            {manageError && (
              <p role="alert" className="mt-2 px-2 text-[13px] leading-snug text-coral">
                {manageError}
              </p>
            )}
          </div>
        )}

        {!isOwner && !manageOpen && (
          <p className="mt-3 px-2 text-[13px] leading-snug text-muted">
            Only the group owner can add members.
          </p>
        )}
      </section>
    </>
  )
}
