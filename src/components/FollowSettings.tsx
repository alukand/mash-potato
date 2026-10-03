import { useEffect, useState } from 'react'
import { fetchMyFollowSummary, fetchMyFollowing, setShareRatings, unfollowUser } from '../lib/api'
import type { FollowSummary, FollowedPerson } from '../lib/api'
import { colorForUser } from '../lib/palette'
import { Avatar } from './avatars'

/**
 * Your side of follows (20261002140000): whether your solo ratings reach the
 * people who follow you (off until you say so), your own counts (nobody else
 * sees them), and who you follow.
 */
export function FollowSettings({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const [summary, setSummary] = useState<FollowSummary | null>(null)
  const [people, setPeople] = useState<FollowedPerson[] | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMyFollowSummary()
      .then(setSummary)
      .catch(() => setError('Could not load your sharing settings.'))
  }, [])

  async function toggleSharing() {
    if (!summary || busy) return
    setBusy(true)
    setError(null)
    try {
      await setShareRatings(!summary.shareRatings)
      setSummary({ ...summary, shareRatings: !summary.shareRatings })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change sharing')
    } finally {
      setBusy(false)
    }
  }

  function toggleList() {
    const next = !listOpen
    setListOpen(next)
    if (next && people === null) {
      void fetchMyFollowing()
        .then(setPeople)
        .catch(() => setPeople([]))
    }
  }

  async function unfollow(person: FollowedPerson) {
    setError(null)
    try {
      await unfollowUser(person.userId)
      setPeople((prev) => prev?.filter((p) => p.userId !== person.userId) ?? prev)
      setSummary((s) => s && { ...s, following: Math.max(0, s.following - 1) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unfollow')
    }
  }

  const on = summary?.shareRatings === true
  return (
    <div className="mt-5">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        Following and sharing
      </p>
      <div className="mp-card rounded-[22px] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium">Share my ratings with people who follow me</p>
            <p className="mt-1 text-[12px] leading-snug text-muted">
              Off unless you turn it on. Then your followers see what you rate on your own and
              your score, including ratings you already made. Group rounds are never shared.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Share my ratings with people who follow me"
            disabled={summary === null || busy}
            onClick={() => void toggleSharing()}
            className={`relative mt-0.5 h-8 w-14 shrink-0 rounded-full border transition-colors disabled:opacity-60 ${
              on ? 'border-teal/60 bg-teal/80' : 'border-line bg-surface-2'
            }`}
          >
            <span
              aria-hidden
              className={`absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-text shadow transition-[left] ${
                on ? 'left-[calc(100%-1.75rem)]' : 'left-1'
              }`}
            />
          </button>
        </div>

        {summary && (
          <div className="mt-3 border-t border-line/50 pt-3">
            <p className="text-[12px] text-muted">
              {summary.followers} {summary.followers === 1 ? 'follower' : 'followers'}, following{' '}
              {summary.following}. Only you see these numbers.
            </p>
            {summary.following > 0 && (
              <button
                type="button"
                onClick={toggleList}
                aria-expanded={listOpen}
                className="mt-1 min-h-11 text-[13px] font-semibold text-teal"
              >
                {listOpen ? 'Hide who you follow' : 'See who you follow'}
              </button>
            )}
          </div>
        )}

        {listOpen && (
          <div className="mt-1 divide-y divide-line/50">
            {people === null ? (
              <p className="py-2 text-[13px] text-muted">Loading…</p>
            ) : (
              people.map((p) => (
                <div key={p.userId} className="flex items-center gap-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenUser(p.userId)}
                    className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <Avatar
                      avatarKey={p.avatarKey}
                      displayName={p.displayName}
                      color={colorForUser(p.userId)}
                      size={32}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium transition-colors group-hover:text-teal">
                        {p.displayName}
                      </span>
                      <span className="block text-[11px] text-muted">
                        {p.sharesRatings ? 'Shares ratings' : 'Keeps ratings private'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void unfollow(p)}
                    className="min-h-11 shrink-0 rounded-full border border-line px-3.5 text-[12px] font-semibold text-muted transition-colors hover:text-text"
                  >
                    Unfollow
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[12px] text-coral">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
