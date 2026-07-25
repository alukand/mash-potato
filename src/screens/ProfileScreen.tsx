import { useEffect, useState } from 'react'
import {
  createPlaylist,
  deleteMyAccount,
  fetchMyAvatarKey,
  fetchMyEmail,
  fetchMyTasteMode,
  updateMyTasteMode,
  fetchMyExport,
  fetchMyFriends,
  fetchMyGlobalRatings,
  fetchMyPlaylists,
  fetchMyReviewedTitles,
  fetchMySavedTitles,
  requestEmailChange,
  setGroupVisibility,
  signOutLocal,
  updateMyAvatar,
  updateMyDisplayName,
  updateMyPassword,
  verifyCurrentPassword,
  verifyEmailChange,
} from '../lib/api'
import { signOutWithPushCleanup } from '../lib/push'
import type {
  FriendInfo,
  GroupInfo,
  PlaylistSummary,
  RatedTitle,
  ReviewedTitle,
  SavedTitle,
} from '../lib/api'
import { GroupMark, VisibilityChip, fieldClassSm } from '../components/ui'
import { PlaylistCard } from '../components/PlaylistCard'
import { PosterGrid } from '../components/PosterGrid'
import { colorForUser } from '../lib/palette'
import { AVATAR_CATALOG, Avatar } from '../components/avatars'
import { TASTE_MODES } from '../lib/rubricCatalog'
import type { TasteMode } from '../lib/rubricCatalog'

interface ProfileScreenProps {
  userId: string
  displayName: string
  groups: GroupInfo[]
  activeGroupId: string | null
  onSwitchGroup: (id: string) => void
  onCreateGroup: () => void
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  onOpenUser: (userId: string) => void
  onOpenPlaylist: (playlistId: string) => void
  /** The display name changed; refresh whatever caches it. */
  onNameChanged: () => void
  /** Group visibility flipped; refetch the group list. */
  onGroupsChanged: () => Promise<void>
  /** Present when pushed on the view-stack; absent as the Profile tab. */
  onBack?: () => void
}

// Personal profile: who you are (editable), every group you're in (tap to
// make active, toggle what shows publicly), your playlists, your friends
// (everyone you share a group with), the titles you've reviewed, your saved
// list, and your data. Lives on the App view-stack. Account actions (sign
// out) live here and only here.
export function ProfileScreen({
  userId,
  displayName,
  groups,
  activeGroupId,
  onSwitchGroup,
  onCreateGroup,
  onOpenTitle,
  onOpenUser,
  onOpenPlaylist,
  onNameChanged,
  onGroupsChanged,
  onBack,
}: ProfileScreenProps) {
  const [reviewed, setReviewed] = useState<ReviewedTitle[]>([])
  const [rated, setRated] = useState<RatedTitle[]>([])
  const [saved, setSaved] = useState<SavedTitle[]>([])
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([])
  const [friends, setFriends] = useState<FriendInfo[]>([])
  const [loading, setLoading] = useState(true)

  // ---- new playlist + per-group visibility ----
  const [newListOpen, setNewListOpen] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [listBusy, setListBusy] = useState(false)
  const [visBusyId, setVisBusyId] = useState<string | null>(null)

  // ---- avatar picker ----
  const [avatarKey, setAvatarKey] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)

  // ---- taste mode (Normie or Cinephile) ----
  const [tasteMode, setTasteMode] = useState<TasteMode | null>(null)
  const [modeBusy, setModeBusy] = useState(false)

  // ---- account: email + password + deletion ----
  const [myEmail, setMyEmail] = useState<string | null>(null)
  const [emailStage, setEmailStage] = useState<'closed' | 'input' | 'verify'>('closed')
  const [newEmail, setNewEmail] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailNotice, setEmailNotice] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwNotice, setPwNotice] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)
  const [dangerOpen, setDangerOpen] = useState(false)
  const [dangerText, setDangerText] = useState('')
  const [dangerBusy, setDangerBusy] = useState(false)
  const [dangerError, setDangerError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMyEmail().then((e) => !cancelled && setMyEmail(e))
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSendEmailCode() {
    setEmailBusy(true)
    setEmailError(null)
    setEmailNotice(null)
    try {
      await requestEmailChange(newEmail.trim())
      setEmailStage('verify')
      setEmailNotice(`Code sent to ${newEmail.trim()}.`)
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not send the code')
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleConfirmEmail() {
    setEmailBusy(true)
    setEmailError(null)
    try {
      await verifyEmailChange(newEmail.trim(), emailCode.trim())
      setMyEmail(newEmail.trim())
      setEmailStage('closed')
      setNewEmail('')
      setEmailCode('')
      setEmailNotice('Email updated.')
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not verify the code')
    } finally {
      setEmailBusy(false)
    }
  }

  async function handleChangePassword() {
    if (!myEmail) return
    setPwBusy(true)
    setPwError(null)
    setPwNotice(null)
    try {
      await verifyCurrentPassword(myEmail, pwCurrent)
      await updateMyPassword(pwNew)
      setPwOpen(false)
      setPwCurrent('')
      setPwNew('')
      setPwNotice('Password updated.')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not update the password')
    } finally {
      setPwBusy(false)
    }
  }

  async function handleDeleteAccount() {
    setDangerBusy(true)
    setDangerError(null)
    try {
      await deleteMyAccount()
      // The server no longer knows us; clear the local session and let
      // App's auth listener land on the sign-in screen.
      await signOutLocal()
    } catch (err) {
      setDangerError(err instanceof Error ? err.message : 'Could not delete the account')
      setDangerBusy(false)
    }
  }

  async function handlePickAvatar(key: string | null) {
    if (avatarBusy) return
    setAvatarBusy(true)
    try {
      await updateMyAvatar(userId, key)
      setAvatarKey(key)
      setPickerOpen(false)
      // the header and member rows cache it; refresh them
      onNameChanged()
    } catch {
      // non-fatal; the sheet stays open to retry
    } finally {
      setAvatarBusy(false)
    }
  }

  // ---- name editing ----
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(displayName)
  const [shownName, setShownName] = useState(displayName)
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  // ---- data export ----
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    setShownName(displayName)
    setNameDraft(displayName)
  }, [displayName])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchMyReviewedTitles(userId),
      fetchMyGlobalRatings(userId),
      fetchMySavedTitles(userId),
      fetchMyPlaylists(userId).catch(() => []),
      fetchMyFriends(userId).catch(() => []),
      fetchMyAvatarKey(userId).catch(() => null),
      fetchMyTasteMode(userId).catch(() => null),
    ])
      .then(([r, g, s, p, f, a, mode]) => {
        if (cancelled) return
        setReviewed(r)
        setRated(g)
        setSaved(s)
        setPlaylists(p)
        setFriends(f)
        setAvatarKey(a)
        setTasteMode(mode)
      })
      .catch(() => {
        if (cancelled) return
        setReviewed([])
        setRated([])
        setSaved([])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [userId])

  async function handleSwitchMode(next: TasteMode) {
    if (modeBusy || tasteMode === next) return
    const prev = tasteMode
    setModeBusy(true)
    setTasteMode(next)
    try {
      await updateMyTasteMode(userId, next)
    } catch {
      setTasteMode(prev)
    } finally {
      setModeBusy(false)
    }
  }

  async function handleSaveName() {
    if (nameBusy) return
    const name = nameDraft.trim()
    if (name.length === 0 || name === shownName) {
      setEditingName(false)
      return
    }
    setNameBusy(true)
    setNameError(null)
    try {
      await updateMyDisplayName(userId, name)
      setShownName(name)
      setEditingName(false)
      onNameChanged()
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not save your name')
    } finally {
      setNameBusy(false)
    }
  }

  async function handleCreatePlaylist() {
    // Enter in the name field lands here too; the busy check is the guard
    // the disabled button can't provide.
    if (listBusy) return
    const name = newListName.trim()
    if (name.length === 0) return
    setListBusy(true)
    try {
      await createPlaylist(userId, name)
      setPlaylists(await fetchMyPlaylists(userId))
      setNewListName('')
      setNewListOpen(false)
    } catch {
      // non-fatal; the button re-enables
    } finally {
      setListBusy(false)
    }
  }

  async function handleToggleGroupVisibility(g: GroupInfo) {
    setVisBusyId(g.id)
    try {
      await setGroupVisibility(g.id, !g.isPublic)
      await onGroupsChanged()
    } catch {
      // non-fatal
    } finally {
      setVisBusyId(null)
    }
  }

  async function handleExport() {
    setExportState('busy')
    try {
      const payload = await fetchMyExport(userId)
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setExportState('copied')
    } catch {
      setExportState('failed')
    }
    setTimeout(() => setExportState('idle'), 2500)
  }

  return (
    <div className={onBack ? 'px-5 pt-safe' : ''}>
      <header className="mp-rise mb-6 flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="grid h-9 w-9 place-items-center rounded-full border border-line/60 text-text transition-colors hover:text-teal"
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 5-7 7 7 7" />
            </svg>
          </button>
        ) : (
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Your profile
          </p>
        )}
        <button
          type="button"
          onClick={() => void signOutWithPushCleanup()}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-coral"
        >
          Sign out
        </button>
      </header>

      {/* ---- identity (editable) ---- */}
      <section className="mp-rise flex items-center gap-4">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Change your avatar"
          className="relative shrink-0 transition-transform active:scale-95"
        >
          <Avatar
            avatarKey={avatarKey}
            displayName={shownName}
            color={colorForUser(userId)}
            size={64}
          />
          <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface-2 text-muted">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
            </svg>
          </span>
        </button>
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                maxLength={60}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSaveName()}
                aria-label="Display name"
                className={`flex-1 ${fieldClassSm}`}
              />
              <button
                type="button"
                disabled={nameBusy || nameDraft.trim().length === 0}
                onClick={() => void handleSaveName()}
                className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
              >
                {nameBusy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingName(false)
                  setNameDraft(shownName)
                  setNameError(null)
                }}
                aria-label="Cancel"
                className="shrink-0 rounded-full px-2 py-2 font-mono text-[10px] uppercase text-muted hover:text-text"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 truncate font-display text-[26px] font-semibold leading-tight">
                {shownName}
              </h1>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                aria-label="Edit your display name"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line/60 text-muted transition-colors hover:border-teal/50 hover:text-teal"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            </div>
          )}
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {groups.length} group{groups.length === 1 ? '' : 's'}, {rated.length} rated,{' '}
            {saved.length} saved
          </p>
          {nameError && (
            <p role="alert" className="mt-1 text-[13px] leading-snug text-coral">
              {nameError}
            </p>
          )}
        </div>
      </section>

      {/* ---- taste mode ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '60ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          How you score
        </p>
        <div className="mp-card rounded-[22px] p-4">
          <div className="flex items-center gap-1.5">
            {(['casual', 'buff'] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={modeBusy || tasteMode === null}
                onClick={() => void handleSwitchMode(m)}
                className={`flex-1 rounded-full border px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                  tasteMode === m
                    ? 'border-teal/50 bg-teal/10 text-teal'
                    : 'border-line text-muted hover:text-text'
                }`}
              >
                {TASTE_MODES[m].label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[13px] leading-snug text-muted">
            {tasteMode ? TASTE_MODES[tasteMode].blurb : 'Loading your mode.'} This sets your solo
            rating card, which community number is yours, and the default for groups you create.
            Each group scores by its own mode.
          </p>
        </div>
      </section>

      {/* ---- groups ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '80ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Your groups
        </p>
        <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
          {groups.map((g) => {
            const isActive = g.id === activeGroupId
            return (
              <div key={g.id} className="flex items-center gap-3 px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => onSwitchGroup(g.id)}
                  className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <GroupMark groupId={g.id} name={g.name} size={34} className="transition-transform group-active:scale-95" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold transition-colors group-hover:text-teal">
                      {g.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      {g.role}
                      {isActive ? <span className="text-teal"> active</span> : ''}
                    </p>
                  </div>
                </button>
                <VisibilityChip
                  isPublic={g.isPublic}
                  disabled={visBusyId === g.id}
                  onToggle={() => void handleToggleGroupVisibility(g)}
                  ariaLabel={
                    g.isPublic
                      ? `Hide ${g.name} from your public profile`
                      : `Show ${g.name} on your public profile`
                  }
                />
              </div>
            )
          })}
          <button
            type="button"
            onClick={onCreateGroup}
            className="group flex w-full items-center gap-2 px-5 py-3.5 text-left font-semibold text-teal"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-active:scale-90" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="text-[14px]">Create another group</span>
          </button>
        </div>
        <p className="mt-2 px-2 text-[12px] leading-snug text-muted">
          Groups show on your profile when friends look you up. Flip any of them
          private with its chip.
        </p>
      </section>

      {/* ---- playlists ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '120ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Playlists
        </p>
        {playlists.length > 0 && (
          <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
            {playlists.map((p) => (
              <PlaylistCard
                key={p.id}
                name={p.name}
                itemCount={p.itemCount}
                posters={p.posters}
                description={p.description}
                visibility={p.isPublic ? 'public' : 'private'}
                onOpen={() => onOpenPlaylist(p.id)}
              />
            ))}
          </div>
        )}
        {playlists.length === 0 && !newListOpen && (
          <p className="px-1 text-[13px] leading-snug text-muted">
            Build watchlists and themed shelves: rainy day comfort films, horror for
            October, films to argue about. Friends can browse them from your profile.
          </p>
        )}
        {newListOpen ? (
          <div className="mt-3 flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              maxLength={80}
              placeholder="Playlist name…"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleCreatePlaylist()}
              className={`flex-1 ${fieldClassSm}`}
            />
            <button
              type="button"
              disabled={listBusy || newListName.trim().length === 0}
              onClick={() => void handleCreatePlaylist()}
              className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
            >
              {listBusy ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setNewListOpen(false)
                setNewListName('')
              }}
              aria-label="Cancel"
              className="shrink-0 rounded-full px-2 py-2 font-mono text-[10px] uppercase text-muted hover:text-text"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNewListOpen(true)}
            className="mt-3 w-full rounded-xl border border-dashed border-line px-3 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
          >
            + New playlist
          </button>
        )}
      </section>

      {/* ---- friends: everyone you share a group with ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '140ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Friends
        </p>
        {friends.length === 0 ? (
          <p className="px-1 text-[13px] leading-snug text-muted">
            Friends are the people in your groups. Add someone to a group and they show
            up here.
          </p>
        ) : (
          <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
            {friends.map((f) => (
              <button
                key={f.userId}
                type="button"
                onClick={() => onOpenUser(f.userId)}
                className="group flex w-full items-center gap-3 px-5 py-3 text-left"
              >
                <Avatar
                  avatarKey={f.avatarKey}
                  displayName={f.displayName}
                  color={colorForUser(f.userId)}
                  size={36}
                  className="transition-transform group-active:scale-95"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium transition-colors group-hover:text-teal">
                    {f.displayName}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted">
                    {f.sharedGroups.join(', ')}
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted transition-colors group-hover:text-teal" aria-hidden>
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---- reviewed ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '160ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Reviewed
        </p>
        {loading ? (
          <p className="px-1 text-[13px] text-muted">Loading…</p>
        ) : reviewed.length === 0 ? (
          <p className="px-1 text-[13px] leading-snug text-muted">
            Nothing reviewed yet. Score a title with your group and it shows up here.
          </p>
        ) : (
          <PosterGrid items={reviewed} onOpenTitle={onOpenTitle} />
        )}
      </section>

      {/* ---- rated solo (community) ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '220ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Rated
        </p>
        {loading ? (
          <p className="px-1 text-[13px] text-muted">Loading…</p>
        ) : rated.length === 0 ? (
          <p className="px-1 text-[13px] leading-snug text-muted">
            Nothing rated yet. Open any title and rate it yourself to add to the community score.
          </p>
        ) : (
          <PosterGrid items={rated} onOpenTitle={onOpenTitle} badge="Solo" />
        )}
      </section>

      {/* ---- saved list ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '300ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Saved
        </p>
        {loading ? (
          <p className="px-1 text-[13px] text-muted">Loading…</p>
        ) : saved.length === 0 ? (
          <p className="px-1 text-[13px] leading-snug text-muted">
            Nothing saved yet. Open any title from Discover and tap “Save”.
          </p>
        ) : (
          <PosterGrid items={saved} onOpenTitle={onOpenTitle} />
        )}
      </section>

      {/* ---- account: email + password ---- */}
      <section className="mp-rise mt-8" style={{ animationDelay: '340ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Account
        </p>
        <div className="mp-card rounded-2xl px-4 py-1">
          {/* email row */}
          <div className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">Email</p>
                <p className="truncate text-[12px] text-muted">{myEmail ?? '…'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmailStage(emailStage === 'closed' ? 'input' : 'closed')
                  setEmailError(null)
                  setEmailNotice(null)
                }}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
              >
                {emailStage === 'closed' ? 'Change' : 'Cancel'}
              </button>
            </div>
            {emailStage !== 'closed' && (
              <div className="mt-2.5 flex flex-col gap-2">
                <input
                  type="email"
                  placeholder="New email"
                  autoComplete="email"
                  value={newEmail}
                  disabled={emailBusy || emailStage === 'verify'}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={`${fieldClassSm} w-full disabled:opacity-60`}
                />
                {emailStage === 'verify' && (
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code from the new address"
                    autoComplete="one-time-code"
                    value={emailCode}
                    disabled={emailBusy}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                    className={`${fieldClassSm} w-full text-center font-mono tracking-[0.3em]`}
                  />
                )}
                <button
                  type="button"
                  disabled={emailBusy || (emailStage === 'input' ? newEmail.trim().length < 5 : emailCode.length < 6)}
                  onClick={() =>
                    void (emailStage === 'input' ? handleSendEmailCode() : handleConfirmEmail())
                  }
                  className="rounded-full border border-teal/40 bg-teal/10 py-2 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
                >
                  {emailBusy
                    ? 'One sec…'
                    : emailStage === 'input'
                      ? 'Send code to the new address'
                      : 'Confirm new email'}
                </button>
              </div>
            )}
            {emailNotice && !emailError && (
              <p className="mt-2 text-[12px] leading-snug text-teal">{emailNotice}</p>
            )}
            {emailError && (
              <p role="alert" className="mt-2 text-[12px] leading-snug text-coral">
                {emailError}
              </p>
            )}
          </div>

          {/* password row */}
          <div className="border-t border-line/50 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold">Password</p>
                <p className="text-[12px] text-muted">Changing it signs nobody out.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPwOpen(!pwOpen)
                  setPwError(null)
                  setPwNotice(null)
                }}
                className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
              >
                {pwOpen ? 'Cancel' : 'Change'}
              </button>
            </div>
            {pwOpen && (
              <div className="mt-2.5 flex flex-col gap-2">
                <input
                  type="password"
                  placeholder="Current password"
                  autoComplete="current-password"
                  value={pwCurrent}
                  disabled={pwBusy}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  className={`${fieldClassSm} w-full`}
                />
                <input
                  type="password"
                  placeholder="New password (8+ characters)"
                  autoComplete="new-password"
                  value={pwNew}
                  disabled={pwBusy}
                  onChange={(e) => setPwNew(e.target.value)}
                  className={`${fieldClassSm} w-full`}
                />
                <button
                  type="button"
                  disabled={pwBusy || pwCurrent.length === 0 || pwNew.length < 8}
                  onClick={() => void handleChangePassword()}
                  className="rounded-full border border-teal/40 bg-teal/10 py-2 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
                >
                  {pwBusy ? 'Updating…' : 'Update password'}
                </button>
              </div>
            )}
            {pwNotice && !pwError && (
              <p className="mt-2 text-[12px] leading-snug text-teal">{pwNotice}</p>
            )}
            {pwError && (
              <p role="alert" className="mt-2 text-[12px] leading-snug text-coral">
                {pwError}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- your data ---- */}
      <section className="mp-rise mt-8" style={{ animationDelay: '360ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Your data
        </p>
        <button
          type="button"
          disabled={exportState === 'busy'}
          onClick={() => void handleExport()}
          className={`flex w-full items-center justify-center gap-2 rounded-full border py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
            exportState === 'copied'
              ? 'border-teal/40 bg-teal/10 text-teal'
              : exportState === 'failed'
                ? 'border-coral/40 text-coral'
                : 'border-line text-muted hover:border-teal/50 hover:text-text'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          {exportState === 'busy'
            ? 'Gathering…'
            : exportState === 'copied'
              ? 'Copied to clipboard ✓'
              : exportState === 'failed'
                ? 'Could not copy, try again'
                : 'Export my ratings (JSON)'}
        </button>
        <p className="mt-2 px-2 text-[12px] leading-snug text-muted">
          Copies your solo ratings, saved titles, group scorecards, one-liners, takes,
          playlists, and rubric presets as JSON. Your history is yours.
        </p>
        {/* ---- avatar picker sheet ---- */}
        {pickerOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm"
            onClick={() => setPickerOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Pick your avatar"
              className="mp-card max-h-[80dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[26px] px-6 pb-safe pt-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="font-display text-[22px] font-semibold leading-tight">
                Pick your look
              </h2>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                Original portraits from the movies, not from any movie.
              </p>
              {/* dense grid: every option visible without scrolling the sheet */}
              <div className="mt-4 grid grid-cols-5 gap-1.5">
                <button
                  type="button"
                  disabled={avatarBusy}
                  onClick={() => void handlePickAvatar(null)}
                  aria-label="Your initial"
                  className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors ${
                    avatarKey === null ? 'bg-teal/10 ring-1 ring-teal/50' : 'hover:bg-surface-2'
                  }`}
                >
                  <Avatar
                    avatarKey={null}
                    displayName={shownName}
                    color={colorForUser(userId)}
                    size={44}
                  />
                  <span className="font-mono text-[8px] uppercase tracking-wide text-muted">
                    Initial
                  </span>
                </button>
                {AVATAR_CATALOG.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => void handlePickAvatar(a.key)}
                    aria-label={a.label}
                    className={`flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors ${
                      avatarKey === a.key ? 'bg-teal/10 ring-1 ring-teal/50' : 'hover:bg-surface-2'
                    }`}
                  >
                    <Avatar avatarKey={a.key} displayName={a.label} color="#000" size={44} />
                    <span className="w-full truncate text-center font-mono text-[8px] uppercase tracking-wide text-muted">
                      {a.label.replace('The ', '')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* published support contact (App Review guideline 1.2) */}
        <p className="mt-4 px-2 text-center text-[12px] leading-snug text-muted">
          Questions, reports, or feedback:{' '}
          <a
            href="mailto:alexanderlukasland@gmail.com?subject=Mash%20Potato%20support"
            className="text-teal"
          >
            alexanderlukasland@gmail.com
          </a>
        </p>
      </section>

      {/* ---- danger zone: account deletion (App Review 5.1.1(v)) ---- */}
      <section className="mp-rise mt-8" style={{ animationDelay: '400ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-coral/80">
          Danger zone
        </p>
        {dangerOpen ? (
          <div className="rounded-2xl border border-coral/40 bg-coral/5 p-4">
            <p className="text-[13px] font-semibold leading-snug text-coral">
              Delete your account for good?
            </p>
            <p className="mt-1.5 text-[12px] leading-snug text-muted">
              Your scores, one-liners, takes, playlists, and profile are erased. Groups you
              own pass to their longest-standing member; groups where you are alone are
              deleted. Group reveals you were part of keep the others&apos; scores. This
              cannot be undone.
            </p>
            <input
              type="text"
              placeholder='Type "DELETE" to confirm'
              value={dangerText}
              disabled={dangerBusy}
              onChange={(e) => setDangerText(e.target.value)}
              className={`${fieldClassSm} mt-3 w-full`}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={dangerBusy || dangerText.trim() !== 'DELETE'}
                onClick={() => void handleDeleteAccount()}
                className="flex-1 rounded-full bg-coral py-2 text-[12px] font-semibold text-bg transition-opacity disabled:opacity-40"
              >
                {dangerBusy ? 'Deleting…' : 'Delete my account'}
              </button>
              <button
                type="button"
                disabled={dangerBusy}
                onClick={() => {
                  setDangerOpen(false)
                  setDangerText('')
                  setDangerError(null)
                }}
                className="flex-1 rounded-full border border-line py-2 text-[12px] font-semibold text-muted transition-colors hover:text-text"
              >
                Keep my account
              </button>
            </div>
            {dangerError && (
              <p role="alert" className="mt-2 text-[12px] leading-snug text-coral">
                {dangerError}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDangerOpen(true)}
            className="w-full rounded-full border border-coral/40 py-2.5 text-[13px] font-semibold text-coral transition-colors hover:bg-coral/10"
          >
            Delete my account…
          </button>
        )}
      </section>
    </div>
  )
}
