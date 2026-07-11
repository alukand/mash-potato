import { useEffect, useState } from 'react'
import {
  backdropUrl,
  createSession,
  fetchGroupRubric,
  fetchLatestSession,
  fetchSavedTitleId,
  fetchTitleDetail,
  fetchTitleHistory,
  posterUrl,
  saveTitle,
  unsaveTitle,
} from '../lib/api'
import type {
  GroupInfo,
  GroupRubricRow,
  SessionInfo,
  TitleDetail,
  TitleHistoryEntry,
} from '../lib/api'
import { mashedScore, formatScore } from '../lib/scoring'
import { weightsFromRubric } from '../lib/mapping'
import { BASE_CATEGORIES, resolveSessionRubric } from '../lib/rubricCatalog'

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
  const [saving, setSaving] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(undefined)
    setNotFound(false)
    Promise.all([
      fetchTitleDetail(tmdbId, mediaType),
      fetchSavedTitleId(userId, tmdbId, mediaType),
      fetchTitleHistory(tmdbId, mediaType),
      group ? fetchLatestSession(group.id) : Promise.resolve(null),
      group ? fetchGroupRubric(group.id).catch(() => []) : Promise.resolve([]),
    ])
      .then(([d, savedId, hist, latestSession, rubricRows]) => {
        if (cancelled) return
        setDetail(d)
        setNotFound(d === null)
        setSavedTitleId(savedId)
        setHistory(hist)
        setLatest(latestSession)
        setGroupRubric(rubricRows)
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

  async function handleStartSession() {
    if (!detail || !group) return
    setStarting(true)
    setError(null)
    try {
      const rows =
        groupRubric.length > 0
          ? groupRubric
          : BASE_CATEGORIES.map((c, i) => ({
              key: c.key,
              label: c.label,
              weight: 20,
              enabled: true,
              sort: i,
            }))
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
          {meta.join(' · ')}
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
          <button
            type="button"
            onClick={() => void handleStartSession()}
            disabled={!canStart || starting}
            className="w-full rounded-full py-3.5 text-[14px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundImage: 'linear-gradient(180deg, #F2CD77, #DFA338)' }}
          >
            {starting
              ? 'Starting…'
              : group
                ? `Score this with ${group.name}`
                : 'Score with your group'}
          </button>
          {blindElsewhere && (
            <p className="text-center font-mono text-[10px] text-muted">
              Finish {group?.name}’s current blind session first.
            </p>
          )}

          <button
            type="button"
            onClick={() => void toggleSave()}
            disabled={saving}
            className={`w-full rounded-full border py-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
              savedTitleId
                ? 'border-teal/40 bg-teal/10 text-teal'
                : 'border-line text-muted hover:text-text'
            }`}
          >
            {savedTitleId ? '✓ Saved to your list' : 'Save to your list'}
          </button>
        </div>

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
