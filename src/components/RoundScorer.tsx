import { useCallback, useEffect, useRef, useState } from 'react'
import { memberWeightedScore, formatScore } from '../lib/scoring'
import type { CategoryScores } from '../lib/scoring'
import {
  cancelSession,
  fetchGroupRubrics,
  fetchLockStatus,
  fetchMyGenreRubrics,
  fetchMyScore,
  fetchRoundGames,
  fetchSessionRsvps,
  fetchTermsAccepted,
  posterUrl,
  respondToSession,
  revealSession,
  saveMyGenreRubric,
  saveMyScore,
  saveRoundTake,
} from '../lib/api'
import type { GroupInfo, GroupRubricRow, MemberInfo, SessionInfo, SessionRubricEntry } from '../lib/api'
import { splitRubricForMember } from '../lib/rubricCatalog'
import { weightsFromRubric } from '../lib/mapping'
import { participation, formatWindow } from '../lib/rsvp'
import { colorForMember } from '../lib/palette'
import { Avatar } from './avatars'
import { CtaButton, ExtraCategoryChips, ScoreSliderRow, fieldClass } from './ui'
import { CategoryLegend } from './CategoryLegend'
import { LoadingCards, SuccessMark } from './Moments'
import { refreshRewards } from '../lib/rewardsStore'
import { TAKE_MAX } from '../lib/roundGames'
import { HouseRulesSheet } from './HouseRulesSheet'
import { GenrePrompt } from './GenrePrompt'
import { GenreRubricSheet } from './GenreRubricSheet'
import { genreDef, needsGenrePrompt, roundRowsFor } from '../lib/genres'
import type { GenreKey } from '../lib/genres'

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

// The live blind round: RSVP, sliders, one-liner (or, in a blind-takes round,
// the take), lock, and the Reveal CTA.
// Scores are real member_scores rows written through RLS; lock STATUS of
// others comes from the session_lock_status helper (flags only).
export function RoundScorer({ session, group, members, userId, onChanged }: RoundScorerProps) {
  // Normie groups share one rubric, so nothing is an opt-in extra there.
  const isCasual = group.tasteMode === 'casual'
  const [scores, setScores] = useState<CategoryScores>({})
  const [locked, setLocked] = useState(false)
  const [reviewLocked, setReviewLocked] = useState(false)
  const lockConfirmation = useRef<HTMLDivElement>(null)
  const focusConfirmation = useRef(false)
  useEffect(() => {
    if (locked && focusConfirmation.current) {
      lockConfirmation.current?.focus()
      focusConfirmation.current = false
    }
  }, [locked])
  const [oneLiner, setOneLiner] = useState('')
  // A blind-takes round: your take rides your card, sealed until the reveal.
  const blindTakes = session.takesMode === 'blind'
  const [take, setTake] = useState('')
  const [savedTake, setSavedTake] = useState('')
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null)
  const [termsOpen, setTermsOpen] = useState(false)
  // Genre rubrics. The question is asked once per genre; your answer counts
  // from your NEXT round of it, so this card keeps splitting on the rubric
  // you had when the round first loaded here.
  const [myGenreRubrics, setMyGenreRubrics] = useState<Map<GenreKey, GroupRubricRow[] | null> | null>(null)
  const ownAtStart = useRef<{ sessionId: string; rows: GroupRubricRow[] | null } | null>(null)
  const [genreSheet, setGenreSheet] = useState(false)
  const [genreBusy, setGenreBusy] = useState(false)
  const [genreNote, setGenreNote] = useState<string | null>(null)
  const [lockStatus, setLockStatus] = useState<{ memberId: string; locked: boolean }[]>([])
  const [rsvps, setRsvps] = useState<{ memberId: string; status: 'in' | 'pass' }[]>([])
  // undefined = still loading; the split into core vs opt-in extras waits.
  const [myRows, setMyRows] = useState<GroupRubricRow[] | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Two-step guards for the round's two irreversible actions.
  const [confirmReveal, setConfirmReveal] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const load = useCallback(async () => {
    try {
      const [mine, locks, answers, rubrics, genreRubrics] = await Promise.all([
        fetchMyScore(session.id, userId),
        fetchLockStatus(session.id),
        fetchSessionRsvps(session.id).catch(() => []),
        fetchGroupRubrics(group.id).catch(() => []),
        fetchMyGenreRubrics(userId).catch(() => new Map<GenreKey, GroupRubricRow[] | null>()),
      ])
      setMyGenreRubrics(genreRubrics)
      if (ownAtStart.current?.sessionId !== session.id) {
        ownAtStart.current = {
          sessionId: session.id,
          rows: session.genre ? (genreRubrics.get(session.genre) ?? null) : null,
        }
      }
      // Your categories on this card: your rubric for the round's genre.
      const rows = roundRowsFor({
        usual: rubrics.find((r) => r.userId === userId)?.rows ?? null,
        own: ownAtStart.current.rows,
        genre: session.genre,
        snapshot: session.rubric ?? [],
        casual: isCasual,
      })
      setMyRows(rows)
      // Only YOUR core categories pre-seed at the midpoint; extras join the
      // card when you add them (a drafted extra counts as added).
      const { core } = splitRubricForMember(session.rubric ?? [], rows, isCasual)
      const base = defaultScores(core)
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
      if (session.takesMode === 'blind') {
        const [games, accepted] = await Promise.all([
          fetchRoundGames(session.id),
          fetchTermsAccepted(userId).catch(() => null),
        ])
        setTake(games.myTake?.body ?? '')
        setSavedTake(games.myTake?.body ?? '')
        setTermsAccepted(accepted)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }, [session, group.id, isCasual, userId])

  useEffect(() => {
    void load()
  }, [load])

  // Keep lock flags fresh (realtime covers the reveal itself, but member_scores
  // is not published). This used to be gated on `locked`, which froze the
  // "N/M locked" counter during exactly the window you care about: while you
  // are still scoring and watching for everyone else.
  useEffect(() => {
    const id = setInterval(() => {
      fetchLockStatus(session.id).then(setLockStatus).catch(() => {})
    }, 15000)
    return () => clearInterval(id)
  }, [session.id])

  async function handleLockIn(termsJustAgreed = false) {
    const body = take.trim()
    // The house rules come first, before anyone's words go anywhere.
    if (blindTakes && body !== '' && termsAccepted === false && !termsJustAgreed) {
      setTermsOpen(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      // The take first: if it is refused (the wordlist, say), nothing locks.
      if (blindTakes && body !== savedTake) {
        await saveRoundTake(session.id, body)
        setSavedTake(body)
        setTake(body)
      }
      await saveMyScore(session.id, userId, scores, true, blindTakes ? null : oneLiner.trim() || null)
      void refreshRewards(userId) // a card locked after the reveal can earn
      focusConfirmation.current = true
      setLocked(true)
      setReviewLocked(false)
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
      await saveMyScore(session.id, userId, scores, false, blindTakes ? null : oneLiner.trim() || null)
      setLocked(false)
      setLockStatus(await fetchLockStatus(session.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock')
    } finally {
      setBusy(false)
    }
  }

  async function keepStandardGenre(genre: GenreKey) {
    setGenreBusy(true)
    setError(null)
    try {
      await saveMyGenreRubric(userId, genre, null)
      setMyGenreRubrics((prev) => new Map(prev ?? []).set(genre, null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that')
    } finally {
      setGenreBusy(false)
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
    setConfirmReveal(false)
    try {
      await revealSession(session.id)
      void refreshRewards(userId) // the reveal pays the night's locked cards
      onChanged() // the panel flips to the Reveal in place
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reveal')
      setBusy(false)
    }
  }

  // Call off a round started by mistake. Deletes it and every scorecard on
  // it; realtime carries the delete to everyone else's panel.
  async function handleCancel() {
    setBusy(true)
    setError(null)
    try {
      await cancelSession(session.id)
      setConfirmCancel(false)
      onChanged() // the panel falls back to "start a round"
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not call off the round')
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
  // Owner or whoever started it — the same pair reveal_session authorizes,
  // and now the same pair that can call the round off.
  const canReveal = group.role === 'owner' || session.createdBy === userId
  const lockedCount = lockedIds.size
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
            {session.genre && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Scored as {genreDef(session.genre).label}
              </p>
            )}
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
              {lockedIds.size}/{Math.max(inIds.size, lockedIds.size)} locked
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

      {locked && <button type="button" onClick={() => setReviewLocked((open) => !open)} aria-expanded={reviewLocked} aria-controls="my-locked-scorecard" className="mt-3 min-h-11 w-full rounded-full border border-line px-4 text-[13px] font-semibold text-muted hover:text-text">{reviewLocked ? 'Hide my scorecard' : 'Review my sealed scorecard'} <span aria-hidden>{reviewLocked ? '↑' : '↓'}</span></button>}
      <div id="my-locked-scorecard" hidden={locked && !reviewLocked}>
      {/* ---- the once-per-genre question (never Normies, never mid-lock) ---- */}
      {!locked && needsGenrePrompt(session.genre, myGenreRubrics, isCasual) && (
        <div className="mp-rise mt-4">
          <GenrePrompt
            genre={session.genre}
            where="round"
            busy={genreBusy}
            onKeepStandard={() => session.genre && void keepStandardGenre(session.genre)}
            onMakeOwn={() => setGenreSheet(true)}
          />
        </div>
      )}
      {genreNote && (
        <p role="status" className="mp-rise mt-3 px-2 text-[13px] leading-snug text-gold">
          {genreNote}
        </p>
      )}

      {/* ---- The category sliders: your core + the extras you added ---- */}
      <section className="mp-rise mt-4" style={{ animationDelay: '80ms' }}>
        <p className="mb-2 px-1 text-[13px] leading-snug text-muted">
          Score each part for what it's trying to be.
        </p>
        <CategoryLegend entries={rubric} className="mb-3 px-2" />
        {myRows === undefined ? (
          <LoadingCards label="Loading your rubric…" />
        ) : (
          (() => {
            const { core, extras } = splitRubricForMember(rubric, myRows, isCasual)
            const sliderEntries = [
              ...core,
              ...extras.filter((e) => scores[e.key] !== undefined),
            ]
            return (
              <>
                <div className="mp-card rounded-[26px] px-5 py-1">
                  {sliderEntries.map((entry, i) => (
                    <ScoreSliderRow
                      key={entry.key}
                      className={`py-4 ${i > 0 ? 'border-t border-line/50' : ''}`}
                      label={entry.label}
                      sub={
                        <p className="mt-0.5 font-mono text-[10px] text-muted">
                          weight{' '}
                          {weightTotal > 0
                            ? Math.round((entry.weight / weightTotal) * 100)
                            : '—'}
                          %
                        </p>
                      }
                      value={scores[entry.key] ?? 5}
                      disabled={locked || busy}
                      onChange={(v) => setScores((prev) => ({ ...prev, [entry.key]: v }))}
                    />
                  ))}
                </div>
                <ExtraCategoryChips
                  extras={extras}
                  isOn={(key) => scores[key] !== undefined}
                  disabled={locked || busy}
                  onToggle={(key) =>
                    setScores((prev) => {
                      if (prev[key] !== undefined) {
                        const next = { ...prev }
                        delete next[key]
                        return next
                      }
                      return { ...prev, [key]: 5 }
                    })
                  }
                  className="mt-3 px-1"
                />
              </>
            )
          })()
        )}
      </section>

      {/* ---- The words on the card: a blind take (the group votes on the
           best), a pointer to the after-reveal vote, or the one-liner.
           All sealed with the scores, all dropped at the reveal. ---- */}
      {blindTakes ? (
        <section className="mp-rise mt-4" style={{ animationDelay: '120ms' }}>
          <label
            htmlFor="rate-take"
            className="mb-1.5 block px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-gold"
          >
            Your take
          </label>
          <textarea
            id="rate-take"
            rows={3}
            maxLength={TAKE_MAX}
            value={take}
            disabled={locked || busy}
            onChange={(e) => setTake(e.target.value)}
            placeholder="What's your take? The group votes on the best one after the reveal."
            className={`${fieldClass} resize-none leading-snug disabled:opacity-60`}
          />
          <div className="mt-1 flex items-start justify-between gap-3 px-2">
            <p className="text-[12px] leading-snug text-muted">
              Sealed with your scores. Everyone&apos;s drops at the reveal.
            </p>
            <span className="tabular shrink-0 font-mono text-[10px] text-muted">
              {take.length}/{TAKE_MAX}
            </span>
          </div>
        </section>
      ) : session.takesMode === 'after' ? (
        <p className="mp-rise mt-4 px-2 text-[13px] leading-snug text-muted" style={{ animationDelay: '120ms' }}>
          This round has a best-take vote. Write yours once the scores are out.
        </p>
      ) : (
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
      )}
      </div>

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
            <div ref={lockConfirmation} tabIndex={-1} role="status" className="mt-4 flex items-start gap-4 rounded-[22px] border border-teal/30 bg-teal/10 p-5 outline-none">
              <SuccessMark />
              <div className="min-w-0"><h3 className="font-display text-[22px] font-semibold leading-tight text-teal">Your scores are sealed.</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{waiting.length > 0
                  ? `Waiting for ${waiting.map((m) => m.displayName).join(', ')} to lock in.`
                  : part.invitedIds.length > 0 ? 'Everyone scoring is locked in. A few invitations are still open.' : 'Everyone scoring is locked in. Next up: the Reveal.'}</p>
              </div>
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
            disabled={busy || Object.keys(scores).length === 0}
            className="mt-4 w-full py-3.5 text-[14px]"
          >
            {busy ? 'Locking…' : 'Lock in your scores'}
          </CtaButton>
        )}

        {locked && canReveal && revealQuorum && (
          // The most irreversible action in the app: it ends the blind round
          // for everyone, permanently. The "still scoring" warning used to
          // sit BELOW the button, i.e. after the damage.
          confirmReveal ? (
            <div className="mt-3 rounded-2xl border border-teal/30 bg-teal/5 p-4">
              <p className="text-[13px] font-semibold leading-snug text-teal">
                Drop everyone&apos;s scores now?
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-muted">
                {waiting.length > 0
                  ? `${waiting.length} ${waiting.length === 1 ? 'person is' : 'people are'} still scoring. Revealing now goes without them, and the round cannot go back to blind.`
                  : 'The Reveal cannot be undone: a revealed round is part of the group history.'}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReveal(false)}
                  className="flex-1 rounded-full border border-line py-2 text-[12px] font-semibold text-muted transition-colors hover:text-text"
                >
                  Wait
                </button>
                <CtaButton
                  tone="teal"
                  onClick={() => void handleReveal()}
                  disabled={busy}
                  className="flex-1 py-2 text-[12px]"
                >
                  {busy ? 'Revealing…' : 'Reveal'}
                </CtaButton>
              </div>
            </div>
          ) : (
            <>
              <CtaButton
                tone="teal"
                onClick={() => setConfirmReveal(true)}
                disabled={busy}
                className="mt-3 w-full py-3.5 text-[14px]"
              >
                Reveal the scores
              </CtaButton>
              {waiting.length > 0 && (
                <p className="mt-2 text-center font-mono text-[10px] text-muted">
                  {waiting.length} still scoring
                </p>
              )}
            </>
          )
        )}
        {locked && canReveal && !revealQuorum && (
          <p className="mt-3 text-center text-[13px] leading-snug text-muted">
            The Reveal unlocks once someone else locks in too.
          </p>
        )}

        {/* The way out of a mistaken round. Without this the group is stuck:
            no other round can start while one is blind, and the only other
            exit is a reveal, which needs two locked scorecards. */}
        {canReveal &&
          (confirmCancel ? (
            <div className="mt-3 rounded-2xl border border-coral/30 bg-coral/5 p-4">
              <p className="text-[13px] font-semibold leading-snug text-coral">
                Call off this round?
              </p>
              <p className="mt-1.5 text-[12px] leading-snug text-muted">
                {lockedCount > 0
                  ? `${lockedCount} ${lockedCount === 1 ? 'person has' : 'people have'} already scored. Cancelling throws ${lockedCount === 1 ? 'that scorecard' : 'those scorecards'} away.`
                  : 'The round disappears for everyone and nothing is kept.'}{' '}
                Then anyone can start a different one.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="flex-1 rounded-full border border-line py-2 text-[12px] font-semibold text-muted transition-colors hover:text-text"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={() => void handleCancel()}
                  disabled={busy}
                  className="flex-1 rounded-full bg-coral/90 py-2 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
                >
                  {busy ? 'Calling it off…' : 'Call it off'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
              className="mt-3 w-full rounded-full px-4 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-coral disabled:opacity-50"
            >
              Wrong title? Call off this round
            </button>
          ))}
      </section>

      {genreSheet && session.genre && (
        <GenreRubricSheet
          userId={userId}
          genre={session.genre}
          initial={myGenreRubrics?.get(session.genre) ?? null}
          note={`This round keeps the rubric it started with. Yours counts from your next ${genreDef(session.genre).label} round.`}
          onSaved={(rows) => {
            const genre = session.genre
            if (genre) {
              setMyGenreRubrics((prev) => new Map(prev ?? []).set(genre, rows))
              setGenreNote(
                rows
                  ? `Saved. Your ${genreDef(genre).label} rubric counts from your next ${genreDef(genre).label} round.`
                  : `You're on the standard ${genreDef(genre).label} rubric.`,
              )
            }
            setGenreSheet(false)
          }}
          onClose={() => setGenreSheet(false)}
        />
      )}

      {termsOpen && (
        <HouseRulesSheet
          onAgreed={() => {
            setTermsAccepted(true)
            setTermsOpen(false)
            void handleLockIn(true)
          }}
          onClose={() => setTermsOpen(false)}
        />
      )}
    </>
  )
}
