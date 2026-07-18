import { useCallback, useEffect, useState } from 'react'
import {
  closeGroupPoll,
  createGroupPoll,
  ensureTitleRow,
  fetchGroupPlaylists,
  fetchGroupPoll,
  fetchPlaylist,
  fetchTitleDetail,
  onPollChange,
  posterUrl,
  voteInPoll,
} from '../lib/api'
import type { GroupInfo, GroupPollInfo, MemberInfo, NewTitle } from '../lib/api'
import { useTmdbSearch } from '../hooks/useTmdbSearch'
import { colorForMember } from '../lib/palette'
import { Avatar } from './avatars'
import { CtaButton, fieldClassSm } from './ui'
import { GroupInviteSheet } from './GroupInviteSheet'

interface Candidate {
  titleId: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterPath: string | null
}

interface GroupPollProps {
  group: GroupInfo
  members: MemberInfo[]
  userId: string
}

// What's next? — the owner lines up 2-5 titles (from the group's watchlists
// or search), everyone votes with a live tally, the owner closes it, and the
// winner rolls straight into starting the round.
export function GroupPoll({ group, members, userId }: GroupPollProps) {
  const isOwner = group.role === 'owner'
  const [poll, setPoll] = useState<GroupPollInfo | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- builder (owner) ----
  const [building, setBuilding] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [watchlistPicks, setWatchlistPicks] = useState<Candidate[]>([])
  const [query, setQuery] = useState('')
  const { results, searching } = useTmdbSearch(query, 'both')

  // ---- winner -> round handoff ----
  const [invite, setInvite] = useState<{ title: NewTitle; genreIds: number[] } | null>(null)

  const load = useCallback(async () => {
    try {
      setPoll(await fetchGroupPoll(group.id, userId))
    } catch {
      setPoll(null)
    }
  }, [group.id, userId])

  useEffect(() => {
    void load()
    const unsubscribe = onPollChange(group.id, () => void load())
    return unsubscribe
  }, [load, group.id])

  // The group's watchlists feed the builder as one-tap candidates.
  useEffect(() => {
    if (!building) return
    let cancelled = false
    fetchGroupPlaylists(group.id)
      .then((lists) => Promise.all(lists.map((l) => fetchPlaylist(l.id))))
      .then((details) => {
        if (cancelled) return
        const seen = new Set<string>()
        const picks: Candidate[] = []
        for (const detail of details) {
          for (const item of detail?.items ?? []) {
            if (seen.has(item.titleId)) continue
            seen.add(item.titleId)
            picks.push({
              titleId: item.titleId,
              tmdbId: item.tmdbId,
              mediaType: item.mediaType,
              name: item.name,
              year: item.year,
              posterPath: item.posterPath,
            })
          }
        }
        setWatchlistPicks(picks.slice(0, 12))
      })
      .catch(() => !cancelled && setWatchlistPicks([]))
    return () => {
      cancelled = true
    }
  }, [building, group.id])

  function addCandidate(c: Candidate) {
    setCandidates((prev) =>
      prev.length >= 5 || prev.some((x) => x.titleId === c.titleId) ? prev : [...prev, c],
    )
  }

  async function addFromSearch(r: {
    tmdbId: number
    mediaType: 'movie' | 'tv'
    name: string
    year: number | null
    posterPath: string | null
  }) {
    setError(null)
    try {
      const titleId = await ensureTitleRow({
        name: r.name,
        year: r.year,
        mediaType: r.mediaType,
        tmdbId: r.tmdbId,
        posterPath: r.posterPath,
      })
      addCandidate({ ...r, titleId })
      setQuery('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that title')
    }
  }

  async function handleOpenVote() {
    setBusy(true)
    setError(null)
    try {
      await createGroupPoll(
        group.id,
        candidates.map((c) => c.titleId),
      )
      setBuilding(false)
      setCandidates([])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the vote')
    } finally {
      setBusy(false)
    }
  }

  async function handleVote(optionId: string) {
    if (!poll || busy) return
    setBusy(true)
    setError(null)
    try {
      await voteInPoll(poll.id, optionId, userId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your vote')
    } finally {
      setBusy(false)
    }
  }

  async function handleClose() {
    if (!poll) return
    setBusy(true)
    setError(null)
    try {
      await closeGroupPoll(poll.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close the vote')
    } finally {
      setBusy(false)
    }
  }

  async function handleStartWinner() {
    if (!poll) return
    const winner = poll.options.find((o) => o.id === poll.winnerOptionId)
    if (!winner) return
    setBusy(true)
    setError(null)
    try {
      let genreIds: number[] = []
      if (winner.tmdbId !== null) {
        genreIds = (await fetchTitleDetail(winner.tmdbId, winner.mediaType))?.genreIds ?? []
      }
      setInvite({
        title: {
          name: winner.name,
          year: winner.year,
          mediaType: winner.mediaType,
          tmdbId: winner.tmdbId,
          posterPath: winner.posterPath,
        },
        genreIds,
      })
    } finally {
      setBusy(false)
    }
  }

  if (poll === undefined) return null
  const winner = poll?.options.find((o) => o.id === poll.winnerOptionId) ?? null
  const totalVotes = poll?.options.reduce((n, o) => n + o.voterIds.length, 0) ?? 0
  // Nothing to show a member without a vote in flight.
  if (!poll && !isOwner) return null

  return (
    <section className="mp-rise mb-7" style={{ animationDelay: '95ms' }}>
      <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        What&apos;s next?
      </p>

      {/* ---- open vote: live tally ---- */}
      {poll?.status === 'open' && (
        <div className="mp-card rounded-[22px] px-4 py-1">
          {poll.options.map((o, i) => {
            const mine = poll.myOptionId === o.id
            return (
              <button
                key={o.id}
                type="button"
                disabled={busy}
                onClick={() => void handleVote(o.id)}
                className={`flex w-full items-center gap-3 py-3 text-left ${
                  i > 0 ? 'border-t border-line/50' : ''
                }`}
              >
                {o.posterPath ? (
                  <img
                    src={posterUrl(o.posterPath, 'w92')}
                    alt=""
                    className={`h-14 w-9 shrink-0 rounded-md object-cover ${
                      mine ? 'ring-2 ring-teal' : ''
                    }`}
                  />
                ) : (
                  <span
                    aria-hidden
                    className={`grid h-14 w-9 shrink-0 place-items-center rounded-md bg-line font-display text-sm font-semibold text-bg ${
                      mine ? 'ring-2 ring-teal' : ''
                    }`}
                  >
                    {o.name.charAt(0)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[14px] font-medium ${mine ? 'text-teal' : ''}`}>
                    {o.name}
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {o.mediaType === 'movie' ? 'Film' : 'TV'}
                    {o.year ? ` ${o.year}` : ''}
                    {mine ? ' · your vote' : ''}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="flex -space-x-1.5">
                    {o.voterIds.slice(0, 4).map((id) => {
                      const m = members.find((x) => x.userId === id)
                      return (
                        <span key={id} className="rounded-full border-2 border-surface">
                          <Avatar
                            avatarKey={m?.avatarKey ?? null}
                            displayName={m?.displayName ?? '?'}
                            color={colorForMember(members, id)}
                            size={20}
                          />
                        </span>
                      )
                    })}
                  </span>
                  <span className="tabular font-mono text-[13px] font-semibold text-teal">
                    {o.voterIds.length}
                  </span>
                </span>
              </button>
            )
          })}
          <div className="border-t border-line/50 px-1 py-2.5">
            <p className="text-[12px] leading-snug text-muted">
              Tap to vote or switch. {totalVotes}/{members.length} voted.
            </p>
            {isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleClose()}
                className="mt-2 w-full rounded-full border border-teal/40 bg-teal/10 py-2 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
              >
                {busy ? 'One sec…' : 'Close the vote'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- closed vote: the pick ---- */}
      {poll?.status === 'closed' && winner && (
        <div className="mp-card rounded-[22px] p-4">
          <div className="flex items-center gap-3">
            {winner.posterPath ? (
              <img
                src={posterUrl(winner.posterPath, 'w92')}
                alt=""
                className="h-16 w-11 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-16 w-11 shrink-0 place-items-center rounded-lg bg-line font-display text-lg font-semibold text-bg"
              >
                {winner.name.charAt(0)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-teal">
                The group picked
              </p>
              <p className="mt-0.5 truncate font-display text-[19px] font-semibold leading-tight">
                {winner.name}
              </p>
              <p className="font-mono text-[10px] text-muted">
                {winner.voterIds.length} of {totalVotes} vote{totalVotes === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {isOwner && (
            <div className="mt-3 flex items-center gap-2">
              <CtaButton
                tone="teal"
                disabled={busy}
                onClick={() => void handleStartWinner()}
                className="flex-1 py-2.5 text-[13px]"
              >
                {busy ? 'One sec…' : 'Start the round'}
              </CtaButton>
              <button
                type="button"
                disabled={busy}
                onClick={() => setBuilding(true)}
                className="shrink-0 rounded-full border border-line px-3.5 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text disabled:opacity-50"
              >
                New vote
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- owner: start a vote ---- */}
      {isOwner && poll === null && !building && (
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className="w-full rounded-full border border-dashed border-line py-2.5 text-[13px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
        >
          Start a vote: what do we watch next?
        </button>
      )}

      {isOwner && building && (
        <div className="mp-card mt-3 rounded-[22px] p-4">
          <p className="text-[13px] font-semibold leading-snug">Line up 2 to 5 choices</p>

          {candidates.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {candidates.map((c) => (
                <button
                  key={c.titleId}
                  type="button"
                  onClick={() =>
                    setCandidates((prev) => prev.filter((x) => x.titleId !== c.titleId))
                  }
                  className="flex items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 py-1 pl-1 pr-2.5 text-[12px] font-semibold text-teal"
                >
                  {c.posterPath ? (
                    <img src={posterUrl(c.posterPath, 'w92')} alt="" className="h-6 w-4 rounded-sm object-cover" />
                  ) : (
                    <span className="grid h-6 w-4 place-items-center rounded-sm bg-line text-[9px] text-bg">
                      {c.name.charAt(0)}
                    </span>
                  )}
                  <span className="max-w-[120px] truncate">{c.name}</span>
                  <span aria-hidden>✕</span>
                </button>
              ))}
            </div>
          )}

          {watchlistPicks.filter((w) => !candidates.some((c) => c.titleId === w.titleId)).length >
            0 && (
            <div className="mt-3">
              <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                From the watchlists
              </p>
              <div className="flex flex-wrap gap-1.5">
                {watchlistPicks
                  .filter((w) => !candidates.some((c) => c.titleId === w.titleId))
                  .map((w) => (
                    <button
                      key={w.titleId}
                      type="button"
                      disabled={candidates.length >= 5}
                      onClick={() => addCandidate(w)}
                      className="rounded-full border border-line px-2.5 py-1 text-[12px] text-muted transition-colors hover:border-teal/50 hover:text-text disabled:opacity-40"
                    >
                      + {w.name}
                    </button>
                  ))}
              </div>
            </div>
          )}

          <input
            type="text"
            maxLength={200}
            placeholder="Search films and shows…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${fieldClassSm} mt-3 w-full`}
          />
          {searching && <p className="mt-1.5 px-1 font-mono text-[10px] text-muted">searching…</p>}
          {results.length > 0 && candidates.length < 5 && (
            <ul className="mt-2 overflow-hidden rounded-xl border border-line bg-surface-2">
              {results.slice(0, 5).map((r, i) => (
                <li key={`${r.mediaType}:${r.tmdbId}`}>
                  <button
                    type="button"
                    onClick={() => void addFromSearch(r)}
                    className={`group flex w-full items-center gap-2.5 px-3 py-2 text-left ${
                      i > 0 ? 'border-t border-line/50' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium transition-colors group-hover:text-teal">
                      {r.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase text-muted">
                      {r.mediaType === 'movie' ? 'Film' : 'TV'} {r.year ?? ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-2">
            <CtaButton
              disabled={busy || candidates.length < 2}
              onClick={() => void handleOpenVote()}
              className="flex-1 py-2.5 text-[13px]"
            >
              {busy ? 'Opening…' : `Open the vote (${candidates.length}/5)`}
            </CtaButton>
            <button
              type="button"
              onClick={() => {
                setBuilding(false)
                setCandidates([])
                setQuery('')
              }}
              className="shrink-0 rounded-full border border-line px-3.5 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 px-2 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}

      {invite && (
        <GroupInviteSheet
          groups={[group]}
          userId={userId}
          title={invite.title}
          genreIds={invite.genreIds}
          onStarted={() => setInvite(null)}
          onClose={() => setInvite(null)}
        />
      )}
    </section>
  )
}
