import { useEffect, useState } from 'react'
import { fetchMyReviewedTitles, fetchMySavedTitles, posterUrl, signOut } from '../lib/api'
import type { GroupInfo, ReviewedTitle, SavedTitle } from '../lib/api'

interface ProfileScreenProps {
  userId: string
  displayName: string
  groups: GroupInfo[]
  activeGroupId: string | null
  onSwitchGroup: (id: string) => void
  onCreateGroup: () => void
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
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

// A 3-column poster grid shared by the Reviewed and Saved sections.
function PosterGrid({
  items,
  onOpenTitle,
}: {
  items: GridItem[]
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
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

// Personal profile: who you are, every group you're in (tap to make active),
// the titles you've reviewed, and your saved list. Lives on the App view-stack.
export function ProfileScreen({
  userId,
  displayName,
  groups,
  activeGroupId,
  onSwitchGroup,
  onCreateGroup,
  onOpenTitle,
  onBack,
}: ProfileScreenProps) {
  const [reviewed, setReviewed] = useState<ReviewedTitle[]>([])
  const [saved, setSaved] = useState<SavedTitle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([fetchMyReviewedTitles(userId), fetchMySavedTitles(userId)])
      .then(([r, s]) => {
        if (cancelled) return
        setReviewed(r)
        setSaved(s)
      })
      .catch(() => {
        if (cancelled) return
        setReviewed([])
        setSaved([])
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <div className="px-5 pt-6">
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

      {/* ---- identity ---- */}
      <section className="mp-rise flex items-center gap-4">
        <span
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-2xl font-semibold text-bg"
          style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
        >
          {displayName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[26px] font-semibold leading-tight">
            {displayName}
          </h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            {groups.length} group{groups.length === 1 ? '' : 's'} · {reviewed.length} reviewed ·{' '}
            {saved.length} saved
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
              <button
                key={g.id}
                type="button"
                onClick={() => onSwitchGroup(g.id)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-surface"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{g.name}</p>
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
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    Switch
                  </span>
                )}
              </button>
            )
          })}
          <button
            type="button"
            onClick={onCreateGroup}
            className="flex w-full items-center gap-2 px-5 py-3.5 text-left font-semibold text-teal transition-colors hover:bg-surface"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
            Nothing reviewed yet — score a title with your group and it shows up here.
          </p>
        ) : (
          <PosterGrid items={reviewed} onOpenTitle={onOpenTitle} />
        )}
      </section>

      {/* ---- saved list ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '240ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Saved
        </p>
        {loading ? (
          <p className="px-1 text-[13px] text-muted">Loading…</p>
        ) : saved.length === 0 ? (
          <p className="px-1 text-[13px] leading-snug text-muted">
            Nothing saved yet — open any title from Discover and tap “Save to your list”.
          </p>
        ) : (
          <PosterGrid items={saved} onOpenTitle={onOpenTitle} />
        )}
      </section>
    </div>
  )
}
