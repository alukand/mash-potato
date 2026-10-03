import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  castRoundVote,
  fetchRoundGames,
  fetchTermsAccepted,
  reportRoundPost,
  saveFightArgument,
  saveRoundTake,
} from '../lib/api'
import type { MemberInfo } from '../lib/api'
import {
  ARGUMENT_MAX,
  TAKE_MAX,
  fightVerdict,
  gamesInPlay,
  myCorner,
  opponentCorner,
  untilLabel,
} from '../lib/roundGames'
import type { FightSide, RoundFight, RoundGames as Games, RoundTake, RoundTakes, TakesMode } from '../lib/roundGames'
import { colorForMember } from '../lib/palette'
import { scoreColor } from '../lib/scoreColor'
import { Avatar } from './avatars'
import { CtaButton, fieldClass } from './ui'
import { HouseRulesSheet } from './HouseRulesSheet'

// The round's games, on its Reveal (20261003120000): the fight over the
// biggest split, then the best take. What shows is what round_game_state
// returns for THIS viewer; the server decides every seal, every window and
// every result, so nothing here infers one.

interface RoundGamesProps {
  sessionId: string
  members: MemberInfo[]
  userId: string
  /** Bumps whenever the panel reloads, so a realtime ping refreshes the games. */
  refreshKey: number
  /** A game just closed: the trophy shelf has news. */
  onSettled?: () => void
}

/** Server messages are lowercase phrases; show them as sentences. */
const sentence = (message: string) => {
  const m = message.trim()
  if (m === '') return m
  return m.charAt(0).toUpperCase() + m.slice(1) + (/[.!?]$/.test(m) ? '' : '.')
}

const errorText = (err: unknown, fallback: string) =>
  sentence(err instanceof Error ? err.message : fallback)

export function RoundGames({ sessionId, members, userId, refreshKey, onSettled }: RoundGamesProps) {
  const [games, setGames] = useState<Games | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [termsAccepted, setTermsAccepted] = useState<boolean | null>(null)
  // The post waiting behind the house rules, run once they are agreed.
  const [pendingPost, setPendingPost] = useState<(() => void) | null>(null)
  const settledRef = useRef(onSettled)
  const wasInPlay = useRef<boolean | null>(null)
  useEffect(() => {
    settledRef.current = onSettled
  }, [onSettled])

  const load = useCallback(async () => {
    try {
      const g = await fetchRoundGames(sessionId)
      setGames(g)
      setError(null)
      const inPlay = gamesInPlay(g)
      if (wasInPlay.current === true && !inPlay) settledRef.current?.()
      wasInPlay.current = inPlay
    } catch (err) {
      setError(errorText(err, 'The games could not load'))
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useEffect(() => {
    let stale = false
    fetchTermsAccepted(userId)
      .then((ok) => !stale && setTermsAccepted(ok))
      .catch(() => !stale && setTermsAccepted(null))
    return () => {
      stale = true
    }
  }, [userId])

  // The clocks tick, and a game in play refreshes: votes and arguments land
  // without a reload. Realtime pings cover the big moments; this covers the
  // "3 of 5 voted" in between.
  const inPlay = gamesInPlay(games)
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now())
      if (inPlay && document.visibilityState === 'visible') void load()
    }, 30_000)
    return () => clearInterval(id)
  }, [inPlay, load])

  const nameFor = (id: string) =>
    id === userId ? 'You' : (members.find((m) => m.userId === id)?.displayName ?? 'A former member')

  /** Run a post now, or after the house rules if they were never agreed. */
  const withTerms = (post: () => void) => {
    if (termsAccepted === false) setPendingPost(() => post)
    else post()
  }

  if (error && !games) {
    return (
      <p role="alert" className="mt-6 px-1 text-[13px] leading-snug text-coral">
        {error}{' '}
        <button type="button" onClick={() => void load()} className="font-semibold underline">
          Try again
        </button>
      </p>
    )
  }
  if (!games || games.sealed || (!games.fight && !games.takes)) return null

  return (
    <>
      {games.fight && (
        <FightCard
          key={`fight:${sessionId}`}
          fight={games.fight}
          sessionId={sessionId}
          members={members}
          userId={userId}
          now={now}
          nameFor={nameFor}
          onChanged={load}
          withTerms={withTerms}
        />
      )}
      {games.takes && (
        <TakesSection
          key={`takes:${sessionId}`}
          takes={games.takes}
          takesMode={games.takesMode}
          sessionId={sessionId}
          members={members}
          now={now}
          nameFor={nameFor}
          onChanged={load}
          withTerms={withTerms}
        />
      )}
      {pendingPost && (
        <HouseRulesSheet
          onAgreed={() => {
            setTermsAccepted(true)
            const post = pendingPost
            setPendingPost(null)
            post()
          }}
          onClose={() => setPendingPost(null)}
        />
      )}
    </>
  )
}

// ---- shared pieces ---------------------------------------------------------------

function SectionHeader({ label, tone, aside }: { label: string; tone: string; aside: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
      <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${tone}`}>{label}</p>
      <p className="shrink-0 font-mono text-[10px] text-muted">{aside}</p>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** Report with an inline confirm, the house pattern for anything consequential. */
function ReportButton({ postId, what }: { postId: string; what: string }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'busy' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  async function report() {
    setState('busy')
    setError(null)
    try {
      await reportRoundPost(postId, null)
      setState('done')
    } catch (err) {
      setError(errorText(err, 'Could not report that'))
      setState('confirm')
    }
  }
  if (state === 'done') {
    return <p className="mt-2 font-mono text-[10px] text-muted">Reported. Thanks for flagging it.</p>
  }
  if (state === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setState('confirm')}
        className="mt-1 min-h-9 rounded-full px-1 text-[11px] font-semibold text-muted transition-colors hover:text-coral"
      >
        Report
      </button>
    )
  }
  return (
    <div className="mt-2 rounded-2xl border border-coral/30 bg-coral/5 p-3">
      <p className="text-[12px] leading-snug text-muted">
        Report this {what}? Three reports hide it until a moderator looks.
      </p>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px] leading-snug text-coral">
          {error}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setState('idle')}
          className="min-h-9 flex-1 rounded-full border border-line text-[12px] font-semibold text-muted transition-colors hover:text-text"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={state === 'busy'}
          onClick={() => void report()}
          className="min-h-9 flex-1 rounded-full bg-coral/90 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {state === 'busy' ? 'Reporting…' : 'Report'}
        </button>
      </div>
    </div>
  )
}

function Composer({
  id,
  label,
  value,
  max,
  placeholder,
  busy,
  error,
  cta,
  onChange,
  onSubmit,
  onCancel,
  note,
}: {
  id: string
  label: string
  value: string
  max: number
  placeholder: string
  busy: boolean
  error: string | null
  cta: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
  note?: ReactNode
}) {
  return (
    <div className="mt-4">
      <label htmlFor={id} className="mb-1.5 block px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={max}
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${fieldClass} resize-none leading-snug disabled:opacity-60`}
      />
      <div className="mt-1 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0 text-[12px] leading-snug text-muted">{note}</div>
        <span className="tabular shrink-0 font-mono text-[10px] text-muted">
          {value.length}/{max}
        </span>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 px-1 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 flex-1 rounded-full border border-line text-[13px] font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
          >
            Cancel
          </button>
        )}
        <CtaButton
          onClick={onSubmit}
          disabled={busy || value.trim().length === 0}
          className="min-h-11 flex-1 px-4 text-[13px]"
        >
          {cta}
        </CtaButton>
      </div>
    </div>
  )
}

// ---- the fight ------------------------------------------------------------------

function FightCard({
  fight,
  sessionId,
  members,
  userId,
  now,
  nameFor,
  onChanged,
  withTerms,
}: {
  fight: RoundFight
  sessionId: string
  members: MemberInfo[]
  userId: string
  now: number
  nameFor: (id: string) => string
  onChanged: () => Promise<void>
  withTerms: (post: () => void) => void
}) {
  const mine = myCorner(fight)
  const theirs = opponentCorner(fight)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function post() {
    setBusy(true)
    setActionError(null)
    try {
      await saveFightArgument(sessionId, draft)
      setEditing(false)
      await onChanged()
    } catch (err) {
      setActionError(errorText(err, 'Could not post your argument'))
    } finally {
      setBusy(false)
    }
  }

  async function vote(choice: string | null) {
    setBusy(true)
    setActionError(null)
    try {
      await castRoundVote(sessionId, 'fight', choice)
      await onChanged()
    } catch (err) {
      setActionError(errorText(err, 'Could not save your vote'))
    } finally {
      setBusy(false)
    }
  }

  const name = (id: string) => nameFor(id)
  const isWinner = (side: FightSide) => fight.outcome === 'win' && fight.winnerId === side.memberId

  const corner = (side: FightSide, flip: boolean) => {
    const member = members.find((m) => m.userId === side.memberId)
    return (
      <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${flip ? 'flex-row-reverse text-right' : ''}`}>
        <Avatar
          avatarKey={member?.avatarKey}
          displayName={member?.displayName ?? name(side.memberId)}
          color={colorForMember(members, side.memberId)}
          size={38}
        />
        <div className="min-w-0">
          <p className={`truncate text-[13px] font-semibold ${side.memberId === userId ? 'text-gold' : ''}`}>
            {name(side.memberId)}
          </p>
          <p className="tabular font-display text-[28px] font-semibold leading-none" style={{ color: scoreColor(side.score) }}>
            {side.score}
          </p>
        </div>
      </div>
    )
  }

  const argumentBlock = (side: FightSide) => {
    const who = name(side.memberId)
    if (side.argument !== null) {
      return (
        <figure key={side.memberId} className="border-l-2 pl-3" style={{ borderColor: colorForMember(members, side.memberId) }}>
          <figcaption className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            {who}
            {isWinner(side) && (
              <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-semibold text-gold">
                Won the fight
              </span>
            )}
            {side.votes !== null && (
              <span className="tabular">
                {side.votes} {side.votes === 1 ? 'vote' : 'votes'}
              </span>
            )}
          </figcaption>
          <blockquote className="mt-1 whitespace-pre-line text-[14px] leading-snug">&ldquo;{side.argument}&rdquo;</blockquote>
          {side.memberId !== userId && side.postId && fight.phase !== 'arguing' && (
            <ReportButton postId={side.postId} what="argument" />
          )}
        </figure>
      )
    }
    if (side.hidden) {
      return (
        <p key={side.memberId} className="text-[13px] leading-snug text-muted">
          {who === 'You' ? 'Your' : `${who}'s`} argument is hidden.
        </p>
      )
    }
    if (side.argued) {
      return (
        <p key={side.memberId} className="text-[13px] leading-snug text-muted">
          {who} made a case. It drops when both are in.
        </p>
      )
    }
    return (
      <p key={side.memberId} className="text-[13px] leading-snug text-muted">
        {who === 'You' ? "You haven't" : `${who} hasn't`} made a case{fight.phase === 'closed' ? '.' : ' yet.'}
      </p>
    )
  }

  const phaseChip =
    fight.phase === 'arguing' ? 'Arguing' : fight.phase === 'judging' ? 'Judging' : 'Decided'
  const due = untilLabel(fight.argumentsDue, now)
  const bell = fight.closesAt ? untilLabel(fight.closesAt, now) : null

  let body: ReactNode
  if (fight.phase === 'arguing' && mine && theirs) {
    const composing = !mine.argued || editing
    body = composing ? (
      <Composer
        id={`fight-${sessionId}`}
        label="Your argument"
        value={draft}
        max={ARGUMENT_MAX}
        placeholder={`Why a ${mine.score} for ${fight.categoryLabel}? One shot, so make it count.`}
        busy={busy}
        error={actionError}
        cta={busy ? 'Posting…' : mine.argued ? 'Save my argument' : 'Make my case'}
        onChange={setDraft}
        onSubmit={() => withTerms(() => void post())}
        onCancel={editing ? () => setEditing(false) : undefined}
        note={
          theirs.argued
            ? `${name(theirs.memberId)} has made theirs. Yours drops both and opens the judging. Arguments close in ${due}.`
            : `Sealed until ${name(theirs.memberId)} makes theirs. Arguments close in ${due}.`
        }
      />
    ) : (
      <>
        <div className="mt-4">{argumentBlock(mine)}</div>
        <p className="mt-3 text-[13px] leading-snug text-muted">
          Sealed until {name(theirs.memberId)} answers. You can still edit yours until then.
        </p>
        <button
          type="button"
          onClick={() => {
            setDraft(mine.argument ?? '')
            setEditing(true)
          }}
          className="mt-2 min-h-10 rounded-full border border-line px-4 text-[12px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2"
        >
          Edit my argument
        </button>
      </>
    )
  } else if (fight.phase === 'arguing') {
    body = (
      <>
        <div className="mt-4 space-y-2">
          {argumentBlock(fight.high)}
          {argumentBlock(fight.low)}
        </div>
        <p className="mt-3 text-[13px] leading-snug text-muted">
          {name(fight.high.memberId)} and {name(fight.low.memberId)} get one argument each. Judging
          opens when both are in; arguments close in {due}.
        </p>
      </>
    )
  } else {
    body = (
      <>
        <div className="mt-4 space-y-3.5">
          {argumentBlock(fight.high)}
          {argumentBlock(fight.low)}
        </div>
        {fight.phase === 'judging' && fight.me === 'judge' && (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Who won the fight?">
              {[fight.high, fight.low].map((side) => {
                const on = fight.myVote === side.memberId
                return (
                  <button
                    key={side.memberId}
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => void vote(on ? null : side.memberId)}
                    className={`flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                      on ? 'border-teal/60 bg-teal/15 text-teal' : 'border-line text-muted hover:text-text active:bg-surface-2'
                    }`}
                  >
                    {on && <CheckIcon />}
                    <span className="truncate">{name(side.memberId)} wins</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[12px] leading-snug text-muted">
              {fight.myVote === null && fight.judges - fight.voted === 1
                ? 'Yours is the last vote, so it rings the bell: the result is final.'
                : 'Votes stay sealed until the bell, and you can switch until then.'}{' '}
              {fight.voted} of{' '}
              {fight.judges} {fight.judges === 1 ? 'judge has' : 'judges have'} voted; the bell rings in {bell}.
            </p>
          </div>
        )}
        {fight.phase === 'judging' && fight.me !== 'judge' && (
          <p className="mt-3 text-[13px] leading-snug text-muted">
            {fight.me === 'watcher' ? 'You can watch this fight, but not judge it. ' : 'The group is judging. '}
            {fight.voted} of {fight.judges} {fight.judges === 1 ? 'judge has' : 'judges have'} voted; the
            bell rings in {bell}.
          </p>
        )}
        {fight.phase === 'closed' && (
          <p className="mt-4 font-display text-[18px] font-medium leading-snug">{fightVerdict(fight, name)}</p>
        )}
        {actionError && (
          <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
            {actionError}
          </p>
        )}
      </>
    )
  }

  return (
    <section className="mp-rise mt-7" style={{ animationDelay: '100ms' }}>
      <SectionHeader label="The fight" tone="text-coral" aside={phaseChip} />
      <div className="mp-card rounded-[26px] p-5">
        <h3 className="font-display text-[22px] font-semibold leading-tight">
          Split over <span className="text-coral">{fight.categoryLabel}</span>
        </h3>
        <p className="mt-1 text-[13px] leading-snug text-muted">
          The top and bottom scores make their case. Everyone else who played picks the winner.
        </p>
        <div className="mt-4 flex items-center gap-3">
          {corner(fight.high, false)}
          <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">vs</span>
          {corner(fight.low, true)}
        </div>
        {body}
      </div>
    </section>
  )
}

// ---- the best take ------------------------------------------------------------------

function TakesSection({
  takes,
  takesMode,
  sessionId,
  members,
  now,
  nameFor,
  onChanged,
  withTerms,
}: {
  takes: RoundTakes
  takesMode: TakesMode
  sessionId: string
  members: MemberInfo[]
  now: number
  nameFor: (id: string) => string
  onChanged: () => Promise<void>
  withTerms: (post: () => void) => void
}) {
  const myEntry = takes.entries.find((e) => e.mine) ?? null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function post() {
    setBusy(true)
    setActionError(null)
    try {
      await saveRoundTake(sessionId, draft)
      setEditing(false)
      setDraft('')
      await onChanged()
    } catch (err) {
      setActionError(errorText(err, 'Could not post your take'))
    } finally {
      setBusy(false)
    }
  }

  async function vote(choice: string | null) {
    setBusy(true)
    setActionError(null)
    try {
      await castRoundVote(sessionId, 'take', choice)
      await onChanged()
    } catch (err) {
      setActionError(errorText(err, 'Could not save your vote'))
    } finally {
      setBusy(false)
    }
  }

  const winners = takes.entries.filter((e) => e.winner)
  const aside = takes.closed ? 'Voting closed' : `Votes close in ${untilLabel(takes.closesAt, now)}`

  const entry = (e: RoundTake, i: number) => {
    const member = members.find((m) => m.userId === e.authorId)
    const on = takes.myVote === e.authorId
    return (
      <li key={e.postId} className={`py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}>
        <div className="flex items-start gap-3">
          <Avatar
            avatarKey={member?.avatarKey}
            displayName={member?.displayName ?? nameFor(e.authorId)}
            color={colorForMember(members, e.authorId)}
            size={28}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`font-mono text-[10px] uppercase tracking-[0.14em] ${e.mine ? 'text-gold' : 'text-muted'}`}>
                {nameFor(e.authorId)}
              </p>
              {e.winner && (
                <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-gold">
                  Best take
                </span>
              )}
              {e.votes !== null && (
                <span className="tabular font-mono text-[10px] text-muted">
                  {e.votes} {e.votes === 1 ? 'vote' : 'votes'}
                </span>
              )}
            </div>
            <p className={`mt-0.5 whitespace-pre-line text-[14px] leading-snug ${e.hidden ? 'text-muted' : ''}`}>
              &ldquo;{e.body}&rdquo;
            </p>
            {e.hidden && (
              <p className="mt-1 text-[12px] leading-snug text-coral">
                Hidden from the group while a moderator reviews it.
              </p>
            )}
            {!e.mine && (
              <div className="flex flex-wrap items-center gap-2">
                {takes.canVote && (
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => void vote(on ? null : e.authorId)}
                    className={`mt-2 flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                      on ? 'border-teal/60 bg-teal/15 text-teal' : 'border-line text-muted hover:text-text active:bg-surface-2'
                    }`}
                  >
                    {on && <CheckIcon />}
                    {on ? 'Your pick' : 'Pick as best'}
                  </button>
                )}
                <ReportButton postId={e.postId} what="take" />
              </div>
            )}
          </div>
        </div>
      </li>
    )
  }

  const footer = takes.closed
    ? winners.length > 0
      ? winners.length === 1
        ? `${nameFor(winners[0].authorId) === 'You' ? 'Yours' : `${nameFor(winners[0].authorId)}'s`} was the best take.`
        : 'A tie: the best take is shared.'
      : takes.entries.length < 2
        ? 'One take is not a contest, so nobody won this one.'
        : 'No votes, so no winner this time.'
    : takes.entries.length < 2
      ? takesMode === 'after'
        ? 'Voting starts once two takes are in.'
        : 'One take is not a contest, so there is no vote this round.'
      : takesMode === 'blind' && takes.myVote === null && takes.eligible - takes.voted === 1
        ? `${takes.voted} of ${takes.eligible} have voted. Yours is the last vote, so it closes the vote.`
        : `${takes.voted} of ${takes.eligible} have voted. Votes stay sealed until it closes, and you can switch yours until then.`

  const showComposer = takes.canWrite && (!myEntry || editing)

  return (
    <section className="mp-rise mt-7" style={{ animationDelay: '120ms' }}>
      <SectionHeader label="Best take" tone="text-gold" aside={aside} />
      <div className="mp-card rounded-[26px] px-5 py-2">
        {takes.entries.length > 0 ? (
          <ul>{takes.entries.map(entry)}</ul>
        ) : (
          <p className="py-4 text-[13px] leading-snug text-muted">
            {takesMode === 'after' && takes.canWrite
              ? 'No takes yet. Write the first one and the group votes on the best.'
              : 'Nobody wrote a take this round.'}
          </p>
        )}
        {showComposer && (
          <div className="border-t border-line/50 pb-3">
            <Composer
              id={`take-${sessionId}`}
              label={myEntry ? 'Edit your take' : 'Your take'}
              value={draft}
              max={TAKE_MAX}
              placeholder="What did everyone else miss? The group votes on the best take."
              busy={busy}
              error={actionError}
              cta={busy ? 'Posting…' : myEntry ? 'Save my take' : 'Post my take'}
              onChange={setDraft}
              onSubmit={() => withTerms(() => void post())}
              onCancel={editing ? () => setEditing(false) : undefined}
              note="Once someone votes for it, it stays as it is."
            />
          </div>
        )}
        {takes.canWrite && myEntry && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(myEntry.body)
              setEditing(true)
            }}
            className="mb-3 min-h-10 rounded-full border border-line px-4 text-[12px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2"
          >
            Edit my take
          </button>
        )}
        {!showComposer && actionError && (
          <p role="alert" className="pb-3 text-[13px] leading-snug text-coral">
            {actionError}
          </p>
        )}
      </div>
      <p className="mt-2 px-1 text-[12px] leading-snug text-muted">{footer}</p>
    </section>
  )
}
