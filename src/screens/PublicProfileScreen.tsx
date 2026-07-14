import { useEffect, useState } from 'react'
import { fetchPublicProfile } from '../lib/api'
import type { PublicProfile } from '../lib/api'
import { GroupMark } from '../components/ui'
import { PlaylistCard } from '../components/PlaylistCard'

interface PublicProfileScreenProps {
  /** The person being viewed. */
  userId: string
  onOpenPlaylist: (playlistId: string) => void
  onBack: () => void
}

// Someone else's PUBLIC profile: their name, the groups they chose to show,
// and their public playlists. Everything else stays private by design.
export function PublicProfileScreen({ userId, onOpenPlaylist, onBack }: PublicProfileScreenProps) {
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    fetchPublicProfile(userId)
      .then((p) => !cancelled && setProfile(p))
      .catch((err) => {
        if (cancelled) return
        setProfile(null)
        setError(err instanceof Error ? err.message : 'Could not load this profile')
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <div className="px-5 pt-safe">
      <header className="mp-rise mb-6">
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
      </header>

      {profile === undefined && (
        <p className="mp-rise py-10 text-center text-[13px] text-muted">Loading…</p>
      )}
      {profile === null && (
        <p className="mp-rise py-10 text-center text-[13px] text-coral">
          {error ?? 'No profile here.'}
        </p>
      )}

      {profile && (
        <>
          {/* ---- identity ---- */}
          <section className="mp-rise flex items-center gap-4">
            <span
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full font-display text-2xl font-semibold text-bg"
              style={{ backgroundImage: 'linear-gradient(160deg, #E7B24E, #E07A5F)' }}
            >
              {profile.displayName.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-[26px] font-semibold leading-tight">
                {profile.displayName}
              </h1>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                {profile.groups.length} group{profile.groups.length === 1 ? '' : 's'} shown,{' '}
                {profile.playlists.length} public playlist
                {profile.playlists.length === 1 ? '' : 's'}
              </p>
            </div>
          </section>

          {/* ---- groups they chose to show ---- */}
          <section className="mp-rise mt-7" style={{ animationDelay: '80ms' }}>
            <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Groups
            </p>
            {profile.groups.length === 0 ? (
              <p className="px-1 text-[13px] leading-snug text-muted">
                {profile.displayName} keeps their groups private.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {profile.groups.map((g) => (
                  <span
                    key={g.id}
                    className="flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1.5 pl-1.5 pr-3.5 text-[12px] font-semibold"
                  >
                    <GroupMark groupId={g.id} name={g.name} size={22} />
                    {g.name}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* ---- public playlists ---- */}
          <section className="mp-rise mt-7" style={{ animationDelay: '160ms' }}>
            <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Playlists
            </p>
            {profile.playlists.length === 0 ? (
              <p className="px-1 text-[13px] leading-snug text-muted">
                No public playlists yet.
              </p>
            ) : (
              <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
                {profile.playlists.map((p) => (
                  <PlaylistCard
                    key={p.id}
                    name={p.name}
                    itemCount={p.itemCount}
                    posters={p.posters}
                    description={p.description}
                    onOpen={() => onOpenPlaylist(p.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
