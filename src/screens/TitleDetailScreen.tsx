import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  backdropUrl,
  createSession,
  deleteGlobalRating,
  fetchCommunityHistogram,
  fetchCommunityScore,
  fetchGroupRubrics,
  fetchLatestSession,
  fetchMyGlobalRating,
  fetchSavedTitleId,
  fetchTitleDetail,
  fetchTitleHistory,
  posterUrl,
  saveGlobalRating,
  saveTitle,
  unsaveTitle,
} from '../lib/api'
import type {
  CommunityScore,
  GroupInfo,
  GroupRubricRow,
  SessionInfo,
  TitleDetail,
  TitleHistoryEntry,
} from '../lib/api'
import type { CategoryScores } from '../lib/scoring'
import { mashedScore, memberWeightedScore, formatScore } from '../lib/scoring'
import { weightsFromRubric } from '../lib/mapping'
import {
  DEFAULT_WEIGHTS,
  defaultRubricEntries,
  defaultRubricRows,
  mashRubrics,
  resolveSessionRubric,
} from '../lib/rubricCatalog'
import { scoreColor, scoreWord } from '../lib/scoreColor'
import { CommunityHistogram } from '../components/CommunityHistogram'
import { CtaButton } from '../components/ui'

// The default rubric everyone's solo/community rating uses.
const SOLO_RUBRIC = defaultRubricEntries()
const SOLO_WEIGHT_TOTAL = SOLO_RUBRIC.reduce((sum, e) => sum + e.weight, 0)

interface TitleDetailScreenProps {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  group: GroupInfo | null
  userId: string
  onBack: () => void
  onStartedSession: () => void
}

function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatRevealed(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Full TMDB detail page for one title. Lives on the App view-stack (opened from
// Discover, Profile, or a saved list) with its own back button.
export function TitleDetailScreen({
  tmdbId,
  mediaType,
  group,
  userId,
  onBack,
  onStartedSession,
}: TitleDetailScreenProps) {
  const [detail, setDetail] = useState<TitleDetail | null | undefined>(undefined)
  const [notFound, setNotFound] = useState(false)
  const [savedTitleId, setSavedTitleId] = useState<string | null>(null)
  const [latest, setLatest] = useState<SessionInfo | null>(null)
  const [groupRubric, setGroupRubric] = useState<GroupRubricRow[]>([])
  const [history, setHistory] = useState<TitleHistoryEntry[]>([])
  const [community, setCommunity] = useState<CommunityScore | null>(null)
  const [communityBins, setCommunityBins] = useState<number[]>([])
  const [myScores, setMyScores] = useState<CategoryScores | null>(null)
  const [rating, setRating] = useState(false)
  const [soloScores, setSoloScores] = useState<CategoryScores>({})
  const [savingRating, setSavingRating] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const communityRef = useRef<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(undefined)
    setNotFound(false)
    setRating(false)
    Promise.all([
      fetchTitleDetail(tmdbId, mediaType),
      fetchSavedTitleId(userId, tmdbId, mediaType),
      fetchTitleHistory(tmdbId, mediaType),
      group ? fetchLatestSession(group.id) : Promise.resolve(null),
      group
        ? fetchGroupRubrics(group.id)
            .then(mashRubrics)
            .catch(() => [])
        : Promise.resolve([]),
      fetchCommunityScore(tmdbId, mediaType, DEFAULT_WEIGHTS),
      fetchMyGlobalRating(userId, tmdbId, mediaType),
      fetchCommunityHistogram(tmdbId, mediaType, DEFAULT_WEIGHTS),
    ])
      .then(([d, savedId, hist, latestSession, rubricRows, comm, mine, histogram]) => {
        if (cancelled) return
        setDetail(d)
        setNotFound(d === null)
        setSavedTitleId(savedId)
        setHistory(hist)
        setLatest(latestSession)
        setGroupRubric(rubricRows)
        setCommunity(comm)
        setMyScores(mine)
        setCommunityBins(histogram)
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null)
          setError(err instanceof Error ? err.message : 'Could not load this title')
        }
      })
    return () => {
      cancelled = true
    }
  }, [tmdbId, mediaType, userId, group])

  async function toggleSave() {
    if (!detail) return
    setSaving(true)
    setError(null)
    try {
      if (savedTitleId) {
        await unsaveTitle(userId, savedTitleId)
        setSavedTitleId(null)
      } else {
        const id = await saveTitle(userId, {
          name: detail.name,
          year: detail.year,
          mediaType: detail.mediaType,
          tmdbId: detail.tmdbId,
          posterPath: detail.posterPath,
        })
        setSavedTitleId(id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your list')
    } finally {
      setSaving(false)
    }
  }

  function openRating() {
    setSoloScores(
      Object.fromEntries(SOLO_RUBRIC.map((e) => [e.key, myScores?.[e.key] ?? 5])),
    )
    setRating(true)
  }

  // From the action row: open the solo sliders and bring them into view.
  function rateFromActions() {
    openRating()
    setTimeout(() => {
      communityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  async function handleSaveRating() {
    if (!detail) return
    setSavingRating(true)
    setError(null)
    try {
      await saveGlobalRating(
        userId,
        {
          name: detail.name,
          year: detail.year,
          mediaType: detail.mediaType,
          tmdbId: detail.tmdbId,
          posterPath: detail.posterPath,
        },
        soloScores,
      )
      setMyScores({ ...soloScores })
      const [comm, histogram] = await Promise.all([
        fetchCommunityScore(tmdbId, mediaType, DEFAULT_WEIGHTS),
        fetchCommunityHistogram(tmdbId, mediaType, DEFAULT_WEIGHTS),
      ])
      setCommunity(comm)
      setCommunityBins(histogram)
      setRating(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rating')
    } finally {
      setSavingRating(false)
    }
  }

  async function handleRemoveRating() {
    setSavingRating(true)
    setError(null)
    try {
      await deleteGlobalRating(userId, tmdbId, mediaType)
      setMyScores(null)
      setConfirmRemove(false)
      setRating(false)
      const [comm, histogram] = await Promise.all([
        fetchCommunityScore(tmdbId, mediaType, DEFAULT_WEIGHTS),
        fetchCommunityHistogram(tmdbId, mediaType, DEFAULT_WEIGHTS),
      ])
      setCommunity(comm)
      setCommunityBins(histogram)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your rating')
    } finally {
      setSavingRating(false)
    }
  }

  async function handleStartSession() {
    if (!detail || !group) return
    setStarting(true)
    setError(null)
    try {
      const rows = groupRubric.length > 0 ? groupRubric : defaultRubricRows()
      const rubric = resolveSessionRubric(rows, detail.genreIds)
      await createSession(
        group.id,
        userId,
        {
          name: detail.name,
          year: detail.year,
          mediaType: detail.mediaType,
          tmdbId: detail.tmdbId,
          posterPath: detail.posterPath,
        },
        rubric,
      )
      onStartedSession()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session')
      setStarting(false)
    }
  }

  const BackButton = (
    <button
      type="button"
      onClick={onBack}
      className="grid h-9 w-9 place-items-center rounded-full border border-line/60 bg-bg/60 text-text backdrop-blur-md transition-colors hover:text-teal"
      aria-label="Back"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 5-7 7 7 7" />
      </svg>
    </button>
  )

  if (detail === undefined) {
    return (
      <div className="px-5 pt-safe">
        <div className="mb-6">{BackButton}</div>
        <p className="mp-rise py-10 text-center text-[13px] text-muted">Loading…</p>
      </div>
    )
  }

  if (notFound || !detail) {
    return (
      <div className="px-5 pt-safe">
        <div className="mb-6">{BackButton}</div>
        <p className="mp-rise py-10 text-center text-[13px] text-coral">
          {error ?? 'TMDB has no record of this title.'}
        </p>
      </div>
    )
  }

  const runtime = formatRuntime(detail.runtimeMinutes)
  const seasons = detail.seasons ? `${detail.seasons} season${detail.seasons === 1 ? '' : 's'}` : null
  const meta = [
    detail.mediaType === 'movie' ? 'Film' : 'TV',
    detail.year ? String(detail.year) : null,
    runtime,
    seasons,
  ].filter(Boolean)

  const blindElsewhere = latest?.state === 'blind'
  const canStart = !!group && !blindElsewhere

  return (
    <div className="pb-4">
      {/* ---- backdrop hero ---- */}
      <div className="relative h-[200px] w-full overflow-hidden">
        {detail.backdropPath ? (
          <img
            src={backdropUrl(detail.backdropPath)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(21,18,27,0.15), var(--color-bg))' }}
        />
        <div
          className="absolute left-4"
          style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
        >
          {BackButton}
        </div>
      </div>

      {/* ---- poster + title, pulled up over the hero fade ---- */}
      <div className="-mt-16 px-5">
        <div className="flex items-end gap-4">
          <div className="relative h-[132px] w-[88px] shrink-0 overflow-hidden rounded-xl border border-line/60 bg-surface-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]">
            {detail.posterPath ? (
              <img src={posterUrl(detail.posterPath, 'w342')} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                aria-hidden
                className="grid h-full w-full place-items-center font-display text-3xl font-semibold text-bg"
                style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
              >
                {detail.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            {detail.tmdbRating !== null && detail.tmdbRating > 0 && (
              <div className="mb-1.5 flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-gold" aria-hidden>
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
                </svg>
                <span className="font-mono text-[12px] font-bold text-gold">
                  {detail.tmdbRating.toFixed(1)}
                </span>
                <span className="font-mono text-[10px] text-muted">TMDB</span>
              </div>
            )}
            <h1 className="font-display text-[26px] font-semibold leading-[1.05]">{detail.name}</h1>
          </div>
        </div>

        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {meta.join(', ')}
        </p>
        {detail.genres.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {detail.genres.map((g) => (
              <span
                key={g}
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {detail.overview && (
          <p className="mt-4 text-[13px] leading-relaxed text-text/90">{detail.overview}</p>
        )}

        {error && <p role="alert" className="mt-4 text-[12px] leading-snug text-coral">{error}</p>}

        {/* ---- actions ---- */}
        <div className="mt-5 flex flex-col gap-3">
          <CtaButton
            onClick={() => void handleStartSession()}
            disabled={!canStart || starting}
            className="w-full py-3.5 text-[14px] disabled:opacity-50"
          >
            {starting
              ? 'Starting…'
              : group
                ? `Invite ${group.name} to rate it`
                : 'Score with your group'}
          </CtaButton>
          {blindElsewhere && (
            <p className="text-center font-mono text-[10px] text-muted">
              Finish {group?.name}’s current blind session first.
            </p>
          )}

          {/* consolidated secondary actions: solo rate + save, one cluster */}
          <div className="flex items-stretch gap-3">
            <button
              type="button"
              onClick={rateFromActions}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full border py-3 text-[13px] font-semibold transition-colors ${
                myScores
                  ? 'border-gold/40 bg-gold/10 text-gold'
                  : 'border-line text-muted hover:border-teal/50 hover:text-text'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={myScores ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
              </svg>
              {myScores
                ? `Solo ${formatScore(memberWeightedScore(myScores, DEFAULT_WEIGHTS))}`
                : 'Rate it solo'}
            </button>
            <button
              type="button"
              onClick={() => void toggleSave()}
              disabled={saving}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full border py-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                savedTitleId
                  ? 'border-teal/40 bg-teal/10 text-teal'
                  : 'border-line text-muted hover:border-teal/50 hover:text-text'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={savedTitleId ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 21 12 16.5 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
              </svg>
              {savedTitleId ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        {/* ---- community rating (solo, default rubric) ---- */}
        <section ref={communityRef} className="mt-7 scroll-mt-4">
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Community rating
            </p>
            <p className="font-mono text-[10px] text-muted">everyone, default rubric</p>
          </div>
          <div className="mp-card rounded-[22px] p-5">
            <div className="flex items-end justify-between">
              <div>
                <span className="tabular font-display text-[40px] font-semibold leading-none text-teal">
                  {formatScore(community?.mashed ?? null)}
                </span>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-teal">
                  Mashed
                </p>
              </div>
              <p className="pb-1 text-right font-mono text-[11px] text-muted">
                {community && community.count > 0
                  ? `${community.count} ${community.count === 1 ? 'rating' : 'ratings'}`
                  : 'No ratings yet'}
              </p>
            </div>

            <CommunityHistogram bins={communityBins} mashed={community?.mashed ?? null} />

            {!rating && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line/60 pt-4">
                {myScores ? (
                  <p className="text-[13px] text-muted">
                    You rated it{' '}
                    <span className="font-semibold text-gold">
                      {formatScore(memberWeightedScore(myScores, DEFAULT_WEIGHTS))}
                    </span>
                  </p>
                ) : (
                  <p className="text-[13px] leading-snug text-muted">
                    Rate it yourself. It counts toward the community score.
                  </p>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  {myScores && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(true)}
                      className="rounded-full border border-line px-3 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-coral/50 hover:text-coral"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openRating}
                    className="rounded-full border border-teal/40 bg-teal/10 px-4 py-2 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20"
                  >
                    {myScores ? 'Edit rating' : 'Rate it'}
                  </button>
                </div>
              </div>
            )}

            {confirmRemove && myScores && !rating && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-coral/30 bg-coral/5 px-4 py-3">
                <p className="text-[12px] leading-snug text-muted">
                  Remove your rating? It drops out of the community score.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="rounded-full px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveRating()}
                    disabled={savingRating}
                    className="rounded-full bg-coral/90 px-3.5 py-1.5 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {savingRating ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            )}

            {rating && (
              <div className="mt-4 border-t border-line/60 pt-2">
                {SOLO_RUBRIC.map((entry, i) => {
                  const value = soloScores[entry.key] ?? 5
                  const color = scoreColor(value)
                  return (
                    <div key={entry.key} className={`py-3 ${i > 0 ? 'border-t border-line/40' : ''}`}>
                      <div className="flex items-baseline justify-between">
                        <div>
                          <p className="text-[13px] font-medium leading-tight">{entry.label}</p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted">
                            weight {Math.round((entry.weight / SOLO_WEIGHT_TOTAL) * 100)}%
                          </p>
                        </div>
                        <span className="flex items-baseline gap-1.5">
                          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                            {scoreWord(value)}
                          </span>
                          <span className="tabular font-mono text-lg font-bold" style={{ color }}>
                            {value}
                          </span>
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        step={1}
                        value={value}
                        aria-label={`${entry.label} score`}
                        onChange={(e) =>
                          setSoloScores((prev) => ({ ...prev, [entry.key]: Number(e.target.value) }))
                        }
                        className="mp-slider mt-1.5"
                        style={{ '--thumb': color, '--fill': ((value - 1) / 9) * 100 } as CSSProperties}
                      />
                    </div>
                  )
                })}
                <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    Your score{' '}
                    <span className="tabular text-gold">
                      {formatScore(memberWeightedScore(soloScores, DEFAULT_WEIGHTS))}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRating(false)}
                      className="rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                    <CtaButton
                      tone="teal"
                      onClick={() => void handleSaveRating()}
                      disabled={savingRating}
                      className="px-4 py-2 text-[12px]"
                    >
                      {savingRating ? 'Saving…' : 'Save rating'}
                    </CtaButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ---- cast ---- */}
        {detail.cast.length > 0 && (
          <section className="mt-7">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Cast
            </p>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {detail.cast.map((c, i) => (
                <div key={`${c.name}-${i}`} className="w-16 shrink-0 text-center">
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-line/60 bg-surface-2">
                    {c.profilePath ? (
                      <img src={posterUrl(c.profilePath, 'w185')} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center font-display text-lg text-muted">
                        {c.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[10px] font-medium leading-tight">{c.name}</p>
                  {c.character && (
                    <p className="truncate font-mono text-[9px] text-muted">{c.character}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---- cross-group Mashed history ---- */}
        <section className="mt-7">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Your groups’ verdicts
          </p>
          {history.length > 0 ? (
            <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
              {history.map((entry) => {
                const mashed = mashedScore(entry.scorecards, weightsFromRubric(entry.rubric))
                return (
                  <div key={entry.sessionId} className="flex items-center justify-between px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{entry.groupName}</p>
                      <p className="font-mono text-[10px] text-muted">
                        {formatRevealed(entry.revealedAt)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="tabular font-display text-[26px] font-semibold leading-none text-teal">
                        {formatScore(mashed)}
                      </span>
                      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-teal">
                        Mashed
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="px-1 text-[13px] leading-snug text-muted">
              None of your groups has mashed this yet.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
