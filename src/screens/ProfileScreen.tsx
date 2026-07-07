import { useEffect, useState } from 'react'
import { fetchMySavedTitles, posterUrl, signOut } from '../lib/api'
import type { GroupInfo, SavedTitle } from '../lib/api'

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

// Personal profile: who you are, every group you're in (tap to make active),
// and your saved titles. Lives on the App view-stack.
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
  const [saved, setSaved] = useState<SavedTitle[]>([])
  const [loadingSaved, setLoadingSaved] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingSaved(true)
    fetchMySavedTitles(userId)
      .then((s) => !cancelled && setSaved(s))
      .catch(() => !cancelled && setSaved([]))
      .finally(() => !cancelled && setLoadingSaved(false))
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
            {groups.length} group{groups.length === 1 ? '' : 's'} · {saved.length} saved
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

      {/* ---- saved list ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '160ms' }}>
        <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Saved
        </p>
        {loadingSaved ? (
          <p className="px-1 text-[13px] text-muted">Loading…</p>
        ) : saved.length === 0 ? (
          <p className="px-1 text-[13px] leading-snug text-muted">
            Nothing saved yet — open any title from Discover and tap “Save to your list”.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {saved.map((s) => (
              <button
                key={s.titleId}
                type="button"
                disabled={s.tmdbId === null}
                onClick={() => s.tmdbId !== null && onOpenTitle(s.tmdbId, s.mediaType)}
                className="group text-left disabled:opacity-70"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-line/60 bg-surface-2">
                  {s.posterPath ? (
                    <img
                      src={posterUrl(s.posterPath, 'w342')}
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
                      {s.name.charAt(0)}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-[12px] font-medium leading-tight">{s.name}</p>
                <p className="font-mono text-[10px] text-muted">{s.year ?? '—'}</p>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
