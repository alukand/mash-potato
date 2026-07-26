import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  addMember,
  deleteGroup,
  deleteRubricPreset,
  createPlaylist,
  fetchGroupCred,
  fetchGroupLog,
  fetchGroupPlaylists,
  fetchGroupRubrics,
  fetchMyRubricPresets,
  fetchRecommendations,
  removeMember,
  renameGroup,
  saveMyRubric,
  saveRubricPreset,
  searchProfiles,
  setFavoriteRubricPreset,
  setGroupTasteMode,
} from '../lib/api'
import type {
  GroupInfo,
  GroupLogEntry,
  GroupRubricRow,
  MemberInfo,
  PlaylistSummary,
  TmdbResult,
  UserRubricPreset,
  UserSearchResult,
} from '../lib/api'
import {
  DEFAULT_WEIGHTS,
  RUBRIC_CATALOG,
  TASTE_MODES,
  defaultRubricRows,
  mashRubrics,
} from '../lib/rubricCatalog'
import { credFlair } from '../lib/cred'
import { Avatar } from '../components/avatars'
import type { MemberRubric, TasteMode } from '../lib/rubricCatalog'
import { AVATAR_PALETTE } from '../lib/palette'
import {
  CtaButton,
  GearIcon,
  GroupMark,
  HeaderAction,
  SettingsButton,
  TasteModePicker,
  fieldClass,
  fieldClassSm,
} from '../components/ui'
import { CategoryLegend } from '../components/CategoryLegend'
import { GroupLog } from '../components/GroupLog'
import { GroupPoll } from '../components/GroupPoll'
import { PlaylistCard } from '../components/PlaylistCard'
import { PosterShelf } from '../components/PosterShelf'
import { SessionPanel } from '../components/SessionPanel'
import { StartRound } from '../components/StartRound'

interface GroupScreenProps {
  group: GroupInfo
  groups: GroupInfo[]
  members: MemberInfo[]
  userId: string
  /** Refetch the group's members (called after adding/removing someone). */
  onMembersChanged: () => void
  /** Refetch the group list itself (rename / leave / delete). */
  onGroupsChanged: () => Promise<void>
  onOpenTitle: (
    tmdbId: number,
    mediaType: 'movie' | 'tv',
    discuss?: { groupId: string; seed?: string },
  ) => void
  /** Open a member's public profile. */
  onOpenUser: (userId: string) => void
  onSwitchGroup: (groupId: string) => void
  onCreateGroup: () => void
  /** Open a playlist (the group's shared watchlists live here). */
  onOpenPlaylist: (playlistId: string) => void
  /** A round was started in a DIFFERENT group; the caller switches to it. */
  onStartedInGroup: (groupId: string) => void
  /** Open the group's whole run (taste twins + recap) on the view-stack. */
  onOpenHistory: (groupId: string) => void
  /**
   * A night to reopen, handed down from a pushed view that has no reach into
   * this screen's state (the history screen). Cleared via `onSessionOpened`
   * so it fires once rather than re-opening on every render.
   */
  openSessionId?: string | null
  onSessionOpened?: () => void
}

// Live group view. Members + rubrics come from Postgres through RLS.
//
// Section order tells the story: the round (SessionPanel), the memory (log),
// the identity (rubric), and only then the admin (members + manage). Account
// actions live on the Profile, not here.
//
// How a group scores is the GROUP's mode (group.tasteMode), not each member's
// personal one. Cinephile groups keep per-member rubrics: everyone edits their
// own and the group's effective rubric is the mash — each category's weight is
// the mean across members, counting 0 for anyone who doesn't carry it (see
// rubricCatalog.mashRubrics). Normie groups are a no-configuration surface:
// everyone carries the same three rows, so there is nothing to edit and the
// editor is hidden entirely.

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
  onOpenPlaylist,
  onStartedInGroup,
  onOpenHistory,
  openSessionId = null,
  onSessionOpened,
}: GroupScreenProps) {
  const isOwner = group.role === 'owner'
  // Normie groups: one shared three-part rubric, no per-member editing.
  const isCasual = group.tasteMode === 'casual'

  // ---- switching how the group scores (owner-only; resets rubrics) ----
  const [modeDraft, setModeDraft] = useState<TasteMode | null>(null)
  const [modeBusy, setModeBusy] = useState(false)
  const [modeError, setModeError] = useState<string | null>(null)

  // The gear gates the group's settings cluster (rubric, members, manage);
  // the default view stays about the round: score, log, watchlists.
  const [settingsOpen, setSettingsOpen] = useState(false)
  // "Start the next round" on a revealed panel opens the picker below it.
  const [startOpen, setStartOpen] = useState(false)
  // A log row reopens that night in the panel (null = the latest round).
  const [viewSessionId, setViewSessionId] = useState<string | null>(null)

  const [others, setOthers] = useState<MemberRubric[]>([])
  const [saved, setSaved] = useState<GroupRubricRow[] | null>(null)
  const [rows, setRows] = useState<GroupRubricRow[] | null>(null)
  const [log, setLog] = useState<GroupLogEntry[]>([])
  const [cred, setCred] = useState<Map<string, number>>(new Map())
  // ---- shared watchlists ----
  const [watchlists, setWatchlists] = useState<PlaylistSummary[] | null>(null)
  const [newListName, setNewListName] = useState('')
  const [listBusy, setListBusy] = useState(false)
  const [recs, setRecs] = useState<{
    seed: string
    mediaType: 'movie' | 'tv'
    items: TmdbResult[]
  } | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  // Two-step guards for the edits that used to fire instantly.
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDeletePreset, setConfirmDeletePreset] = useState<string | null>(null)
  /** Preset id awaiting "yes, replace my unsaved sliders". */
  const [confirmApplyPreset, setConfirmApplyPreset] = useState<string | null>(null)
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
  const settingsRef = useRef<HTMLDivElement | null>(null)
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
    // Mash Cred: reactions received on this group's threads (flair only).
    setCred(new Map())
    fetchGroupCred(group.id)
      .then((m) => !cancelled && setCred(m))
      .catch(() => {})
    // Shared watchlists: any member curates them.
    setWatchlists(null)
    fetchGroupPlaylists(group.id)
      .then((w) => !cancelled && setWatchlists(w))
      .catch(() => !cancelled && setWatchlists([]))
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
    setViewSessionId(null)
  }, [group.id, group.name])

  // A night handed back from the history screen. Consumed immediately, so
  // clearing the banner ("Back to the latest") doesn't snap straight back.
  useEffect(() => {
    if (!openSessionId) return
    setViewSessionId(openSessionId)
    onSessionOpened?.()
  }, [openSessionId, onSessionOpened])

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

  async function handleCreateWatchlist() {
    // Enter in the name field lands here too; the busy check is the guard
    // the disabled button can't provide.
    if (listBusy) return
    const name = newListName.trim()
    if (name.length === 0) return
    setListBusy(true)
    try {
      await createPlaylist(userId, name, group.id)
      setWatchlists(await fetchGroupPlaylists(group.id))
      setNewListName('')
    } catch {
      // non-fatal; the button re-enables
    } finally {
      setListBusy(false)
    }
  }

  // The gear next to the switcher: toggle the settings cluster (rubric,
  // members, manage) and bring it into view when opening.
  function toggleSettings() {
    setSettingsOpen((open) => {
      const next = !open
      if (next) {
        setConfirmRemoveId(null)
        setConfirmEnd(false)
        setManageError(null)
        setNewName(group.name)
        requestAnimationFrame(() =>
          settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        )
      }
      return next
    })
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
  // Your own weight per category, for the "you 30 → group 18" readout.
  const myWeights =
    rows === null
      ? null
      : new Map(rows.filter((r) => r.enabled).map((r) => [r.key, r.weight]))

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

  // Confirmed switch: the DB trigger re-seeds every member's rubric for this
  // group, so tuned weights go. Past rounds keep their own snapshots.
  async function handleSwitchMode() {
    if (modeDraft === null || modeDraft === group.tasteMode) return
    setModeBusy(true)
    setModeError(null)
    try {
      await setGroupTasteMode(group.id, modeDraft)
      setModeDraft(null)
      await onGroupsChanged()
      // rubrics were rewritten server-side; pull the new rows
      const all = await fetchGroupRubrics(group.id)
      setOthers(all.filter((m) => m.userId !== userId))
      const mine = all.find((m) => m.userId === userId)?.rows ?? defaultRubricRows()
      setSaved(mine)
      setRows(mine.map((r) => ({ ...r })))
    } catch (err) {
      setModeError(err instanceof Error ? err.message : 'Could not switch modes')
    } finally {
      setModeBusy(false)
    }
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
    // A flex column purely so the settings cluster can sit visually right
    // under the switcher (order) while staying late in the DOM. The control
    // is in the header; opening it used to jump you ~1000px down the page.
    <div className="flex flex-col">
      {/* ---- your groups: pick which one you're looking at ---- */}
      <div className="mp-rise -mx-5 mb-5 flex order-[-2] items-center gap-2 px-5">
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
      </div>

      {/* The settings control lives in the app header's top-right slot, the
          same place on every screen. It used to be an unlabelled cog pinned
          to the end of the scrolling chip strip, where it read as one more
          group chip. */}
      <HeaderAction>
        <SettingsButton open={settingsOpen} onClick={toggleSettings} />
      </HeaderAction>

      {/* ---- viewing an earlier night from the log ---- */}
      {viewSessionId && (
        <div className="mp-rise mb-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-2.5">
          <p className="min-w-0 text-[12px] leading-snug text-muted">
            An earlier night from the log.
          </p>
          <button
            type="button"
            onClick={() => setViewSessionId(null)}
            className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3 py-1.5 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20"
          >
            Back to the latest
          </button>
        </div>
      )}

      {/* ---- the group's round: score blind / the Reveal, in place ---- */}
      <div className="mb-7">
        <SessionPanel
          group={group}
          members={members}
          userId={userId}
          viewSessionId={viewSessionId}
          onOpenTitle={(tmdbId, mediaType) => onOpenTitle(tmdbId, mediaType)}
          startRound={
            <StartRound
              group={group}
              groups={groups}
              userId={userId}
              onStarted={() => setStartOpen(false)}
              onStartedInGroup={onStartedInGroup}
            />
          }
          onStartNext={() => setStartOpen(true)}
          onViewLatest={() => {
            setViewSessionId(null)
            window.scrollTo(0, 0)
          }}
          onDiscuss={(tmdbId, mediaType, seed) =>
            onOpenTitle(tmdbId, mediaType, { groupId: group.id, seed })
          }
        />
      </div>

      {/* ---- pick the next one (opened from a revealed panel) ---- */}
      {startOpen && (
        <div className="mb-7">
          <StartRound
            group={group}
            groups={groups}
            userId={userId}
            onStarted={() => setStartOpen(false)}
            onStartedInGroup={onStartedInGroup}
          />
        </div>
      )}

      {/* ---- Group log: everything rated together (the group's memory) ---- */}
      {log.length > 0 && (
        <div className="mb-7">
          <GroupLog
            entries={log}
            onOpenHistory={() => onOpenHistory(group.id)}
            onOpenSession={(sessionId) => {
              setViewSessionId(sessionId)
              window.scrollTo(0, 0)
            }}
            animationDelay="60ms"
          />
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

      {/* ---- what's next? the group votes on it ---- */}
      <GroupPoll group={group} members={members} userId={userId} />

      {/* ---- shared watchlists: what to watch next, curated together ---- */}
      <section className="mp-rise mb-7" style={{ animationDelay: '100ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Watchlists{' '}
          <span className="tabular ml-1 font-mono text-[10px]">
            {watchlists?.length || ''}
          </span>
        </p>
        <div className="mp-card overflow-hidden rounded-[22px]">
          {watchlists === null ? (
            <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
          ) : (
            <>
              {watchlists.length === 0 && (
                <p className="px-5 pb-1 pt-4 text-[13px] leading-snug text-muted">
                  A shared list everyone in {group.name} can add to. Queue up the next
                  movie nights.
                </p>
              )}
              <div className="divide-y divide-line/50">
                {watchlists.map((w) => (
                  <PlaylistCard
                    key={w.id}
                    name={w.name}
                    itemCount={w.itemCount}
                    posters={w.posters}
                    description={w.description}
                    onOpen={() => onOpenPlaylist(w.id)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5 border-t border-line/50 px-4 py-3">
                <input
                  type="text"
                  maxLength={80}
                  placeholder="New watchlist…"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleCreateWatchlist()}
                  className={`flex-1 ${fieldClassSm}`}
                />
                <button
                  type="button"
                  disabled={listBusy || newListName.trim().length === 0}
                  onClick={() => void handleCreateWatchlist()}
                  className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
                >
                  {listBusy ? 'Creating…' : 'Create'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ---- the settings cluster: rubric + members + manage (gear-gated) ---- */}
      {settingsOpen && (
      <div ref={settingsRef} className="order-[-1] mb-7 scroll-mt-4">
      {/* ---- How this group scores (the mode) ---- */}
      <section className="mp-rise" style={{ animationDelay: '100ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            How this group scores
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-teal">
            {TASTE_MODES[group.tasteMode].plural}
          </p>
        </div>
        <div className="mp-card rounded-[26px] p-5">
          <p className="text-[13px] leading-snug text-muted">
            {TASTE_MODES[group.tasteMode].blurb}{' '}
            {isCasual
              ? 'Everyone scores the same three categories, so there is nothing to set up.'
              : 'Everyone tunes their own weights and the group scores with the mash.'}
          </p>
          {/* The door out of the simple mode. Casual groups hide the editor
              entirely, so without this there is no sign the depth exists. */}
          <p className="mt-2 text-[13px] leading-snug text-muted">
            {isCasual
              ? `${TASTE_MODES.buff.plural} score the craft rubric instead: seven categories, each with its own weight.`
              : `${TASTE_MODES.casual.plural} score three quick calls instead, with no weights to tune.`}{' '}
            {isOwner
              ? 'You can switch this group over any time.'
              : `Ask the group owner if you'd rather score as ${
                  isCasual ? TASTE_MODES.buff.plural : TASTE_MODES.casual.plural
                }.`}
          </p>
          {isOwner &&
            (modeDraft === null ? (
              <button
                type="button"
                onClick={() => setModeDraft(isCasual ? 'buff' : 'casual')}
                className="mt-3 w-full rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
              >
                Change how the group scores
              </button>
            ) : (
              <div className="mt-4 rounded-2xl border border-coral/30 bg-coral/5 p-3.5">
                <TasteModePicker
                  value={modeDraft}
                  onChange={setModeDraft}
                  disabled={modeBusy}
                />
                <p className="mt-3 text-[13px] leading-snug text-muted">
                  Switching resets everyone&apos;s rubric for this group to the new set. Past
                  rounds keep the rubric they were scored under.
                </p>
                {modeError && (
                  <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
                    {modeError}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModeDraft(null)
                      setModeError(null)
                    }}
                    className="rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                  >
                    Keep {TASTE_MODES[group.tasteMode].plural}
                  </button>
                  <button
                    type="button"
                    disabled={modeBusy || modeDraft === group.tasteMode}
                    onClick={() => void handleSwitchMode()}
                    className="rounded-full bg-coral/90 px-3.5 py-2 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-50"
                  >
                    {modeBusy ? 'Switching…' : `Switch to ${TASTE_MODES[modeDraft].plural}`}
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* ---- The group's mashed rubric (compact) + editor toggle ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '120ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Group rubric
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-teal">
            {editOpen && dirty ? 'Preview' : 'Mashed'}
          </p>
        </div>
        {editOpen && dirty && (
          // This card silently re-mashes your unsaved dragging. Say so, or the
          // numbers look like they changed for the whole group already.
          <p className="mb-2 px-2 text-[12px] leading-snug text-gold">
            Previewing your unsaved changes. Nobody else sees this until you save.
          </p>
        )}
        <div className="mp-card rounded-[26px] px-5 py-1">
          {effective.length === 0 ? (
            <p className="py-4 text-[13px] text-muted">Loading…</p>
          ) : (
            effective.map((row, i) => (
              <div key={row.key} className={`py-3 ${i > 0 ? 'border-t border-line/50' : ''}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-[13px] font-medium">{row.label}</p>
                  <span className="shrink-0 tabular font-mono text-[13px] font-semibold text-teal">
                    {/* The answer to "why is my favourite category so small?" */}
                    {!isCasual && myWeights !== null && (
                      <span className="font-normal text-muted">
                        you {myWeights.get(row.key) ?? 0}{' '}
                        <span aria-label="becomes">→</span>{' '}
                      </span>
                    )}
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
          {isCasual
            ? 'Every member scores these three, and a genre night adds its own category on top.'
            : `Every category is divided by all ${others.length + 1} member${others.length === 0 ? '' : 's'}, whether or not they carry it, so a category only you picked lands about ${others.length + 1}× smaller than you set it.`}
        </p>
        {!isCasual && (
          // The single most common misread: these look like percentages.
          <p className="mt-1.5 px-2 text-[13px] leading-snug text-muted">
            Only the ratios matter. Sliding everything up changes nothing.
          </p>
        )}
        <CategoryLegend entries={effective} className="mt-3 px-2" />
        {!isCasual && (
          <button
            type="button"
            onClick={() => setEditOpen((o) => !o)}
            aria-expanded={editOpen}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
          >
            {editOpen ? 'Done editing' : 'Edit your weights'}
            {!editOpen && dirty && <span className="text-gold">unsaved</span>}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${editOpen ? 'rotate-180' : ''}`} aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
      </section>

      {/* ---- Your rubric (Cinephile groups only; collapsed by default) ---- */}
      {editOpen && !isCasual && (
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
                      {/* Shown even when off, so turning a row back on doesn't
                          feel like the number was thrown away. */}
                      <span
                        className={`tabular font-mono text-[13px] font-semibold ${
                          row.enabled ? 'text-teal' : 'text-muted'
                        }`}
                      >
                        {row.weight}
                      </span>
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
                    <>
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
                      {/* End caps: the rail had no scale at all, which is part
                          of why the numbers read as percentages. */}
                      <div className="mt-0.5 flex justify-between font-mono text-[9px] text-muted/70">
                        <span>barely counts</span>
                        <span>counts most</span>
                      </div>
                    </>
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
            {/* Rows, not chips: the definition used to be a title= tooltip,
                which a touch device never shows. This is the one place a
                category most needs explaining. */}
            <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
              {addable.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  disabled={busy}
                  onClick={() => addCategory(c.key)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13px] font-medium">{c.label}</span>
                      {c.kind === 'genre' && (
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wide text-teal">
                          genre night
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                      {c.blurb}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-muted"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
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

        {/* ---- start from a saved set (replaces every slider above) ---- */}
        <div className="mt-4">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            Start from a saved set
          </p>
          <p className="mb-2 px-1 text-[12px] leading-snug text-muted">
            Replaces every slider above. Nothing is saved until you tap Save.
          </p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              {confirmReset ? (
                // Was a one-tap wipe of unsaved edits; every other destructive
                // action in this screen confirms first.
                <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-gold/40 bg-gold/5 px-3 py-1.5">
                  <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted">
                    Replace your sliders with the app default?
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="shrink-0 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRows(defaultRubricRows())
                      setConfirmReset(false)
                    }}
                    className="shrink-0 rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-gold"
                  >
                    Replace
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy || rows === null}
                  onClick={() => (dirty ? setConfirmReset(true) : setRows(defaultRubricRows()))}
                  className="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text disabled:opacity-50"
                >
                  App default
                </button>
              )}
            </div>
            {presets.map((p) =>
              confirmApplyPreset === p.id ? (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-xl border border-gold/40 bg-gold/5 px-3 py-1.5"
                >
                  <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted">
                    Replace your unsaved sliders with “{p.name}”?
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirmApplyPreset(null)}
                    className="shrink-0 rounded-full px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRows(p.rows.map((r) => ({ ...r })))
                      setConfirmApplyPreset(null)
                    }}
                    className="shrink-0 rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-[11px] font-semibold text-gold"
                  >
                    Replace
                  </button>
                </div>
              ) : (
              <div key={p.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy || presetBusy}
                  // Same destructive replacement as "App default" above, so
                  // it goes through the same dirty guard.
                  onClick={() =>
                    dirty
                      ? setConfirmApplyPreset(p.id)
                      : setRows(p.rows.map((r) => ({ ...r })))
                  }
                  className="min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-[12px] font-semibold transition-colors hover:border-teal/50 active:bg-surface disabled:opacity-50"
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
                {/* two-tap delete: the ✕ used to erase a preset instantly.
                    It also needs a way OUT — every other confirm in this file
                    pairs the destructive button with a Keep. */}
                {confirmDeletePreset === p.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmDeletePreset(null)}
                      className="shrink-0 rounded-full px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={presetBusy}
                      onClick={() => {
                        setConfirmDeletePreset(null)
                        void handleDeletePreset(p)
                      }}
                      className="shrink-0 rounded-full bg-coral/90 px-2.5 py-1.5 text-[11px] font-bold text-bg disabled:opacity-50"
                    >
                      Delete?
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={presetBusy}
                    onClick={() => setConfirmDeletePreset(p.id)}
                    aria-label={`Delete ${p.name}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-coral disabled:opacity-50"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                )}
              </div>
              ),
            )}
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
            <GearIcon size={11} />
            {/* NOT "Settings" — the header gear owns that word. This one only
                opens rename / add / remove / leave. */}
            {manageOpen ? 'Done' : 'Manage'}
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
                      className="group -mx-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors active:bg-surface-2 disabled:cursor-default disabled:active:bg-transparent"
                    >
                      <Avatar
                        avatarKey={m.avatarKey}
                        displayName={m.displayName}
                        color={AVATAR_PALETTE[i % AVATAR_PALETTE.length]}
                        size={36}
                        className="transition-transform group-active:scale-95"
                      />
                      <span className={`min-w-0 flex-1 truncate text-[14px] font-medium ${isYou ? '' : 'transition-colors group-hover:text-teal'}`}>
                        {m.displayName}
                        {isYou && <span className="ml-1.5 text-muted">(you)</span>}
                      </span>
                    </button>
                    {credFlair(cred.get(m.userId) ?? 0) && (
                      <span className="shrink-0 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-gold">
                        {credFlair(cred.get(m.userId) ?? 0)}
                      </span>
                    )}
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
                          // handleAdd only removes the row AFTER its await, so
                          // without this a fast double tap fired two inserts.
                          disabled={addedIds.has(u.userId)}
                          onClick={() => void handleAdd(u)}
                          className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-surface disabled:opacity-50 ${
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
      </div>
      )}
    </div>
  )
}
