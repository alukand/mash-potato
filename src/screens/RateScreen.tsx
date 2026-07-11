import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { memberWeightedScore, formatScore } from '../lib/scoring'
import type { CategoryScores } from '../lib/scoring'
import { scoreColor } from '../lib/scoreColor'
import {
  createSession,
  fetchGroupRubrics,
  fetchLatestSession,
  fetchLockStatus,
  fetchMyScore,
  fetchTitleDetail,
  onSessionChange,
  posterUrl,
  revealSession,
  saveMyScore,
} from '../lib/api'
import type {
  GroupInfo,
  GroupRubricRow,
  MemberInfo,
  SessionInfo,
  SessionRubricEntry,
  TmdbResult,
} from '../lib/api'
import { weightsFromRubric } from '../lib/mapping'
import { defaultRubricRows, mashRubrics, resolveSessionRubric } from '../lib/rubricCatalog'
import { colorForMember } from '../lib/palette'
import { useTmdbSearch } from '../hooks/useTmdbSearch'

interface RateScreenProps {
  group: GroupInfo
  members: MemberInfo[]
  userId: string
  onGoHome: () => void
}

// Live blind scoring. Scores are real member_scores rows written through RLS;
// lock STATUS of others comes from the session_lock_status helper (flags
// only). The reveal calls the reveal_session RPC.

/** Every category of the session's snapshot starts at the midpoint. */
const defaultScores = (rubric: SessionRubricEntry[]): CategoryScores =>
  Object.fromEntries(rubric.map((e) => [e.key, 5]))

const inputClass =
  'w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-text ' +
  'placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60'

export function RateScreen({ group, members, userId, onGoHome }: RateScreenProps) {
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined)
  const [groupRubric, setGroupRubric] = useState<GroupRubricRow[] | null>(null)
  const [scores, setScores] = useState<CategoryScores>({})
  const [locked, setLocked] = useState(false)
  const [lockStatus, setLockStatus] = useState<{ memberId: string; locked: boolean }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // new-session form
  const [titleName, setTitleName] = useState('')
  const [titleYear, setTitleYear] = useState('')
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie')
  const [picked, setPicked] = useState<TmdbResult | null>(null)

  // Debounced TMDB search (through the Edge Function); paused once a result is
  // picked. Shared with Discover via the hook.
  const { results, searching } = useTmdbSearch(titleName, mediaType, !picked)

  const load = useCallback(async () => {
    try {
      const s = await fetchLatestSession(group.id)
      setSession(s)
      if (s?.state === 'blind') {
        const [mine, locks] = await Promise.all([
          fetchMyScore(s.id, userId),
          fetchLockStatus(s.id),
        ])
        const base = defaultScores(s.rubric ?? [])
        if (mine) {
          setScores({ ...base, ...mine.scores })
          setLocked(mine.locked)
        } else {
          setScores(base)
          setLocked(false)
        }
        setLockStatus(locks)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }, [group.id, userId])

  // The group's EFFECTIVE rubric (everyone's mashed) — snapshots a NEW session.
  useEffect(() => {
    let cancelled = false
    fetchGroupRubrics(group.id)
      .then((all) => !cancelled && setGroupRubric(mashRubrics(all)))
      .catch(() => !cancelled && setGroupRubric(null))
    return () => {
      cancelled = true
    }
  }, [group.id])

  useEffect(() => {
    void load()
    const unsubscribe = onSessionChange(group.id, () => void load())
    return unsubscribe
  }, [load, group.id])

  // keep lock flags fresh while waiting on others (realtime covers the reveal)
  useEffect(() => {
    if (session?.state !== 'blind' || !locked) return
    const id = setInterval(() => {
      fetchLockStatus(session.id).then(setLockStatus).catch(() => {})
    }, 15000)
    return () => clearInterval(id)
  }, [session, locked])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Genre add-ons (Humor for a comedy, Fear Factor for a horror, …) come
      // from the title's TMDB genres; manual entries have none.
      let genreIds: number[] = []
      if (picked) {
        try {
          genreIds = (await fetchTitleDetail(picked.tmdbId, mediaType))?.genreIds ?? []
        } catch {
          // non-fatal: the session just starts without genre categories
        }
      }
      const rows = groupRubric && groupRubric.length > 0 ? groupRubric : defaultRubricRows()
      const rubric = resolveSessionRubric(rows, genreIds)

      await createSession(
        group.id,
        userId,
        picked
          ? {
              name: picked.name,
              year: picked.year,
              mediaType,
              tmdbId: picked.tmdbId,
              posterPath: picked.posterPath,
            }
          : {
              name: titleName.trim(),
              year: titleYear ? Number(titleYear) : null,
              mediaType,
              tmdbId: null,
              posterPath: null,
            },
        rubric,
      )
      setTitleName('')
      setTitleYear('')
      setPicked(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session')
    } finally {
      setBusy(false)
    }
  }

  async function handleLockIn() {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      await saveMyScore(session.id, userId, scores, true)
      setLocked(true)
      setLockStatus(await fetchLockStatus(session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not lock in')
    } finally {
      setBusy(false)
    }
  }

  async function handleReveal() {
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      await revealSession(session.id)
      onGoHome() // watch the drop
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reveal')
      setBusy(false)
    }
  }

  if (session === undefined) {
    return <p className="mp-rise py-10 text-center text-[13px] text-muted">Loading…</p>
  }

  // ---- no active blind session: start one --------------------------------
  if (session === null || session.state === 'revealed') {
    return (
      <>
        {session?.state === 'revealed' && (
          <section className="mp-rise mp-card mb-4 rounded-[26px] p-5">
            <p className="text-[13px] leading-snug text-muted">
              <span className="font-semibold text-text">{session.titleName}</span> has been
              revealed —{' '}
              <button type="button" onClick={onGoHome} className="font-semibold text-teal">
                see the result
              </button>
              . Ready for the next one?
            </p>
          </section>
        )}

        <section className="mp-rise" style={{ animationDelay: session ? '80ms' : undefined }}>
          <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            New session
          </p>
          <form onSubmit={handleCreate} className="mp-card rounded-[26px] p-6">
            <div className="mb-4 flex rounded-full border border-line bg-surface-2 p-1">
              {(['movie', 'tv'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMediaType(m)
                    setPicked(null)
                  }}
                  className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition-colors ${
                    mediaType === m ? 'bg-teal/10 text-teal' : 'text-muted'
                  }`}
                >
                  {m === 'movie' ? 'Film' : 'TV'}
                </button>
              ))}
            </div>

            {picked ? (
              <div className="flex items-center gap-3 rounded-2xl border border-teal/30 bg-teal/5 p-3">
                {picked.posterPath ? (
                  <img
                    src={posterUrl(picked.posterPath, 'w92')}
                    alt=""
                    className="h-[60px] w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid h-[60px] w-10 shrink-0 place-items-center rounded-lg font-display text-lg font-semibold text-bg"
                    style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
                  >
                    {picked.name.charAt(0)}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{picked.name}</p>
                  <p className="font-mono text-[11px] text-muted">
                    {mediaType === 'movie' ? 'Film' : 'TV'}
                    {picked.year ? ` · ${picked.year}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted transition-colors hover:text-text"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  maxLength={200}
                  placeholder={`Search ${mediaType === 'movie' ? 'films' : 'TV shows'}…`}
                  value={titleName}
                  onChange={(e) => setTitleName(e.target.value)}
                  className={inputClass}
                />
                {searching && (
                  <p className="mt-2 px-1 font-mono text-[10px] text-muted">searching…</p>
                )}
                {results.length > 0 && (
                  <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface-2">
                    {results.map((r, i) => (
                      <li key={`${r.tmdbId}`}>
                        <button
                          type="button"
                          onClick={() => setPicked(r)}
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface ${
                            i > 0 ? 'border-t border-line/50' : ''
                          }`}
                        >
                          {r.posterPath ? (
                            <img
                              src={posterUrl(r.posterPath, 'w92')}
                              alt=""
                              className="h-12 w-8 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="grid h-12 w-8 shrink-0 place-items-center rounded-md bg-line font-display text-sm font-semibold text-bg"
                            >
                              {r.name.charAt(0)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                            {r.name}
                          </span>
                          <span className="tabular shrink-0 font-mono text-[11px] text-muted">
                            {r.year ?? '—'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {titleName.trim().length >= 2 && !searching && (
                  <div className="mt-3 flex flex-col gap-3">
                    <input
                      type="number"
                      min={1870}
                      max={2200}
                      placeholder="Year (only if using it as typed)"
                      value={titleYear}
                      onChange={(e) => setTitleYear(e.target.value)}
                      className={inputClass}
                    />
                    {results.length === 0 && (
                      <p className="px-1 text-[12px] text-muted">
                        No matches — starting will use "{titleName.trim()}" as typed.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {error && (
              <p role="alert" className="mt-3 text-[12px] leading-snug text-coral">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || (!picked && titleName.trim().length === 0)}
              className="mt-4 w-full rounded-full py-3.5 text-[14px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundImage: 'linear-gradient(180deg, #F2CD77, #DFA338)' }}
            >
              {busy ? 'Starting…' : 'Start blind scoring'}
            </button>
          </form>
          <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
            Search powered by{' '}
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noreferrer"
              className="text-teal"
            >
              TMDB
            </a>
            .
          </p>
        </section>
      </>
    )
  }

  // ---- active blind session: score it -------------------------------------
  const rubric = session.rubric ?? []
  const weights = weightsFromRubric(rubric)
  const weighted = rubric.length > 0 ? memberWeightedScore(scores, weights) : null
  const weightTotal = rubric.reduce((sum, e) => sum + e.weight, 0)
  const lockedIds = new Set(lockStatus.filter((l) => l.locked).map((l) => l.memberId))
  const waiting = members.filter((m) => !lockedIds.has(m.userId))
  const canReveal = group.role === 'owner' || session.createdBy === userId

  return (
    <>
      {/* ---- Title being scored ---- */}
      <section className="mp-rise mp-card rounded-[26px] p-6">
        <div className="flex items-start gap-4">
          <div
            aria-hidden
            className="relative grid h-[84px] w-14 shrink-0 place-items-center overflow-hidden rounded-xl font-display text-2xl font-semibold text-bg"
            style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
          >
            {session.posterPath ? (
              <img
                src={posterUrl(session.posterPath)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              session.titleName.charAt(0)
            )}
            <span className="mp-poster-grain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                Now scoring · {session.mediaType === 'movie' ? 'Film' : 'TV'}
                {session.titleYear ? ` · ${session.titleYear}` : ''}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                Blind
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-[27px] font-semibold leading-[1.05]">
              {session.titleName}
            </h2>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-line/60 pt-4">
          <div>
            <span className="tabular font-display text-[44px] font-semibold leading-none text-gold">
              {formatScore(weighted)}
            </span>
            <p className="mt-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-gold">
              Your weighted
            </p>
          </div>
          <div className="mb-1 flex flex-col items-end gap-1.5">
            <div className="flex -space-x-1.5">
              {members
                .filter((m) => lockedIds.has(m.userId))
                .map((m) => (
                  <span
                    key={m.userId}
                    title={m.displayName}
                    className="grid h-6 w-6 place-items-center rounded-full border-2 border-surface font-mono text-[9px] font-bold text-bg"
                    style={{ backgroundColor: colorForMember(members, m.userId) }}
                  >
                    {m.displayName.charAt(0).toUpperCase()}
                  </span>
                ))}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {lockedIds.size}/{members.length} locked
            </p>
          </div>
        </div>
      </section>

      {/* ---- The five category sliders ---- */}
      <section className="mp-rise mt-4" style={{ animationDelay: '80ms' }}>
        <div className="mp-card rounded-[26px] px-5 py-1">
          {rubric.map((entry, i) => {
            const value = scores[entry.key] ?? 5
            const color = scoreColor(value)
            return (
              <div key={entry.key} className={`py-4 ${i > 0 ? 'border-t border-line/50' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[14px] font-medium leading-tight">{entry.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      weight{' '}
                      {weightTotal > 0 ? Math.round((entry.weight / weightTotal) * 100) : '—'}%
                    </p>
                  </div>
                  <span className="tabular font-mono text-xl font-bold" style={{ color }}>
                    {value}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={value}
                  disabled={locked || busy}
                  aria-label={`${entry.label} score`}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [entry.key]: Number(e.target.value) }))
                  }
                  className="mp-slider mt-1.5"
                  style={{ '--thumb': color, '--fill': ((value - 1) / 9) * 100 } as CSSProperties}
                />
              </div>
            )
          })}
        </div>
      </section>

      {/* ---- Blind note + lock in / reveal ---- */}
      <section className="mp-rise mt-4" style={{ animationDelay: '160ms' }}>
        <div className="flex items-center gap-2.5 px-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <p className="text-[12px] leading-snug text-muted">
            Your ratings stay hidden from the group until the reveal.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-3 px-2 text-[12px] leading-snug text-coral">
            {error}
          </p>
        )}

        {locked ? (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-teal/30 bg-teal/10 py-3.5 text-[14px] font-semibold text-teal">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m4.5 12.5 5 5 10-11" />
            </svg>
            {waiting.length === 0
              ? 'Everyone is locked in'
              : `Locked in — waiting on ${waiting.map((m) => m.displayName).join(', ')}`}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleLockIn()}
            disabled={busy}
            className="mt-4 w-full rounded-full py-3.5 text-[14px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundImage: 'linear-gradient(180deg, #F2CD77, #DFA338)' }}
          >
            {busy ? 'Locking…' : 'Lock in your scores'}
          </button>
        )}

        {locked && canReveal && (
          <>
            <button
              type="button"
              onClick={() => void handleReveal()}
              disabled={busy}
              className="mt-3 w-full rounded-full py-3.5 text-[14px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(81,197,190,0.5),inset_0_1px_0_rgba(255,255,255,0.3)] transition-transform active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundImage: 'linear-gradient(180deg, #6FE3DB, #3FA9A2)' }}
            >
              {busy ? 'Revealing…' : 'Reveal the scores'}
            </button>
            {waiting.length > 0 && (
              <p className="mt-2 text-center font-mono text-[10px] text-muted">
                {waiting.length} still scoring — revealing now drops without them
              </p>
            )}
          </>
        )}
      </section>
    </>
  )
}
