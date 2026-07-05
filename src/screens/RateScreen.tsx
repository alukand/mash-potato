import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { memberWeightedScore, formatScore, CATEGORY_LABELS, CATEGORY_IDS } from '../lib/scoring'
import type { CategoryScores, RubricWeights } from '../lib/scoring'
import { scoreColor } from '../lib/scoreColor'
import {
  createSession,
  fetchLatestSession,
  fetchLockStatus,
  fetchMyScore,
  fetchWeights,
  onSessionChange,
  revealSession,
  saveMyScore,
} from '../lib/api'
import type { GroupInfo, MemberInfo, SessionInfo } from '../lib/api'
import { colorForMember } from '../lib/palette'

interface RateScreenProps {
  group: GroupInfo
  members: MemberInfo[]
  userId: string
  onGoHome: () => void
}

// Live blind scoring. Scores are real member_scores rows written through RLS;
// lock STATUS of others comes from the session_lock_status helper (flags
// only). The reveal calls the reveal_session RPC.

const DEFAULT_SCORES: CategoryScores = {
  story: 5,
  acting: 5,
  cinematography: 5,
  pacing: 5,
  scoreSound: 5,
}

const inputClass =
  'w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-text ' +
  'placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60'

export function RateScreen({ group, members, userId, onGoHome }: RateScreenProps) {
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined)
  const [weights, setWeights] = useState<RubricWeights | null>(null)
  const [scores, setScores] = useState<CategoryScores>(DEFAULT_SCORES)
  const [locked, setLocked] = useState(false)
  const [lockStatus, setLockStatus] = useState<{ memberId: string; locked: boolean }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // new-session form
  const [titleName, setTitleName] = useState('')
  const [titleYear, setTitleYear] = useState('')
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie')

  const load = useCallback(async () => {
    try {
      const s = await fetchLatestSession(group.id)
      setSession(s)
      if (s?.state === 'blind') {
        const [mine, locks, w] = await Promise.all([
          fetchMyScore(s.id, userId),
          fetchLockStatus(s.id),
          fetchWeights(group.id),
        ])
        if (mine) {
          setScores(mine.scores)
          setLocked(mine.locked)
        } else {
          setScores(DEFAULT_SCORES)
          setLocked(false)
        }
        setLockStatus(locks)
        setWeights(w)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }, [group.id, userId])

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
      await createSession(group.id, userId, {
        name: titleName.trim(),
        year: titleYear ? Number(titleYear) : null,
        mediaType,
      })
      setTitleName('')
      setTitleYear('')
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
                  onClick={() => setMediaType(m)}
                  className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition-colors ${
                    mediaType === m ? 'bg-teal/10 text-teal' : 'text-muted'
                  }`}
                >
                  {m === 'movie' ? 'Film' : 'TV'}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                required
                maxLength={200}
                placeholder="Title — e.g. Past Lives"
                value={titleName}
                onChange={(e) => setTitleName(e.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                min={1870}
                max={2200}
                placeholder="Year (optional)"
                value={titleYear}
                onChange={(e) => setTitleYear(e.target.value)}
                className={inputClass}
              />
            </div>
            {error && (
              <p role="alert" className="mt-3 text-[12px] leading-snug text-coral">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || titleName.trim().length === 0}
              className="mt-4 w-full rounded-full py-3.5 text-[14px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-[0.98] disabled:opacity-60"
              style={{ backgroundImage: 'linear-gradient(180deg, #F2CD77, #DFA338)' }}
            >
              {busy ? 'Starting…' : 'Start blind scoring'}
            </button>
          </form>
          <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
            Everyone scores blind. Search-powered titles (TMDB) arrive in a later milestone — for
            now, type it in.
          </p>
        </section>
      </>
    )
  }

  // ---- active blind session: score it -------------------------------------
  const weighted = weights ? memberWeightedScore(scores, weights) : null
  const weightTotal = weights ? CATEGORY_IDS.reduce((sum, id) => sum + weights[id], 0) : 0
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
            {session.titleName.charAt(0)}
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
          {CATEGORY_IDS.map((id, i) => {
            const value = scores[id]
            const color = scoreColor(value)
            return (
              <div key={id} className={`py-4 ${i > 0 ? 'border-t border-line/50' : ''}`}>
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="text-[14px] font-medium leading-tight">{CATEGORY_LABELS[id]}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      weight{' '}
                      {weights && weightTotal > 0
                        ? Math.round((weights[id] / weightTotal) * 100)
                        : '—'}
                      %
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
                  aria-label={`${CATEGORY_LABELS[id]} score`}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [id]: Number(e.target.value) }))
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
            Everyone scores blind — the database itself refuses to show anyone else's numbers
            until the reveal.
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
