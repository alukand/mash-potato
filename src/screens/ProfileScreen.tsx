import { useEffect, useState } from 'react'
import {
  fetchMyExport,
  fetchMyGlobalRatings,
  fetchMyReviewedTitles,
  fetchMySavedTitles,
  posterUrl,
  signOut,
  updateMyDisplayName,
} from '../lib/api'
import type { GroupInfo, RatedTitle, ReviewedTitle, SavedTitle } from '../lib/api'
import { GroupMark, fieldClassSm } from '../components/ui'

interface ProfileScreenProps {
  userId: string
  displayName: string
  groups: GroupInfo[]
  activeGroupId: string | null
  onSwitchGroup: (id: string) => void
  onCreateGroup: () => void
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  /** The display name changed; refresh whatever caches it. */
  onNameChanged: () => void
  onBack: () => void
}

interface GridItem {
  titleId: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterPath: string | null
}

// A 3-column poster grid shared by the Reviewed, Rated, and Saved sections.
function PosterGrid({
  items,
  onOpenTitle,
  badge,
}: {
  items: GridItem[]
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  /** Optional corner label on each tile (e.g. "Solo"). */
  badge?: string
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((it) => (
        <button
          key={it.titleId}
          type="button"
          disabled={it.tmdbId === null}
          onClick={() => it.tmdbId !== null && onOpenTitle(it.tmdbId, it.mediaType)}
          className="group text-left disabled:opacity-70"
        >
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-line/60 bg-surface-2">
            {badge && (
              <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-bg/70 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-teal backdrop-blur-sm">
                {badge}
              </span>
            )}
            {it.posterPath ? (
              <img
                src={posterUrl(it.posterPath, 'w342')}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-active:scale-95"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-full w-full place-items-center font-display text-2xl font-semibold text-bg"
                style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
              >
                {it.name.charAt(0)}
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate text-[12px] font-medium leading-tight">{it.name}</p>
          <p className="font-mono text-[10px] text-muted">{it.year ?? '—'}</p>
        </button>
      ))}
    </div>
  )
}

// Personal profile: who you are (editable), every group you're in (tap to make
// active), the titles you've reviewed, your saved list, and your data. Lives on
// the App view-stack. Account actions (sign out) live here and only here.
export function ProfileScreen({
  userId,
  displayName,
  groups,
  activeGroupId,
  onSwitchGroup,
  onCreateGroup,
  onOpenTitle,
  onNameChanged,
  onBack,
}: ProfileScreenProps) {
  const [reviewed, setReviewed] = useState<ReviewedTitle[]>([])
  const [rated, setRated] = useState<RatedTitle[]>([])
  const [saved, setSaved] = useState<SavedTitle[]>([])
  const [loading, setLoading] = useState(true)

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
    ])
      .then(([r, g, s]) => {
        if (cancelled) return
        setReviewed(r)
        setRated(g)
        setSaved(s)
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

  async function handleSaveName() {
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
    <div className="px-5 pt-safe">
      <header className="mp-rise mb-6 flex items-center justify-between">
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
        <button
          type="button"
          onClick={() => void signOut()}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-coral"
        >
          Sign out
        </button>
      </header>

      {/* ---- identity (editable) ---- */}
      <section className="mp-rise flex items-center gap-4">
        <span
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-2xl font-semibold text-bg"
          style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
        >
          {shownName.charAt(0).toUpperCase()}
        </span>
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
            <p role="alert" className="mt-1 text-[12px] leading-snug text-coral">
              {nameError}
            </p>
          )}
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
              <button
                key={g.id}
                type="button"
                onClick={() => onSwitchGroup(g.id)}
                className="group flex w-full items-center gap-3 px-5 py-3.5 text-left"
              >
                <GroupMark groupId={g.id} name={g.name} size={34} className="transition-transform group-active:scale-95" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold transition-colors group-hover:text-teal">
                    {g.name}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {g.role}
                  </p>
                </div>
                {isActive ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-teal">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                    Active
                  </span>
                ) : (
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors group-hover:text-text">
                    Switch
                  </span>
                )}
              </button>
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
        <p className="mt-2 px-2 text-[11px] leading-snug text-muted">
          Copies every solo rating and saved title as JSON. Your history is yours.
        </p>
      </section>
    </div>
  )
}
