import { useCallback, useEffect, useState } from 'react'
import { analyze, categoryStat, formatScore } from '../lib/scoring'
import type { MemberScorecard } from '../lib/scoring'
import { scoreColor } from '../lib/scoreColor'
import { weightsFromRubric } from '../lib/mapping'
import {
  fetchAllScorecards,
  fetchLatestSession,
  fetchLockStatus,
  fetchSessionRsvps,
  onSessionChange,
  posterUrl,
} from '../lib/api'
import type { GroupInfo, MemberInfo, SessionInfo } from '../lib/api'
import { participation } from '../lib/rsvp'
import { colorForMember } from '../lib/palette'
import { ScoreRing } from './ScoreRing'
import { MashMath } from './MashMath'

interface SessionPanelProps {
  group: GroupInfo
  members: MemberInfo[]
  userId: string
  /** Jump to the Rate tab to score / start a round. */
  onGoRate: () => void
}

// The group's latest session, live: blind rounds show invite + lock progress,
// and the moment the reveal fires (realtime) the full Mashed layout drops in.
// Lives on the GROUP tab — Home is the cross-group dashboard.

/** Position of a 1..10 score along the plot track, as a percentage. */
const pct = (score: number) => ((score - 1) / 9) * 100

export function SessionPanel({ group, members, userId, onGoRate }: SessionPanelProps) {
  const [session, setSession] = useState<SessionInfo | null | undefined>(undefined)
  const [scorecards, setScorecards] = useState<MemberScorecard[]>([])
  const [lockStatus, setLockStatus] = useState<{ memberId: string; locked: boolean }[]>([])
  const [rsvps, setRsvps] = useState<{ memberId: string; status: 'in' | 'pass' }[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const s = await fetchLatestSession(group.id)
      setSession(s)
      if (!s) return
      if (s.state === 'revealed') {
        setScorecards(await fetchAllScorecards(s.id))
      } else {
        const [locks, answers] = await Promise.all([
          fetchLockStatus(s.id),
          fetchSessionRsvps(s.id).catch(() => []),
        ])
        setLockStatus(locks)
        setRsvps(answers)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }, [group.id])

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
    return (
      <p role="alert" className="mp-rise py-6 text-center text-[13px] text-coral">
        {error}
      </p>
    )
  }

  if (session === undefined) {
    return <p className="mp-rise py-6 text-center text-[13px] text-muted">Loading…</p>
  }

  // ---- no sessions yet ----------------------------------------------------
  if (session === null) {
    return (
      <section className="mp-rise mp-card rounded-[26px] p-6 text-center">
        <p className="text-[14px] font-semibold">No rounds yet</p>
        <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] leading-snug text-muted">
          Pick a film or show and invite {group.name} — everyone scores blind, then the
          Reveal drops it all at once.
        </p>
        <button
          type="button"
          onClick={onGoRate}
          className="mt-4 w-full rounded-full py-3 text-[13px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-[0.98]"
          style={{ backgroundImage: 'linear-gradient(180deg, #F2CD77, #DFA338)' }}
        >
          Pick a movie
        </button>
      </section>
    )
  }

  // ---- blind round in progress ---------------------------------------------
  if (session.state === 'blind') {
    const lockedIds = new Set(lockStatus.filter((l) => l.locked).map((l) => l.memberId))
    const iAmIn = lockedIds.has(userId)
    const part = participation({
      memberIds: members.map((m) => m.userId),
      rsvps,
      scoredMemberIds: lockStatus.map((l) => l.memberId),
      sessionCreatedAt: session.createdAt,
    })
    const showRsvps = members.length > 1
    return (
      <section className="mp-rise mp-card rounded-[26px] p-6">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            Round in progress
          </p>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-gold">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Blind
          </span>
        </div>
        <h2 className="mt-2 font-display text-[27px] font-semibold leading-[1.05]">
          {session.titleName}
        </h2>
        <p className="mt-1 font-mono text-xs text-muted">
          {session.mediaType === 'movie' ? 'Film' : 'TV'}
          {session.titleYear ? ` · ${session.titleYear}` : ''}
        </p>

        <div className="mt-6 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3.5">
          <div className="flex -space-x-1.5">
            {members.map((m) => (
              <span
                key={m.userId}
                title={m.displayName}
                className={`grid h-7 w-7 place-items-center rounded-full border-2 border-surface font-mono text-[10px] font-bold ${
                  lockedIds.has(m.userId) ? 'text-bg' : 'text-muted'
                }`}
                style={{
                  backgroundColor: lockedIds.has(m.userId)
                    ? colorForMember(members, m.userId)
                    : 'var(--color-surface)',
                }}
              >
                {m.displayName.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
          <p className="tabular font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {lockedIds.size}/{showRsvps ? part.inIds.length : members.length} locked
          </p>
        </div>

        {showRsvps && (
          <p className="mt-2.5 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {part.inIds.length} in
            {part.passedIds.length > 0 ? ` · ${part.passedIds.length} passed` : ''}
            {part.invitedIds.length > 0 ? ` · ${part.invitedIds.length} invited` : ''}
          </p>
        )}

        <p className="mt-4 text-[13px] leading-snug text-muted">
          Ratings stay hidden until the reveal.
        </p>
        {!iAmIn && (
          <button
            type="button"
            onClick={onGoRate}
            className="mt-4 w-full rounded-full py-3.5 text-[14px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-[0.98]"
            style={{ backgroundImage: 'linear-gradient(180deg, #F2CD77, #DFA338)' }}
          >
            Score it now
          </button>
        )}
      </section>
    )
  }

  // ---- revealed: the Mashed result -----------------------------------------
  const locked = scorecards.filter((s) => s.locked)
  if (locked.length === 0) {
    return <p className="mp-rise py-6 text-center text-[13px] text-muted">Loading…</p>
  }

  // The session's snapshot is the rubric of record for this reveal.
  const rubric = session.rubric ?? []
  const weights = weightsFromRubric(rubric)
  const categoryKeys = rubric.map((e) => e.key)
  const labelFor = (key: string) => rubric.find((e) => e.key === key)?.label ?? key

  const result = analyze(categoryKeys, scorecards, weights)
  const youWeighted = result.perMember.find((m) => m.memberId === userId)?.weighted ?? null
  const delta =
    youWeighted !== null && result.mashed !== null ? youWeighted - result.mashed : null
  const weightTotal = rubric.reduce((sum, e) => sum + e.weight, 0)
  const leaderboard = [...result.perMember]
    .filter((m) => m.locked)
    .sort((a, b) => b.weighted - a.weighted)

  const categories = rubric.map((entry) => {
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

  const aligned = result.mostUnited
  const clash = result.mostContested
  const outlier = result.outlier

  return (
    <>
      {/* ---- Hero: title + Mashed ring + member leaderboard ---- */}
      <section className="mp-rise mp-card rounded-[26px] p-6">
        <div className="flex items-start gap-4">
          <div
            aria-hidden
            className="relative grid h-[84px] w-14 shrink-0 place-items-center overflow-hidden rounded-xl font-display text-2xl font-semibold text-bg"
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
                {session.titleYear ? ` · ${session.titleYear}` : ''}
              </p>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-teal">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                Revealed
              </span>
            </div>
            <h2 className="mt-1.5 font-display text-[27px] font-semibold leading-[1.05]">
              {session.titleName}
            </h2>
          </div>
        </div>

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

        <p className="mt-3 text-center text-[11px] leading-snug text-muted">
          <span className="font-semibold text-teal">Mashed</span> is your group's weighted
          average — everyone's locked scores, combined.
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
            United on{' '}
            <span className="italic text-teal">{labelFor(aligned.category)}</span> — split
            over <span className="italic text-coral">{labelFor(clash.category)}</span>.
          </h3>
          <p className="mt-2 font-mono text-[11px] text-muted">
            agreement range {aligned.range} · clash range {clash.range}
          </p>
          {outlier && (
            <div className="mt-4 flex items-center gap-2.5">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-bg"
                style={{ backgroundColor: colorForMember(members, outlier.memberId) }}
              >
                {memberName(outlier.memberId).charAt(0).toUpperCase()}
              </span>
              <p className="text-[13px] leading-snug text-muted">
                <span className="font-semibold text-text">{memberName(outlier.memberId)}</span>{' '}
                broke away — scored {labelFor(outlier.category)}{' '}
                <span className="tabular font-mono text-gold">{outlier.score}</span> against the
                group's <span className="tabular font-mono">{formatScore(outlier.mean)}</span>
              </p>
            </div>
          )}
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
                  <p className="mt-0.5 font-mono text-[10px] text-muted">weight {c.weightPct}%</p>
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
                      className={`absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full ${
                        d.memberId === userId ? 'bg-gold' : 'bg-muted'
                      }`}
                      style={{ left: `${pct(d.score)}%` }}
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
          <div className="flex items-center gap-4 border-t border-line/50 px-1 pb-3 pt-3 font-mono text-[10px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-gold" /> you
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[7px] w-[7px] rounded-full bg-muted" /> others
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-[3px] rounded-full bg-teal" /> group mean
            </span>
          </div>
        </div>
      </section>

      {/* ---- Next round ---- */}
      <section className="mp-rise mt-6 text-center" style={{ animationDelay: '220ms' }}>
        <button
          type="button"
          onClick={onGoRate}
          className="rounded-full border border-line px-5 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text"
        >
          Start the next round →
        </button>
      </section>
    </>
  )
}
