import { useCallback, useEffect, useState } from 'react'
import { formatScore, mashedScore } from '../lib/scoring'
import { weightsFromRubric } from '../lib/mapping'
import {
  fetchAllScorecards,
  fetchBrowse,
  fetchLatestSession,
  fetchLockStatus,
  fetchMembers,
  fetchMyGlobalRatings,
  fetchMyReviewedTitles,
  fetchMySavedTitles,
  fetchSessionRsvps,
  onSessionChange,
  posterUrl,
  respondToSession,
} from '../lib/api'
import type { GroupInfo, MemberInfo, SavedTitle, SessionInfo, TmdbResult } from '../lib/api'
import { participation, formatWindow } from '../lib/rsvp'
import { PosterShelf } from '../components/PosterShelf'
import { Logo } from '../components/Logo'
import { CtaButton, GroupMark } from '../components/ui'

interface HomeScreenProps {
  groups: GroupInfo[]
  userId: string
  /** Switch to that group and land on the given tab. */
  /** Rounds and reveals both live on the Rate tab now. */
  onOpenGroup: (groupId: string, dest: 'rate') => void
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  /** Jump to Discover. */
  onExplore: () => void
}

/** One group's latest activity, hydrated for the dashboard. */
interface GroupPulse {
  group: GroupInfo
  session: SessionInfo | null
  members: MemberInfo[]
  rsvps: { memberId: string; status: 'in' | 'pass' }[]
  lockStatus: { memberId: string; locked: boolean }[]
  /** Mashed score when the latest session is revealed. */
  mashed: number | null
}

// Home is the cross-group dashboard: every live round (with the RSVP right
// here), the freshest reveals, then somewhere to explore. Group-specific
// depth — the full Reveal, log, rubric — lives on the Group tab.
export function HomeScreen({ groups, userId, onOpenGroup, onOpenTitle, onExplore }: HomeScreenProps) {
  const [pulses, setPulses] = useState<GroupPulse[] | undefined>(undefined)
  const [trending, setTrending] = useState<TmdbResult[]>([])
  const [popular, setPopular] = useState<TmdbResult[]>([])
  const [saved, setSaved] = useState<SavedTitle[]>([])
  const [ratedCount, setRatedCount] = useState<number | null>(null)
  const [busyRsvp, setBusyRsvp] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const results = await Promise.all(
        groups.map(async (group): Promise<GroupPulse> => {
          const session = await fetchLatestSession(group.id)
          if (!session) {
            return { group, session, members: [], rsvps: [], lockStatus: [], mashed: null }
          }
          if (session.state === 'blind') {
            const [members, locks, answers] = await Promise.all([
              fetchMembers(group.id),
              fetchLockStatus(session.id),
              fetchSessionRsvps(session.id).catch(() => []),
            ])
            return { group, session, members, rsvps: answers, lockStatus: locks, mashed: null }
          }
          const cards = await fetchAllScorecards(session.id)
          const weights = weightsFromRubric(session.rubric ?? [])
          return {
            group,
            session,
            members: [],
            rsvps: [],
            lockStatus: [],
            mashed: mashedScore(cards, weights),
          }
        }),
      )
      setPulses(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }, [groups])

  useEffect(() => {
    void load()
    const unsubscribes = groups.map((g) => onSessionChange(g.id, () => void load()))
    return () => unsubscribes.forEach((u) => u())
  }, [load, groups])

  useEffect(() => {
    let cancelled = false
    fetchBrowse('trending', 'movie')
      .then((r) => !cancelled && setTrending(r))
      .catch(() => {})
    fetchBrowse('popular', 'tv')
      .then((r) => !cancelled && setPopular(r))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // The overview numbers + your saved list (the "what to watch next" pool).
  useEffect(() => {
    let cancelled = false
    fetchMySavedTitles(userId)
      .then((s) => !cancelled && setSaved(s))
      .catch(() => {})
    Promise.all([
      fetchMyGlobalRatings(userId).catch(() => []),
      fetchMyReviewedTitles(userId).catch(() => []),
    ]).then(([solo, grouped]) => {
      if (cancelled) return
      const ids = new Set<string>([
        ...solo.map((t) => t.titleId),
        ...grouped.map((t) => t.titleId),
      ])
      setRatedCount(ids.size)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  async function answer(sessionId: string, status: 'in' | 'pass') {
    setBusyRsvp(sessionId)
    try {
      await respondToSession(sessionId, userId, status)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answer')
    } finally {
      setBusyRsvp(null)
    }
  }

  if (error) {
    // Home fans out over every group, so one failure used to replace the
    // entire screen with a single unactionable line.
    return (
      <div className="mp-rise py-10 text-center">
        <p role="alert" className="text-[13px] leading-snug text-coral">
          {error}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            void load()
          }}
          className="mt-3 rounded-full border border-line px-5 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2"
        >
          Try again
        </button>
      </div>
    )
  }
  if (pulses === undefined) {
    return <p className="mp-rise py-10 text-center text-[13px] text-muted">Loading…</p>
  }

  const live = pulses.filter((p) => p.session?.state === 'blind')
  const revealed = pulses
    .filter((p) => p.session?.state === 'revealed')
    .sort((a, b) =>
      (b.session?.createdAt ?? '').localeCompare(a.session?.createdAt ?? ''),
    )
  const quiet = live.length === 0 && revealed.length === 0

  const showStats = groups.length > 0 || (ratedCount ?? 0) > 0 || saved.length > 0

  return (
    <div className="flex flex-col gap-7">
      {/* ---- your numbers at a glance ---- */}
      {showStats && (
        <section className="mp-rise grid grid-cols-3 gap-2">
          {(
            [
              [groups.length, groups.length === 1 ? 'Group' : 'Groups'],
              [ratedCount ?? 0, 'Rated'],
              [saved.length, 'Saved'],
            ] as const
          ).map(([n, label]) => (
            <div key={label} className="mp-card rounded-2xl px-3 py-3 text-center">
              <p className="tabular font-display text-[24px] font-semibold leading-none">{n}</p>
              <p className="mt-1 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
                {label}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* ---- live rounds across every group ---- */}
      {live.length > 0 && (
        <section className="mp-rise">
          <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Live rounds
          </p>
          <div className="flex flex-col gap-3">
            {live.map(({ group, session, members, rsvps, lockStatus }) => {
              if (!session) return null
              const part = participation({
                memberIds: members.map((m) => m.userId),
                rsvps,
                scoredMemberIds: lockStatus.map((l) => l.memberId),
                sessionCreatedAt: session.createdAt,
              })
              const mine = part.status.get(userId) ?? 'invited'
              const iLocked = lockStatus.some((l) => l.memberId === userId && l.locked)
              const inviter =
                session.createdBy === userId
                  ? 'You'
                  : (members.find((m) => m.userId === session.createdBy)?.displayName ??
                    'Someone')
              return (
                <div key={session.id} className="mp-card rounded-[24px] p-5">
                  <div className="flex items-start gap-3.5">
                    <div
                      aria-hidden
                      className="relative grid h-[72px] w-12 shrink-0 place-items-center overflow-hidden rounded-lg font-display text-xl font-semibold text-bg"
                      style={{ backgroundImage: 'linear-gradient(160deg, #E7B24E, #E07A5F)' }}
                    >
                      {session.posterPath ? (
                        <img
                          src={posterUrl(session.posterPath, 'w185')}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        session.titleName.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold">
                        {inviter} invited {group.name}
                      </p>
                      <p className="mt-1 truncate font-display text-[19px] font-semibold leading-tight">
                        {session.titleName}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-muted">
                        {part.inIds.length} in
                        {part.passedIds.length > 0 ? `, ${part.passedIds.length} passed` : ''}
                        {part.invitedIds.length > 0
                          ? `, ${part.invitedIds.length} invited (closes in ${formatWindow(part.windowRemainingMs)})`
                          : ''}
                      </p>
                    </div>
                  </div>

                  {iLocked ? (
                    <p className="mt-3.5 rounded-full border border-teal/30 bg-teal/10 py-2.5 text-center text-[12px] font-semibold text-teal">
                      You're locked in, waiting on the reveal
                    </p>
                  ) : mine === 'invited' ? (
                    <div className="mt-3.5 flex items-center gap-2">
                      <CtaButton
                        tone="teal"
                        disabled={busyRsvp === session.id}
                        onClick={() => void answer(session.id, 'in')}
                        className="flex-1 py-2.5 text-[13px]"
                      >
                        I'm in
                      </CtaButton>
                      <button
                        type="button"
                        disabled={busyRsvp === session.id}
                        onClick={() => void answer(session.id, 'pass')}
                        className="flex-1 rounded-full border border-line py-2.5 text-[13px] font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
                      >
                        Pass
                      </button>
                    </div>
                  ) : mine === 'passed' ? (
                    <button
                      type="button"
                      onClick={() => onOpenGroup(group.id, 'rate')}
                      className="mt-3.5 w-full rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2"
                    >
                      {/* This only navigates; scoring is what un-passes you,
                          so it no longer promises an RSVP change. */}
                      You passed. Open the round →
                    </button>
                  ) : (
                    <CtaButton
                      onClick={() => onOpenGroup(group.id, 'rate')}
                      className="mt-3.5 w-full py-2.5 text-[13px]"
                    >
                      Score it blind →
                    </CtaButton>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---- freshest reveals ---- */}
      {revealed.length > 0 && (
        <section className="mp-rise" style={{ animationDelay: live.length > 0 ? '80ms' : undefined }}>
          <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Latest reveals
          </p>
          <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
            {revealed.map(({ group, session, mashed }) => {
              if (!session) return null
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onOpenGroup(group.id, 'rate')}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2"
                >
                  {session.posterPath ? (
                    <img
                      src={posterUrl(session.posterPath, 'w92')}
                      alt=""
                      loading="lazy"
                      className="h-14 w-9 shrink-0 rounded-md object-cover transition-transform group-active:scale-95"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="grid h-14 w-9 shrink-0 place-items-center rounded-md bg-line font-display text-sm font-semibold text-bg"
                    >
                      {session.titleName.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium leading-tight transition-colors group-hover:text-teal">
                      {session.titleName}
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-muted">
                      <GroupMark groupId={group.id} name={group.name} size={14} />
                      <span className="truncate">{group.name}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {mashed === null ? (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-muted" aria-hidden>
                          <rect x="4" y="10" width="16" height="11" rx="2.5" />
                          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                        </svg>
                        <p className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-muted">
                          Sealed
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="tabular font-display text-[22px] font-semibold leading-none text-teal">
                          {formatScore(mashed)}
                        </span>
                        <p className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-teal">
                          Mashed
                        </p>
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ---- quiet: nudge toward exploring ---- */}
      {quiet && (
        <section className="mp-rise mp-card rounded-[26px] p-7 text-center">
          <Logo className="mx-auto h-12 w-12" />
          <h2 className="mt-4 font-display text-[22px] font-semibold leading-tight">
            Nothing live right now
          </h2>
          <p className="mx-auto mt-2 max-w-[280px] text-[13px] leading-snug text-muted">
            Find something worth arguing about: rate it solo, or invite a group and score it
            blind.
          </p>
          <CtaButton onClick={onExplore} className="mt-5 w-full py-3.5 text-[14px]">
            Explore titles
          </CtaButton>
        </section>
      )}

      {/* ---- your saved list: the what-to-watch-next pool ---- */}
      {saved.filter((s) => s.tmdbId !== null).length > 0 && (
        <div className="mp-rise" style={{ animationDelay: '120ms' }}>
          <PosterShelf
            heading="From your list"
            items={saved
              .filter((s) => s.tmdbId !== null)
              .map((s) => ({
                tmdbId: s.tmdbId!,
                name: s.name,
                year: s.year,
                posterPath: s.posterPath,
              }))}
            onPick={(it) => {
              const match = saved.find((s) => s.tmdbId === it.tmdbId)
              onOpenTitle(it.tmdbId, match?.mediaType ?? 'movie')
            }}
          />
        </div>
      )}

      {/* ---- exploratory tail ---- */}
      {trending.length > 0 && (
        <div className="mp-rise" style={{ animationDelay: '160ms' }}>
          <PosterShelf
            heading="Trending this week"
            items={trending}
            onPick={(it) => onOpenTitle(it.tmdbId, 'movie')}
          />
        </div>
      )}
      {popular.length > 0 && (
        <div className="mp-rise" style={{ animationDelay: '200ms' }}>
          <PosterShelf
            heading="Popular shows"
            items={popular}
            onPick={(it) => onOpenTitle(it.tmdbId, 'tv')}
          />
          <button
            type="button"
            onClick={onExplore}
            className="mt-2 w-full rounded-full px-4 py-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
          >
            More in Discover →
          </button>
        </div>
      )}
    </div>
  )
}
