import { useCallback, useEffect, useState } from 'react'
import { memberWeightedScore, formatScore } from '../lib/scoring'
import type { CategoryScores } from '../lib/scoring'
import {
  fetchLockStatus,
  fetchMyScore,
  fetchSessionRsvps,
  posterUrl,
  respondToSession,
  revealSession,
  saveMyScore,
} from '../lib/api'
import type { GroupInfo, MemberInfo, SessionInfo, SessionRubricEntry } from '../lib/api'
import { weightsFromRubric } from '../lib/mapping'
import { participation, formatWindow } from '../lib/rsvp'
import { colorForMember } from '../lib/palette'
import { Avatar } from './avatars'
import { CtaButton, ScoreSliderRow, fieldClass } from './ui'
import { CategoryLegend } from './CategoryLegend'

interface RoundScorerProps {
  session: SessionInfo
  group: GroupInfo
  members: MemberInfo[]
  userId: string
  /** The reveal fired (or anything else that should refresh the panel). */
  onChanged: () => void
}

/** Every category of the session's snapshot starts at the midpoint. */
const defaultScores = (rubric: SessionRubricEntry[]): CategoryScores =>
  Object.fromEntries(rubric.map((e) => [e.key, 5]))

// The live blind round: RSVP, sliders, one-liner, lock, and the Reveal CTA.
// Scores are real member_scores rows written through RLS; lock STATUS of
// others comes from the session_lock_status helper (flags only).
export function RoundScorer({ session, group, members, userId, onChanged }: RoundScorerProps) {
  const [scores, setScores] = useState<CategoryScores>({})
  const [locked, setLocked] = useState(false)
  const [oneLiner, setOneLiner] = useState('')
  const [lockStatus, setLockStatus] = useState<{ memberId: string; locked: boolean }[]>([])
  const [rsvps, setRsvps] = useState<{ memberId: string; status: 'in' | 'pass' }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [mine, locks, answers] = await Promise.all([
        fetchMyScore(session.id, userId),
        fetchLockStatus(session.id),
        fetchSessionRsvps(session.id).catch(() => []),
      ])
      const base = defaultScores(session.rubric ?? [])
      if (mine) {
        setScores({ ...base, ...mine.scores })
        setLocked(mine.locked)
        setOneLiner(mine.oneLiner ?? '')
      } else {
        setScores(base)
        setLocked(false)
        setOneLiner('')
      }
      setLockStatus(locks)
      setRsvps(answers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }, [session, userId])

  useEffect(() => {
    void load()
  }, [load])

  // keep lock flags fresh while waiting on others (realtime covers the reveal)
  useEffect(() => {
    if (!locked) return
    const id = setInterval(() => {
      fetchLockStatus(session.id).then(setLockStatus).catch(() => {})
    }, 15000)
    return () => clearInterval(id)
  }, [session.id, locked])

  async function handleLockIn() {
    setBusy(true)
    setError(null)
    try {
      await saveMyScore(session.id, userId, scores, true, oneLiner.trim() || null)
      setLocked(true)
      setLockStatus(await fetchLockStatus(session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not lock in')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlock() {
    setBusy(true)
    setError(null)
    try {
      // keep the row (you stay "in") but drop the lock so sliders re-open
      await saveMyScore(session.id, userId, scores, false, oneLiner.trim() || null)
      setLocked(false)
      setLockStatus(await fetchLockStatus(session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock')
    } finally {
      setBusy(false)
    }
  }

  async function handleRespond(status: 'in' | 'pass') {
    setBusy(true)
    setError(null)
    try {
      await respondToSession(session.id, userId, status)
      setRsvps(await fetchSessionRsvps(session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your answer')
    } finally {
      setBusy(false)
    }
  }

  async function handleReveal() {
    setBusy(true)
    setError(null)
    try {
      await revealSession(session.id)
      onChanged() // the panel flips to the Reveal in place
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reveal')
      setBusy(false)
    }
  }

  const rubric = session.rubric ?? []
  const weights = weightsFromRubric(rubric)
  const weighted = rubric.length > 0 ? memberWeightedScore(scores, weights) : null
  const weightTotal = rubric.reduce((sum, e) => sum + e.weight, 0)
  const lockedIds = new Set(lockStatus.filter((l) => l.locked).map((l) => l.memberId))
  // Every round is an invite: members answer in/pass; unanswered invites
  // expire after 24h; scoring always counts as in. Only solo groups skip it.
  const showRsvps = members.length > 1
  const part = participation({
    memberIds: members.map((m) => m.userId),
    rsvps,
    scoredMemberIds: lockStatus.map((l) => l.memberId),
    sessionCreatedAt: session.createdAt,
  })
  const inIds = new Set(showRsvps ? part.inIds : members.map((m) => m.userId))
  const myPart = showRsvps ? (part.status.get(userId) ?? 'invited') : 'in'
  const waiting = members.filter((m) => inIds.has(m.userId) && !lockedIds.has(m.userId))
  const canReveal = group.role === 'owner' || session.createdBy === userId
  // One lock must never drop the reveal on everyone: multi-member groups need
  // a second locked card first (also enforced server-side in reveal_session).
  const eligibleCount = showRsvps ? part.inIds.length + part.invitedIds.length : members.length
  const revealQuorum = lockedIds.size >= Math.min(2, Math.max(eligibleCount, 1))

  return (
    <>
      {/* ---- round invite (groups of 3+) ---- */}
      {showRsvps && myPart === 'invited' && !locked && (
        <section className="mp-rise mp-card mb-4 rounded-[26px] border border-teal/20 p-5">
          <p className="text-[14px] font-semibold leading-snug">In for this one?</p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            {session.titleName}: answers close in {formatWindow(part.windowRemainingMs)}; no
            answer counts as a pass. You can always jump in later.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <CtaButton
              tone="teal"
              disabled={busy}
              onClick={() => void handleRespond('in')}
              className="flex-1 py-2.5 text-[13px]"
            >
              I'm in
            </CtaButton>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRespond('pass')}
              className="flex-1 rounded-full border border-line py-2.5 text-[13px] font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
            >
              Pass
            </button>
          </div>
        </section>
      )}
      {showRsvps && myPart === 'passed' && !locked && (
        <section className="mp-rise mb-4 rounded-2xl border border-line bg-surface-2 px-4 py-3">
          <p className="text-[13px] leading-snug text-muted">
            You passed on this one. Score it below anytime to jump back in.
          </p>
        </section>
      )}

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
                Now scoring: {session.mediaType === 'movie' ? 'Film' : 'TV'}
                {session.titleYear ? ` ${session.titleYear}` : ''}
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
            <p className="mt-1 text-[10px] leading-snug text-muted">
              each slider × its weight, added up
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
                    className="rounded-full border-2 border-surface"
                  >
                    <Avatar
                      avatarKey={m.avatarKey}
                      displayName={m.displayName}
                      color={colorForMember(members, m.userId)}
                      size={22}
                    />
                  </span>
                ))}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {lockedIds.size}/{inIds.size} locked
            </p>
            {showRsvps && (part.passedIds.length > 0 || part.invitedIds.length > 0) && (
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
                {part.passedIds.length > 0 ? `${part.passedIds.length} passed` : ''}
                {part.passedIds.length > 0 && part.invitedIds.length > 0 ? ', ' : ''}
                {part.invitedIds.length > 0 ? `${part.invitedIds.length} invited` : ''}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- The category sliders ---- */}
      <section className="mp-rise mt-4" style={{ animationDelay: '80ms' }}>
        <p className="mb-2 px-1 text-[13px] leading-snug text-muted">
          Score each part for what it's trying to be.
        </p>
        <CategoryLegend entries={rubric} className="mb-3 px-2" />
        <div className="mp-card rounded-[26px] px-5 py-1">
          {rubric.map((entry, i) => (
            <ScoreSliderRow
              key={entry.key}
              className={`py-4 ${i > 0 ? 'border-t border-line/50' : ''}`}
              label={entry.label}
              sub={
                <p className="mt-0.5 font-mono text-[10px] text-muted">
                  weight{' '}
                  {weightTotal > 0 ? Math.round((entry.weight / weightTotal) * 100) : '—'}%
                </p>
              }
              value={scores[entry.key] ?? 5}
              disabled={locked || busy}
              onChange={(v) => setScores((prev) => ({ ...prev, [entry.key]: v }))}
            />
          ))}
        </div>
      </section>

      {/* ---- One-liner: sealed with the scores, drops at the reveal ---- */}
      <section className="mp-rise mt-4" style={{ animationDelay: '120ms' }}>
        <label
          htmlFor="rate-one-liner"
          className="mb-1.5 block px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted"
        >
          Your one-liner
        </label>
        <input
          id="rate-one-liner"
          type="text"
          maxLength={140}
          value={oneLiner}
          disabled={locked || busy}
          onChange={(e) => setOneLiner(e.target.value)}
          placeholder="In one sentence, what was it about? (optional)"
          className={`${fieldClass} disabled:opacity-60`}
        />
      </section>

      {/* ---- Blind note + lock in / reveal ---- */}
      <section className="mp-rise mt-4" style={{ animationDelay: '160ms' }}>
        <div className="flex items-center gap-2.5 px-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          <p className="text-[13px] leading-snug text-muted">
            Your ratings stay hidden from the group until the reveal.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-3 px-2 text-[13px] leading-snug text-coral">
            {error}
          </p>
        )}

        {locked ? (
          <>
            <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-teal/30 bg-teal/10 py-3.5 text-[14px] font-semibold text-teal">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m4.5 12.5 5 5 10-11" />
              </svg>
              {waiting.length === 0
                ? 'Everyone is locked in'
                : `Locked in, waiting on ${waiting.map((m) => m.displayName).join(', ')}`}
            </div>
            <button
              type="button"
              onClick={() => void handleUnlock()}
              disabled={busy}
              className="mt-2 w-full rounded-full py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
            >
              {busy ? 'Unlocking…' : 'Unlock to change my scores'}
            </button>
          </>
        ) : (
          <CtaButton
            onClick={() => void handleLockIn()}
            disabled={busy}
            className="mt-4 w-full py-3.5 text-[14px]"
          >
            {busy ? 'Locking…' : 'Lock in your scores'}
          </CtaButton>
        )}

        {locked && canReveal && revealQuorum && (
          <>
            <CtaButton
              tone="teal"
              onClick={() => void handleReveal()}
              disabled={busy}
              className="mt-3 w-full py-3.5 text-[14px]"
            >
              {busy ? 'Revealing…' : 'Reveal the scores'}
            </CtaButton>
            {waiting.length > 0 && (
              <p className="mt-2 text-center font-mono text-[10px] text-muted">
                {waiting.length} still scoring, revealing now drops without them
              </p>
            )}
          </>
        )}
        {locked && canReveal && !revealQuorum && (
          <p className="mt-3 text-center text-[13px] leading-snug text-muted">
            The Reveal unlocks once someone else locks in too.
          </p>
        )}
      </section>
    </>
  )
}
