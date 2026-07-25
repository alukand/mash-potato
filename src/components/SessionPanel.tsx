import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { analyze, categoryStat, formatScore } from '../lib/scoring'
import type { CategoryScores, MemberScorecard } from '../lib/scoring'
import { scoreColor } from '../lib/scoreColor'
import { weightsFromRubric } from '../lib/mapping'
import {
  backfillCategoryScore,
  createSession,
  fetchAllScorecards,
  fetchGroupRubrics,
  fetchLatestSession,
  fetchSessionById,
  fetchTitleDetail,
  lateScoreSession,
  onSessionChange,
  posterUrl,
} from '../lib/api'
import type { GroupInfo, MemberInfo, SessionInfo } from '../lib/api'
import { colorForMember } from '../lib/palette'
import { touchRecentGroup } from '../lib/activeGroup'
import {
  catalogCategory,
  configuredCategoryKeys,
  defaultRubricRows,
  mashRubrics,
  resolveSessionRubric,
  splitRubricForMember,
} from '../lib/rubricCatalog'
import type { MemberRubric } from '../lib/rubricCatalog'
import { Avatar } from './avatars'
import { CtaButton, ExtraCategoryChips, ScoreSliderRow, fieldClassSm } from './ui'
import { RoundScorer } from './RoundScorer'
import { ScoreRing } from './ScoreRing'
import { MashMath } from './MashMath'

interface SessionPanelProps {
  group: GroupInfo
  members: MemberInfo[]
  userId: string
  /** View a SPECIFIC past session (from the log) instead of the latest. */
  viewSessionId?: string | null
  /** Rendered when the group has no rounds yet (the start-a-round block). */
  startRound: ReactNode
  /** "Start the next round" tapped on a revealed panel. */
  onStartNext: () => void
  /** A re-rate round started: jump the view back to the (new) latest round. */
  onViewLatest?: () => void
  /** Open the title's discussion on this group's thread (the debrief). */
  onDiscuss?: (tmdbId: number, mediaType: 'movie' | 'tv', seed: string) => void
  /** Tap the reveal's poster/title to open the title page. */
  onOpenTitle?: (tmdbId: number, mediaType: 'movie' | 'tv') => void
}

// The group's latest session, live: blind rounds show invite + lock progress,
// and the moment the reveal fires (realtime) the full Mashed layout drops in.
// Lives on the GROUP tab — Home is the cross-group dashboard.

/** Position of a 1..10 score along the plot track, as a percentage. */
const pct = (score: number) => ((score - 1) / 9) * 100

/** Category-aware debrief seeds: name the split, then ask why (every part of
 *  a movie is a choice someone made; the thread is where you defend your read
 *  of it). Keyed by category KEY with the display label interpolated, so the
 *  animated relabels (Animation, Voice Acting) read right for free. */
const DISCUSS_SEEDS: Record<string, (label: string) => string> = {
  story: (l) => `Split over ${l}. In one sentence, what was it actually about?`,
  writing: (l) => `Split over ${l}. Quote the line that sold it, or the one that lost you.`,
  acting: (l) => `Split over ${l}. Which performance did you buy, and which one broke?`,
  cinematography: (l) => `Split over ${l}. Every frame is a choice. Which image stuck with you?`,
  pacing: (l) => `Split over ${l}. Where did it drag for you, and where did it fly?`,
  scoreSound: (l) => `Split over ${l}. Beyond the songs, what did the sound do for you?`,
  emotionalImpact: (l) => `Split over ${l}. What did the last shot leave you with?`,
  humor: (l) => `Split over ${l}. Which joke landed hardest, and which one died?`,
  fearFactor: (l) => `Split over ${l}. What actually got under your skin?`,
  animation: (l) => `Split over ${l}. Every frame is a choice. Which image stuck with you?`,
}

const discussSeedFor = (key: string, label: string) =>
  (DISCUSS_SEEDS[key] ?? ((l: string) => `Split over ${l}. Defend your take…`))(label)

export function SessionPanel({
  group,
  members,
  userId,
  viewSessionId = null,
  startRound,
  onStartNext,
  onViewLatest,
  onDiscuss,
  onOpenTitle,
}: SessionPanelProps) {
  // Normie groups share one rubric, so nothing is an opt-in extra there.
  const isCasual = group.tasteMode === 'casual'
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined)
  // undefined = cards not fetched yet. Distinct from []: an empty visible set
  // means "sealed for you" (RLS), and treating "still loading" as sealed
  // flashes the seal card at every mount.
  const [scorecards, setScorecards] = useState<MemberScorecard[] | undefined>(undefined)
  const [memberRubrics, setMemberRubrics] = useState<MemberRubric[]>([])
  const [error, setError] = useState<string | null>(null)

  // ---- living reveal: late scoring + category backfill ----
  const [lateOpen, setLateOpen] = useState(false)
  const [lateScores, setLateScores] = useState<CategoryScores>({})
  const [lateLine, setLateLine] = useState('')
  const [lateBusy, setLateBusy] = useState(false)
  const [backfillValues, setBackfillValues] = useState<Record<string, number>>({})
  const [backfillBusy, setBackfillBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // ---- re-rate: a fresh blind round on the same title ----
  const [rerateBusy, setRerateBusy] = useState(false)
  const [rerateError, setRerateError] = useState<string | null>(null)
  const [confirmRerate, setConfirmRerate] = useState(false)

  // Reset per-session state the moment the session changes (a new round can
  // replace the latest session without remounting this component). Render-time
  // reset so the old session's cards never paint a frame against the new one.
  const [prevSessionId, setPrevSessionId] = useState<string | null>(null)
  if (session && session.id !== prevSessionId) {
    setPrevSessionId(session.id)
    setScorecards(undefined)
    setLateOpen(false)
    setLateScores({})
    setLateLine('')
    setBackfillValues({})
    setActionError(null)
  }

  const load = useCallback(async () => {
    try {
      const s = viewSessionId
        ? await fetchSessionById(viewSessionId)
        : await fetchLatestSession(group.id)
      setSession(s)
      if (!s) return
      if (s.state === 'revealed') {
        const [cards, rubrics] = await Promise.all([
          fetchAllScorecards(s.id),
          fetchGroupRubrics(group.id).catch(() => []),
        ])
        setScorecards(cards)
        setMemberRubrics(rubrics)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }, [group.id, viewSessionId])

  async function handleLateScore(sessionId: string) {
    setLateBusy(true)
    setActionError(null)
    try {
      await lateScoreSession(sessionId, lateScores, lateLine.trim() || null)
      setLateOpen(false)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add your scores')
    } finally {
      setLateBusy(false)
    }
  }

  async function handleBackfill(sessionId: string, key: string) {
    setBackfillBusy(key)
    setActionError(null)
    try {
      await backfillCategoryScore(sessionId, key, backfillValues[key] ?? 5)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save that score')
    } finally {
      setBackfillBusy(null)
    }
  }

  // Locked scores never change; a changed mind gets a fresh blind round on the
  // same title. Snapshots the group's CURRENT rubric (rules may have evolved
  // since the first night) and the old reveal stays in the log untouched.
  async function handleRerate(s: SessionInfo) {
    setRerateBusy(true)
    setRerateError(null)
    setConfirmRerate(false)
    try {
      const latest = await fetchLatestSession(group.id)
      if (latest?.state === 'blind') {
        setRerateError('Finish the current blind round first.')
        return
      }
      const genreIds =
        s.titleTmdbId !== null
          ? ((await fetchTitleDetail(s.titleTmdbId, s.mediaType).catch(() => null))
              ?.genreIds ?? [])
          : []
      const mashed = mashRubrics(memberRubrics)
      const rows = mashed.length > 0 ? mashed : defaultRubricRows()
      const rubric = resolveSessionRubric(rows, genreIds, configuredCategoryKeys(memberRubrics))
      await createSession(
        group.id,
        userId,
        {
          name: s.titleName,
          year: s.titleYear,
          mediaType: s.mediaType,
          tmdbId: s.titleTmdbId,
          posterPath: s.posterPath,
        },
        rubric,
      )
      touchRecentGroup(group.id)
      if (!viewSessionId) await load()
      onViewLatest?.()
    } catch (err) {
      setRerateError(err instanceof Error ? err.message : 'Could not start the round')
    } finally {
      setRerateBusy(false)
    }
  }

  useEffect(() => {
    void load()
    const unsubscribe = onSessionChange(group.id, () => void load())
    return unsubscribe
  }, [load, group.id])

  const memberName = (id: string) =>
    id === userId
      ? 'You'
      : (members.find((m) => m.userId === id)?.displayName ?? 'Member')

  if (error) {
    // A transient fetch failure used to permanently blank the round — the
    // whole point of this screen — with no way to refill it.
    return (
      <div className="mp-rise py-6 text-center">
        <p role="alert" className="text-[13px] leading-snug text-coral">
          {error}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null)
            setSession(undefined)
            void load()
          }}
          className="mt-3 rounded-full border border-line px-5 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2"
        >
          Try again
        </button>
      </div>
    )
  }

  if (session === undefined) {
    return <p className="mp-rise py-6 text-center text-[13px] text-muted">Loading…</p>
  }

  // ---- no sessions yet: the start-a-round block takes the stage -----------
  if (session === null) {
    return <>{startRound}</>
  }

  // ---- blind round in progress: score it right here -----------------------
  if (session.state === 'blind') {
    return (
      <RoundScorer
        session={session}
        group={group}
        members={members}
        userId={userId}
        onChanged={() => void load()}
      />
    )
  }

  // ---- revealed: the Mashed result -----------------------------------------
  if (scorecards === undefined) {
    return <p className="mp-rise py-6 text-center text-[13px] text-muted">Loading…</p>
  }
  const locked = scorecards.filter((s) => s.locked)
  // A draft the viewer saved blind but never locked: seed the sliders with it
  // so those scores aren't silently replaced by flat 5s.
  const myDraft = scorecards.find((s) => s.memberId === userId && !s.locked)
  // Late scoring follows the same split as blind scoring: your own
  // categories are the card; the rest are opt-in extras.
  const myLateRows = memberRubrics.find((m) => m.userId === userId)?.rows ?? null
  const toggleLateExtra = (key: string) =>
    setLateScores((prev) => {
      if (prev[key] !== undefined) {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: 5 }
    })
  if (locked.length === 0) {
    // Revealed, but SEALED for you: RLS hides everyone's scores until your
    // own card is locked, so scoring here is still genuinely blind.
    const sealedRubric = session.rubric ?? []
    const sealedSplit = splitRubricForMember(sealedRubric, myLateRows, isCasual)
    const sealedEntries = [
      ...sealedSplit.core,
      ...sealedSplit.extras.filter((e) => lateScores[e.key] !== undefined),
    ]
    return (
      <section className="mp-rise mp-card rounded-[26px] p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            {session.mediaType === 'movie' ? 'Film' : 'TV'}
            {session.titleYear ? ` ${session.titleYear}` : ''}
          </p>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-teal">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            Sealed
          </span>
        </div>
        <h2 className="mt-2 font-display text-[27px] font-semibold leading-[1.05]">
          {session.titleName}
        </h2>
        <p className="mt-3 text-[13px] leading-snug text-muted">
          The reveal is in, sealed for you until you score. Lock in your card and the
          group's scores open up, with yours folded into the Mashed.
        </p>
        {lateOpen ? (
          <>
            <div className="mt-2">
              {sealedEntries.map((entry) => (
                <ScoreSliderRow
                  key={entry.key}
                  className="border-t border-line/40 py-3"
                  label={entry.label}
                  value={lateScores[entry.key] ?? 5}
                  disabled={lateBusy}
                  onChange={(v) => setLateScores((prev) => ({ ...prev, [entry.key]: v }))}
                />
              ))}
            </div>
            <ExtraCategoryChips
              extras={sealedSplit.extras}
              isOn={(key) => lateScores[key] !== undefined}
              disabled={lateBusy}
              onToggle={toggleLateExtra}
              className="mt-3"
            />
            <input
              type="text"
              maxLength={140}
              value={lateLine}
              disabled={lateBusy}
              onChange={(e) => setLateLine(e.target.value)}
              placeholder="In one sentence, what was it about? (optional)"
              className={`${fieldClassSm} mt-2 w-full disabled:opacity-60`}
            />
            <CtaButton
              tone="teal"
              disabled={lateBusy || Object.keys(lateScores).length === 0}
              onClick={() => void handleLateScore(session.id)}
              className="mt-2 w-full py-3 text-[13px]"
            >
              {lateBusy ? 'Opening…' : 'Lock in and open the reveal'}
            </CtaButton>
          </>
        ) : (
          <CtaButton
            onClick={() => {
              setLateScores(
                Object.fromEntries(
                  [
                    // your categories at the midpoint; drafted extras ride along
                    ...sealedSplit.core.map((e) => [
                      e.key,
                      typeof myDraft?.scores[e.key] === 'number' ? myDraft.scores[e.key] : 5,
                    ]),
                    ...sealedSplit.extras
                      .filter((e) => typeof myDraft?.scores[e.key] === 'number')
                      .map((e) => [e.key, myDraft!.scores[e.key]]),
                  ],
                ),
              )
              setLateLine(myDraft?.oneLiner ?? '')
              setLateOpen(true)
            }}
            className="mt-4 w-full py-3 text-[13px]"
          >
            Add your scores
          </CtaButton>
        )}
        {actionError && (
          <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
            {actionError}
          </p>
        )}
      </section>
    )
  }

  // The session's snapshot is the rubric of record for this reveal.
  const rubric = session.rubric ?? []
  const weights = weightsFromRubric(rubric)
  const categoryKeys = rubric.map((e) => e.key)
  const labelFor = (key: string) => rubric.find((e) => e.key === key)?.label ?? key
  const lateSplit = splitRubricForMember(rubric, myLateRows, isCasual)

  // The reveal stays open: a member with no locked card can add scores, and a
  // locked member fills in categories the rubric gained since (snapshot keys
  // they lack, plus enabled categories from the group's CURRENT mashed rubric).
  const myCard = locked.find((s) => s.memberId === userId)
  const effectiveNow = mashRubrics(memberRubrics)
  const labelForAny = (key: string) =>
    rubric.find((e) => e.key === key)?.label ??
    effectiveNow.find((r) => r.key === key)?.label ??
    catalogCategory(key)?.label ??
    key
  // Only nag about categories YOU carry: a deliberately skipped extra is a
  // choice, not a gap. (No personal rubric yet -> fall back to everything.)
  const myKeys = new Set(
    (myLateRows ?? []).filter((r) => r.enabled).map((r) => r.key),
  )
  const missingKeys = myCard
    ? [...new Set([...categoryKeys, ...effectiveNow.map((r) => r.key)])].filter(
        (k) =>
          (myKeys.size === 0 || myKeys.has(k)) && typeof myCard.scores[k] !== 'number',
      )
    : []

  const result = analyze(categoryKeys, scorecards, weights)
  const youWeighted = result.perMember.find((m) => m.memberId === userId)?.weighted ?? null
  const delta =
    youWeighted !== null && result.mashed !== null ? youWeighted - result.mashed : null
  const weightTotal = rubric.reduce((sum, e) => sum + e.weight, 0)
  const leaderboard = [...result.perMember]
    .filter((m) => m.locked)
    .sort((a, b) => b.weighted - a.weighted)

  // "In one sentence" quotes, leaderboard order. Only members who wrote one.
  const oneLiners = leaderboard.flatMap((m) => {
    const line = locked.find((s) => s.memberId === m.memberId)?.oneLiner
    return line ? [{ memberId: m.memberId, line }] : []
  })

  const categories = rubric
    .map((entry) => {
      const stat = categoryStat(entry.key, locked)
      return {
        id: entry.key,
        label: entry.label,
        weightPct: weightTotal > 0 ? Math.round((entry.weight / weightTotal) * 100) : 0,
        mean: stat?.mean ?? 0,
        min: stat?.min ?? 0,
        max: stat?.max ?? 0,
        dots: locked
          .filter((s) => typeof s.scores[entry.key] === 'number')
          .map((s) => ({ memberId: s.memberId, score: s.scores[entry.key] })),
      }
    })
    // an extra everybody skipped has no scores to plot
    .filter((c) => c.dots.length > 0)

  const aligned = result.mostUnited
  const clash = result.mostContested
  const outlier = result.outlier

  return (
    <>
      {/* ---- Hero: title + Mashed ring + member leaderboard ---- */}
      <section className="mp-rise mp-card rounded-[26px] p-6">
        <button
          type="button"
          disabled={session.titleTmdbId === null || !onOpenTitle}
          onClick={() =>
            session.titleTmdbId !== null &&
            onOpenTitle?.(session.titleTmdbId, session.mediaType)
          }
          className="group -mx-2 flex w-full items-start gap-4 rounded-2xl px-2 py-1 text-left transition-colors active:bg-surface-2 disabled:cursor-default disabled:active:bg-transparent"
        >
          <div
            aria-hidden
            className="relative grid h-[84px] w-14 shrink-0 place-items-center overflow-hidden rounded-xl font-display text-2xl font-semibold text-bg transition-transform group-active:scale-95"
            style={{ backgroundImage: 'linear-gradient(160deg, #E7B24E, #E07A5F)' }}
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
                {session.mediaType === 'movie' ? 'Film' : 'TV'}
                {session.titleYear ? ` ${session.titleYear}` : ''}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-teal">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                Revealed
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-[27px] font-semibold leading-[1.05] transition-colors group-hover:text-teal">
              {session.titleName}
            </h2>
          </div>
        </button>

        <div className="mt-6 flex items-center gap-4">
          <ScoreRing value={result.mashed} size={150} stroke={11} />
          <ul className="flex min-w-0 flex-1 flex-col gap-1">
            {leaderboard.map((m) => {
              const isYou = m.memberId === userId
              return (
                <li
                  key={m.memberId}
                  className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                    isYou ? 'bg-gold/10' : ''
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForMember(members, m.memberId) }}
                    />
                    <span
                      className={`truncate text-[13px] ${isYou ? 'font-semibold text-gold' : ''}`}
                    >
                      {memberName(m.memberId)}
                    </span>
                  </span>
                  <span
                    className={`tabular font-mono text-[13px] ${
                      isYou ? 'font-semibold text-gold' : 'text-muted'
                    }`}
                  >
                    {formatScore(m.weighted)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <p className="mt-3 text-center text-[12px] leading-snug text-muted">
          <span className="font-semibold text-teal">Mashed</span> is your group's weighted
          average: everyone's locked scores, combined.
        </p>

        <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-4 font-mono text-[10px] uppercase tracking-[0.14em]">
          <span className="text-muted">
            Spread <span className="text-text">{formatScore(result.spread)}</span>
          </span>
          <span className="text-gold">
            You{' '}
            {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${formatScore(Math.abs(delta))}`} vs
            group
          </span>
          <span className="text-muted">
            <span className="text-text">
              {result.lockedCount}/{result.totalCount}
            </span>{' '}
            locked
          </span>
        </div>
      </section>

      {/* ---- the reveal stays open: score it late ---- */}
      {!myCard && (
        <section className="mp-rise mp-card mt-4 rounded-[26px] p-5">
          <p className="text-[14px] font-semibold leading-snug">
            You haven't scored this one
          </p>
          <p className="mt-1 text-[13px] leading-snug text-muted">
            The Mashed is the score so far. Add yours anytime and it recomputes with you
            in it.
          </p>
          {lateOpen ? (
            <>
              <div className="mt-2">
                {[
                  ...lateSplit.core,
                  ...lateSplit.extras.filter((e) => lateScores[e.key] !== undefined),
                ].map((entry) => (
                  <ScoreSliderRow
                    key={entry.key}
                    className="border-t border-line/40 py-3"
                    label={entry.label}
                    value={lateScores[entry.key] ?? 5}
                    disabled={lateBusy}
                    onChange={(v) => setLateScores((prev) => ({ ...prev, [entry.key]: v }))}
                  />
                ))}
              </div>
              <ExtraCategoryChips
                extras={lateSplit.extras}
                isOn={(key) => lateScores[key] !== undefined}
                disabled={lateBusy}
                onToggle={toggleLateExtra}
                className="mt-3"
              />
              <input
                type="text"
                maxLength={140}
                value={lateLine}
                disabled={lateBusy}
                onChange={(e) => setLateLine(e.target.value)}
                placeholder="In one sentence, what was it about? (optional)"
                className={`${fieldClassSm} mt-2 w-full disabled:opacity-60`}
              />
              <CtaButton
                tone="teal"
                disabled={lateBusy || Object.keys(lateScores).length === 0}
                onClick={() => void handleLateScore(session.id)}
                className="mt-2 w-full py-2.5 text-[13px]"
              >
                {lateBusy ? 'Adding…' : 'Fold my scores into the Mashed'}
              </CtaButton>
            </>
          ) : (
            <CtaButton
              onClick={() => {
                setLateScores(
                  Object.fromEntries([
                    ...lateSplit.core.map((e) => [
                      e.key,
                      typeof myDraft?.scores[e.key] === 'number' ? myDraft.scores[e.key] : 5,
                    ]),
                    ...lateSplit.extras
                      .filter((e) => typeof myDraft?.scores[e.key] === 'number')
                      .map((e) => [e.key, myDraft!.scores[e.key]]),
                  ]),
                )
                setLateLine(myDraft?.oneLiner ?? '')
                setLateOpen(true)
              }}
              className="mt-3 w-full py-2.5 text-[13px]"
            >
              Add your scores
            </CtaButton>
          )}
          {actionError && (
            <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
              {actionError}
            </p>
          )}
        </section>
      )}

      {/* ---- the rubric grew: fill in just the gap ---- */}
      {myCard && missingKeys.length > 0 && (
        <section className="mp-rise mp-card mt-4 rounded-[26px] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-teal">
            The rubric grew
          </p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">
            New categor{missingKeys.length === 1 ? 'y' : 'ies'} since this reveal. Add your
            take and the Mashed updates; scores already locked never change.
          </p>
          {missingKeys.map((key) => {
            return (
              <div key={key} className="mt-3 border-t border-line/40 pt-3">
                <ScoreSliderRow
                  label={labelForAny(key)}
                  value={backfillValues[key] ?? 5}
                  disabled={backfillBusy !== null}
                  onChange={(v) => setBackfillValues((prev) => ({ ...prev, [key]: v }))}
                />
                <button
                  type="button"
                  disabled={backfillBusy !== null}
                  onClick={() => void handleBackfill(session.id, key)}
                  className="mt-1.5 w-full rounded-full border border-teal/40 bg-teal/10 py-2 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
                >
                  {backfillBusy === key ? 'Saving…' : `Add my ${labelForAny(key)} score`}
                </button>
              </div>
            )
          })}
          {actionError && (
            <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
              {actionError}
            </p>
          )}
        </section>
      )}

      {/* ---- The Reveal: disagreement as a headline (the moat) ---- */}
      {aligned && clash && (
        <section className="mp-rise mt-8 px-1" style={{ animationDelay: '80ms' }}>
          <div
            aria-hidden
            className="mb-5 h-px w-full"
            style={{
              background:
                'linear-gradient(90deg, color-mix(in oklab, var(--color-teal) 45%, transparent), var(--color-line) 40%, transparent)',
            }}
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal">
            The Reveal
          </p>
          <h3 className="mt-2.5 font-display text-[27px] font-medium leading-[1.22]">
            {/* Bricolage carries no italic (faux-oblique only); the stress
                comes from color + a true weight step instead. */}
            {aligned.category === clash.category ? (
              // One category winning BOTH crowns means every shared category
              // tied on range (common in two-member groups): naming a united
              // and a split category would be a lie, so name the sweep.
              clash.range === 0 ? (
                <>
                  Same wavelength, <span className="font-semibold text-teal">every category</span>.
                </>
              ) : (
                <>
                  Split by {clash.range},{' '}
                  <span className="font-semibold text-coral">every category</span>.
                </>
              )
            ) : (
              <>
                United on{' '}
                <span className="font-semibold text-teal">{labelFor(aligned.category)}</span>.
                Split over{' '}
                <span className="font-semibold text-coral">{labelFor(clash.category)}</span>.
              </>
            )}
          </h3>
          <p className="mt-2 font-mono text-[11px] text-muted">
            {aligned.category === clash.category
              ? `every category, range ${clash.range}`
              : `agreement range ${aligned.range}, clash range ${clash.range}`}
          </p>
          {/* the debrief: the reveal is the trigger, the thread is the room */}
          {onDiscuss && session.titleTmdbId !== null && (
            <button
              type="button"
              onClick={() =>
                onDiscuss(
                  session.titleTmdbId!,
                  session.mediaType,
                  discussSeedFor(clash.category, labelFor(clash.category)),
                )
              }
              className="mt-3.5 flex items-center gap-2 rounded-full border border-teal/40 bg-teal/10 px-4 py-2 text-[13px] font-semibold text-teal transition-colors hover:bg-teal/20"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.9 8.9 0 0 1-3.2-.6L3 21l1.9-5.6a8 8 0 0 1-1.4-4A8.4 8.4 0 0 1 12 3.2a8.4 8.4 0 0 1 9 8.3Z" />
              </svg>
              Talk it out
            </button>
          )}
          {outlier && (
            <div className="mt-4 flex items-center gap-2.5">
              <Avatar
                avatarKey={members.find((m) => m.userId === outlier.memberId)?.avatarKey}
                displayName={memberName(outlier.memberId)}
                color={colorForMember(members, outlier.memberId)}
                size={28}
              />
              <p className="text-[13px] leading-snug text-muted">
                <span className="font-semibold text-text">{memberName(outlier.memberId)}</span>{' '}
                broke away, scoring {labelFor(outlier.category)}{' '}
                <span className="tabular font-mono text-gold">{outlier.score}</span> against the
                group's <span className="tabular font-mono">{formatScore(outlier.mean)}</span>
              </p>
            </div>
          )}
        </section>
      )}

      {/* ---- In one sentence: everyone's blind takeaway, dropped together.
           Two 8s can hide opposite readings; this is where that shows. ---- */}
      {oneLiners.length > 0 && (
        <section className="mp-rise mt-7" style={{ animationDelay: '120ms' }}>
          <div className="mb-3 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              In one sentence
            </p>
          </div>
          <div className="mp-card rounded-[26px] px-5 py-2">
            {oneLiners.map((q, i) => (
              <div
                key={q.memberId}
                className={`flex items-start gap-3 py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}
              >
                <Avatar
                  avatarKey={members.find((m) => m.userId === q.memberId)?.avatarKey}
                  displayName={memberName(q.memberId)}
                  color={colorForMember(members, q.memberId)}
                  size={28}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {memberName(q.memberId)}
                  </p>
                  <p className="mt-0.5 text-[14px] leading-snug">&ldquo;{q.line}&rdquo;</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- how the math works (staged walkthrough) ---- */}
      <MashMath
        rubric={rubric}
        scorecards={locked}
        userId={userId}
        memberName={memberName}
        mashed={result.mashed}
      />

      {/* ---- Category dot plot: every member's score, per category ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '160ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Category breakdown
          </p>
          <p className="font-mono text-[10px] text-muted">1 – 10</p>
        </div>
        <div className="mp-card rounded-[26px] px-4 pb-1 pt-1">
          <ul>
            {categories.map((c, i) => (
              <li
                key={c.id}
                className={`flex items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}
              >
                <div className="w-[96px] shrink-0">
                  <p className="text-[13px] font-medium leading-tight">{c.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted">
                    weight {c.weightPct}%
                    {c.dots.length < locked.length ? ` (${c.dots.length}/${locked.length})` : ''}
                  </p>
                </div>
                <div className="relative h-5 flex-1">
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line/50" />
                  <span
                    className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-line/80"
                    style={{ left: `${pct(c.min)}%`, width: `${pct(c.max) - pct(c.min)}%` }}
                  />
                  {c.dots.map((d) => (
                    <span
                      key={d.memberId}
                      title={memberName(d.memberId)}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                        d.memberId === userId
                          ? 'h-[9px] w-[9px] ring-1 ring-text/70'
                          : 'h-[7px] w-[7px]'
                      }`}
                      style={{
                        left: `${pct(d.score)}%`,
                        backgroundColor: colorForMember(members, d.memberId),
                      }}
                    />
                  ))}
                  <span
                    className="absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal"
                    style={{ left: `${pct(c.mean)}%` }}
                  />
                </div>
                <span
                  className="tabular w-8 shrink-0 text-right font-mono text-[13px] font-semibold"
                  style={{ color: scoreColor(c.mean) }}
                >
                  {c.mean.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
          {/* who's which color: every locked member, leaderboard order */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line/50 px-1 pb-3 pt-3 font-mono text-[10px] text-muted">
            {leaderboard.map((m) => (
              <span key={m.memberId} className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                    m.memberId === userId ? 'ring-1 ring-text/70' : ''
                  }`}
                  style={{ backgroundColor: colorForMember(members, m.memberId) }}
                />
                <span className="truncate">{memberName(m.memberId)}</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-[3px] rounded-full bg-teal" /> group mean
            </span>
          </div>
        </div>
      </section>

      {/* ---- Next round ---- */}
      <section className="mp-rise mt-6 text-center" style={{ animationDelay: '220ms' }}>
        {/* Re-rating replaces this reveal with a fresh blind card for
            EVERYONE, so it asks first — the same operation already names its
            cost before the CTA in GroupInviteSheet. */}
        {confirmRerate ? (
          <div className="mx-auto max-w-[360px] rounded-2xl border border-gold/40 bg-gold/5 p-4 text-left">
            <p className="text-[13px] font-semibold leading-snug text-gold">
              Score {session.titleName} again?
            </p>
            <p className="mt-1.5 text-[12px] leading-snug text-muted">
              Everyone gets a fresh blind card and this reveal moves into the
              log as an earlier round.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmRerate(false)}
                className="flex-1 rounded-full border border-line py-2 text-[12px] font-semibold text-muted transition-colors hover:text-text"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => void handleRerate(session)}
                disabled={rerateBusy}
                className="flex-1 rounded-full border border-gold/50 bg-gold/10 py-2 text-[12px] font-semibold text-gold disabled:opacity-50"
              >
                {rerateBusy ? 'Starting…' : 'Start it'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmRerate(true)}
              disabled={rerateBusy}
              className="rounded-full border border-line px-5 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2 disabled:opacity-50"
            >
              Rate it again
            </button>
            <button
              type="button"
              onClick={onStartNext}
              className="rounded-full border border-line px-5 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2"
            >
              Start the next round →
            </button>
          </div>
        )}
        {rerateError ? (
          <p role="alert" className="mt-2 text-[12px] leading-snug text-coral">
            {rerateError}
          </p>
        ) : (
          <p className="mt-2 font-mono text-[10px] text-muted">
            Rate it again runs a fresh blind round. This night stays in the log.
          </p>
        )}
      </section>
    </>
  )
}
