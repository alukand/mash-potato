import { useEffect, useState } from 'react'
import {
  fetchFollowState,
  fetchFollowingFeed,
  fetchPublicProfile,
  followUser,
  unfollowUser,
} from '../lib/api'
import type { FeedRating, FollowState, PublicProfile } from '../lib/api'
import { colorForUser } from '../lib/palette'
import type { OpenTitle } from '../lib/urlState'
import { Avatar } from '../components/avatars'
import { FeedList } from '../components/FollowingFeed'
import { GroupMark } from '../components/ui'
import { PlaylistCard } from '../components/PlaylistCard'

interface PublicProfileScreenProps {
  /** The person being viewed. */
  userId: string
  onOpenPlaylist: (playlistId: string) => void
  /** Open a title from their shared ratings. */
  onOpenTitle: OpenTitle
  onBack: () => void
}

// Someone else's PUBLIC profile: their name, the groups they chose to show,
// and their public playlists. Their ratings appear only to people who follow
// them, and only if they chose to share them (20261002140000). Everything else
// stays private by design.
export function PublicProfileScreen({ userId, onOpenPlaylist, onOpenTitle, onBack }: PublicProfileScreenProps) {
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [follow, setFollow] = useState<FollowState | null>(null)
  const [ratings, setRatings] = useState<FeedRating[]>([])
  const [followBusy, setFollowBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setProfile(undefined)
    setFollow(null)
    setRatings([])
    fetchPublicProfile(userId)
      .then((p) => !cancelled && setProfile(p))
      .catch((err) => {
        if (cancelled) return
        setProfile(null)
        setError(err instanceof Error ? err.message : 'Could not load this profile')
      })
    fetchFollowState(userId)
      .then((s) => {
        if (cancelled) return
        setFollow(s)
        if (s.following && s.sharesRatings) {
          void fetchFollowingFeed(20, userId)
            .then((r) => !cancelled && setRatings(r))
            .catch(() => {})
        }
      })
      .catch(() => !cancelled && setFollow(null))
    return () => {
      cancelled = true
    }
  }, [userId])

  async function toggleFollow() {
    if (!follow || followBusy) return
    setFollowBusy(true)
    setError(null)
    try {
      if (follow.following) {
        await unfollowUser(userId)
        setFollow({ ...follow, following: false })
        setRatings([])
      } else {
        await followUser(userId)
        setFollow({ ...follow, following: true })
        if (follow.sharesRatings) setRatings(await fetchFollowingFeed(20, userId))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update following')
    } finally {
      setFollowBusy(false)
    }
  }

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
            <Avatar
              avatarKey={profile.avatarKey}
              displayName={profile.displayName}
              color={colorForUser(userId)}
              size={64}
            />
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

          {/* ---- follow: shows only what they choose to share ---- */}
          {follow && (
            <section className="mp-rise mt-5" style={{ animationDelay: '40ms' }}>
              <button
                type="button"
                onClick={() => void toggleFollow()}
                disabled={followBusy}
                aria-pressed={follow.following}
                className={`min-h-11 w-full rounded-full px-4 text-[14px] font-semibold transition-colors disabled:opacity-60 ${
                  follow.following
                    ? 'border border-teal/40 bg-teal/10 text-teal'
                    : 'bg-teal text-bg'
                }`}
              >
                {followBusy ? 'Saving…' : follow.following ? 'Following' : `Follow ${profile.displayName}`}
              </button>
              <p className="mt-2 px-1 text-center text-[12px] leading-snug text-muted">
                {!follow.sharesRatings
                  ? `${profile.displayName} keeps their ratings private. If they start sharing, followers see them here and on Home.`
                  : follow.following
                    ? `${profile.displayName} shares their ratings with followers.`
                    : `Follow to see what ${profile.displayName} rates, here and on Home.`}
              </p>
              {error && <p role="alert" className="mt-1 text-center text-[12px] text-coral">{error}</p>}
            </section>
          )}

          {/* ---- their shared ratings (followers only, and only if they share) ---- */}
          {ratings.length > 0 && (
            <section className="mp-rise mt-7" style={{ animationDelay: '60ms' }}>
              <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                Recent ratings
              </p>
              <FeedList items={ratings} onOpenTitle={onOpenTitle} showWho={false} />
            </section>
          )}

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
