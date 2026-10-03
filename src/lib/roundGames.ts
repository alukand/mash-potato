// Round games (20261003120000): the fight over the biggest split, and the
// best-take vote. Pure: this reads `round_game_state`'s document into types
// and holds the copy the screens share. Every rule (who sees what, when a
// game closes, who won) is decided server-side; nothing here recomputes it.

export type TakesMode = 'off' | 'blind' | 'after'

/** The longest take and the longest fight argument the server accepts. */
export const TAKE_MAX = 500
export const ARGUMENT_MAX = 280

export interface RoundTake {
  postId: string
  authorId: string
  body: string
  mine: boolean
  /** Your own take, hidden by reports while it is reviewed. */
  hidden: boolean
  /** Null while the vote is open: tallies stay sealed until it closes. */
  votes: number | null
  winner: boolean
}

export interface RoundTakes {
  closesAt: string
  closed: boolean
  /** 'after' rounds: the reveal is open for you and the vote is not over. */
  canWrite: boolean
  canVote: boolean
  /** The author you voted for, if you voted. */
  myVote: string | null
  voted: number
  eligible: number
  entries: RoundTake[]
}

export type FightPhase = 'arguing' | 'judging' | 'closed'
export type FightOutcome = 'win' | 'draw' | 'forfeit' | 'no_show'

export interface FightSide {
  memberId: string
  score: number
  /** Whether they made their case (true even while it is sealed from you). */
  argued: boolean
  /** Null while sealed, hidden, or never made. */
  postId: string | null
  argument: string | null
  /** Made, but hidden from you (reports, or a block between you). */
  hidden: boolean
  /** Null until the bell. */
  votes: number | null
}

export interface RoundFight {
  categoryKey: string
  categoryLabel: string
  phase: FightPhase
  /** When arguing ends whether or not both fighters argued. */
  argumentsDue: string
  /** Set once both arguments are in: when judging ends. */
  closesAt: string | null
  /** high/low: you are that fighter. watcher: you can see it, not judge it. */
  me: 'high' | 'low' | 'judge' | 'watcher'
  myVote: string | null
  judges: number
  voted: number
  outcome: FightOutcome | null
  winnerId: string | null
  high: FightSide
  low: FightSide
}

export interface RoundGames {
  takesMode: TakesMode
  /** Revealed, but not for you yet: your card is not locked. */
  sealed: boolean
  myTake: { body: string; hidden: boolean } | null
  takes: RoundTakes | null
  fight: RoundFight | null
}

export function takesModeFrom(value: unknown): TakesMode {
  return value === 'blind' || value === 'after' ? value : 'off'
}

type Doc = Record<string, unknown>

const isDoc = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const count = (v: unknown): number => num(v) ?? 0

function parseSide(v: unknown): FightSide | null {
  if (!isDoc(v)) return null
  const memberId = str(v.member_id)
  const score = num(v.score)
  if (memberId === null || score === null) return null
  return {
    memberId,
    score,
    argued: v.argued === true,
    postId: str(v.post_id),
    argument: str(v.argument),
    hidden: v.hidden === true,
    votes: num(v.votes),
  }
}

function parseFight(v: unknown): RoundFight | null {
  if (!isDoc(v)) return null
  const high = parseSide(v.high)
  const low = parseSide(v.low)
  const categoryKey = str(v.category_key)
  const argumentsDue = str(v.arguments_due)
  const phase = v.phase
  if (!high || !low || categoryKey === null || argumentsDue === null) return null
  if (phase !== 'arguing' && phase !== 'judging' && phase !== 'closed') return null
  const me = v.me === 'high' || v.me === 'low' || v.me === 'judge' ? v.me : 'watcher'
  const outcome =
    v.outcome === 'win' || v.outcome === 'draw' || v.outcome === 'forfeit' || v.outcome === 'no_show'
      ? v.outcome
      : null
  return {
    categoryKey,
    categoryLabel: str(v.category_label) ?? categoryKey,
    phase,
    argumentsDue,
    closesAt: str(v.closes_at),
    me,
    myVote: str(v.my_vote),
    judges: count(v.judges),
    voted: count(v.voted),
    outcome: phase === 'closed' ? outcome : null,
    winnerId: phase === 'closed' ? str(v.winner_id) : null,
    high,
    low,
  }
}

function parseTakes(v: unknown): RoundTakes | null {
  if (!isDoc(v)) return null
  const closesAt = str(v.closes_at)
  if (closesAt === null) return null
  const entries: RoundTake[] = []
  for (const e of Array.isArray(v.entries) ? v.entries : []) {
    if (!isDoc(e)) continue
    const postId = str(e.post_id)
    const authorId = str(e.author_id)
    const body = str(e.body)
    if (postId === null || authorId === null || body === null) continue
    entries.push({
      postId,
      authorId,
      body,
      mine: e.mine === true,
      hidden: e.hidden === true,
      votes: num(e.votes),
      winner: e.winner === true,
    })
  }
  return {
    closesAt,
    closed: v.closed === true,
    canWrite: v.can_write === true,
    canVote: v.can_vote === true,
    myVote: str(v.my_vote),
    voted: count(v.voted),
    eligible: count(v.eligible),
    entries,
  }
}

/** round_game_state's jsonb, validated. Anything malformed reads as absent. */
export function parseRoundGames(value: unknown): RoundGames {
  const doc = isDoc(value) ? value : {}
  const myTake = isDoc(doc.my_take) && typeof doc.my_take.body === 'string'
    ? { body: doc.my_take.body, hidden: doc.my_take.hidden === true }
    : null
  return {
    takesMode: takesModeFrom(doc.takes_mode),
    sealed: doc.sealed === true,
    myTake,
    takes: parseTakes(doc.takes),
    fight: parseFight(doc.fight),
  }
}

/** Your corner of the fight, if you are in it. */
export function myCorner(fight: RoundFight): FightSide | null {
  if (fight.me === 'high') return fight.high
  if (fight.me === 'low') return fight.low
  return null
}

/** The corner you are fighting, if you are in the fight. */
export function opponentCorner(fight: RoundFight): FightSide | null {
  if (fight.me === 'high') return fight.low
  if (fight.me === 'low') return fight.high
  return null
}

/**
 * How a closed fight ended, in one line. `nameFor` returns "You" for the
 * viewer, so the sentence reads right from every seat.
 */
export function fightVerdict(fight: RoundFight, nameFor: (memberId: string) => string): string {
  const hv = fight.high.votes ?? 0
  const lv = fight.low.votes ?? 0
  switch (fight.outcome) {
    case 'win': {
      const winner = fight.winnerId === fight.high.memberId ? fight.high : fight.low
      const loser = winner === fight.high ? fight.low : fight.high
      const won = nameFor(winner.memberId)
      const tally = `${Math.max(hv, lv)}-${Math.min(hv, lv)}`
      return won === 'You'
        ? `You won the fight over ${nameFor(loser.memberId)}, ${tally}.`
        : `${won} won the fight, ${tally}.`
    }
    case 'draw':
      return hv + lv === 0 ? 'No verdict: nobody judged it.' : `A draw, ${hv}-${lv}.`
    case 'forfeit': {
      const winner = fight.winnerId === fight.high.memberId ? fight.high : fight.low
      const absent = winner === fight.high ? fight.low : fight.high
      const missing = nameFor(absent.memberId)
      return missing === 'You'
        ? `You didn't make a case, so ${nameFor(winner.memberId)} takes it by forfeit.`
        : `${missing} didn't make a case. ${nameFor(winner.memberId)} takes it by forfeit.`
    }
    case 'no_show':
      return 'Neither side made a case.'
    default:
      return ''
  }
}

/** A short, shared countdown: "14h", "25m", or "closed". */
export function untilLabel(iso: string, now: number = Date.now()): string {
  const remaining = new Date(iso).getTime() - now
  if (!Number.isFinite(remaining) || remaining <= 0) return 'closed'
  const hours = Math.floor(remaining / 3_600_000)
  if (hours >= 1) return `${hours}h`
  return `${Math.max(1, Math.floor(remaining / 60_000))}m`
}

/** Whether a document still has a game that can change (worth refreshing). */
export function gamesInPlay(games: RoundGames | null): boolean {
  if (!games) return false
  const fightOpen = games.fight !== null && games.fight.phase !== 'closed'
  const takesOpen = games.takes !== null && !games.takes.closed
  return fightOpen || takesOpen
}
