import { describe, expect, it } from 'vitest'
import {
  fightVerdict,
  gamesInPlay,
  myCorner,
  opponentCorner,
  parseRoundGames,
  takesModeFrom,
  untilLabel,
} from './roundGames'
import type { RoundFight } from './roundGames'

const GINA = 'e1000000-0000-4000-8000-000000000001'
const HAL = 'e1000000-0000-4000-8000-000000000002'

const doc = {
  takes_mode: 'blind',
  sealed: false,
  my_take: { body: 'Every minute earns the diner scene.', hidden: false },
  takes: {
    closes_at: '2026-10-04T20:00:00Z',
    closed: false,
    can_write: false,
    can_vote: true,
    my_vote: HAL,
    voted: 2,
    eligible: 4,
    entries: [
      { post_id: 'p1', author_id: GINA, body: 'Every minute earns it.', mine: true, hidden: false, votes: null, winner: false },
      { post_id: 'p2', author_id: HAL, body: 'The middle hour sags.', mine: false, hidden: false, votes: null, winner: false },
      { post_id: 7, author_id: HAL, body: 'malformed' },
    ],
  },
  fight: {
    category_key: 'pacing',
    category_label: 'Pacing',
    phase: 'judging',
    arguments_due: '2026-10-04T20:00:00Z',
    closes_at: '2026-10-05T08:00:00Z',
    me: 'high',
    my_vote: null,
    judges: 2,
    voted: 1,
    outcome: null,
    winner_id: null,
    high: { member_id: GINA, score: 9, argued: true, post_id: 'a1', argument: 'The waiting IS the heist.', hidden: false, votes: null },
    low: { member_id: HAL, score: 3, argued: true, post_id: 'a2', argument: 'It sags.', hidden: false, votes: null },
  },
}

describe('parsing round_game_state', () => {
  it('reads the whole document', () => {
    const g = parseRoundGames(doc)
    expect(g.takesMode).toBe('blind')
    expect(g.sealed).toBe(false)
    expect(g.myTake).toEqual({ body: 'Every minute earns the diner scene.', hidden: false })
    expect(g.takes?.entries.map((e) => e.postId)).toEqual(['p1', 'p2'])
    expect(g.takes?.myVote).toBe(HAL)
    expect(g.takes?.entries[0].votes).toBeNull()
    expect(g.fight?.categoryLabel).toBe('Pacing')
    expect(g.fight?.high.score).toBe(9)
    expect(g.fight?.me).toBe('high')
    expect(g.fight?.closesAt).toBe('2026-10-05T08:00:00Z')
  })

  it('treats a sealed or empty document as nothing to show', () => {
    expect(parseRoundGames({ takes_mode: 'after', sealed: true, my_take: null, takes: null, fight: null }))
      .toEqual({ takesMode: 'after', sealed: true, myTake: null, takes: null, fight: null })
    expect(parseRoundGames(null)).toEqual({
      takesMode: 'off', sealed: false, myTake: null, takes: null, fight: null,
    })
  })

  it('drops a fight it cannot read rather than guessing', () => {
    expect(parseRoundGames({ ...doc, fight: { ...doc.fight, phase: 'brawling' } }).fight).toBeNull()
    expect(parseRoundGames({ ...doc, fight: { ...doc.fight, high: { member_id: GINA } } }).fight).toBeNull()
  })

  it('only reports an outcome once the fight is closed', () => {
    const open = parseRoundGames({ ...doc, fight: { ...doc.fight, outcome: 'win', winner_id: GINA } })
    expect(open.fight?.outcome).toBeNull()
    expect(open.fight?.winnerId).toBeNull()
  })

  it('reads an unknown takes mode as off', () => {
    expect(takesModeFrom('blind')).toBe('blind')
    expect(takesModeFrom('after')).toBe('after')
    expect(takesModeFrom('sometimes')).toBe('off')
    expect(takesModeFrom(undefined)).toBe('off')
  })
})

describe('corners and verdicts', () => {
  const closed = (patch: Partial<RoundFight>): RoundFight => ({
    ...parseRoundGames(doc).fight!,
    phase: 'closed',
    ...patch,
  })
  const nameFor = (viewer: string) => (id: string) =>
    id === viewer ? 'You' : id === GINA ? 'Gina' : 'Hal'

  it('knows your corner and your opponent', () => {
    const f = parseRoundGames(doc).fight!
    expect(myCorner(f)?.memberId).toBe(GINA)
    expect(opponentCorner(f)?.memberId).toBe(HAL)
    expect(myCorner({ ...f, me: 'judge' })).toBeNull()
  })

  it('names a win from every seat', () => {
    const f = closed({
      outcome: 'win',
      winnerId: GINA,
      high: { ...parseRoundGames(doc).fight!.high, votes: 2 },
      low: { ...parseRoundGames(doc).fight!.low, votes: 1 },
    })
    expect(fightVerdict(f, nameFor('judge'))).toBe('Gina won the fight, 2-1.')
    expect(fightVerdict(f, nameFor(GINA))).toBe('You won the fight over Hal, 2-1.')
    expect(fightVerdict(f, nameFor(HAL))).toBe('Gina won the fight, 2-1.')
  })

  it('tells a draw from a fight nobody judged', () => {
    const base = parseRoundGames(doc).fight!
    expect(fightVerdict(closed({ outcome: 'draw', high: { ...base.high, votes: 0 }, low: { ...base.low, votes: 0 } }), nameFor('x')))
      .toBe('No verdict: nobody judged it.')
    expect(fightVerdict(closed({ outcome: 'draw', high: { ...base.high, votes: 2 }, low: { ...base.low, votes: 2 } }), nameFor('x')))
      .toBe('A draw, 2-2.')
  })

  it('names who did not show', () => {
    const f = closed({ outcome: 'forfeit', winnerId: GINA })
    expect(fightVerdict(f, nameFor('judge'))).toBe("Hal didn't make a case. Gina takes it by forfeit.")
    expect(fightVerdict(f, nameFor(HAL))).toBe("You didn't make a case, so Gina takes it by forfeit.")
    expect(fightVerdict(closed({ outcome: 'no_show' }), nameFor('judge'))).toBe('Neither side made a case.')
  })
})

describe('clocks', () => {
  const now = Date.parse('2026-10-03T12:00:00Z')

  it('counts down in hours, then minutes', () => {
    expect(untilLabel('2026-10-04T02:30:00Z', now)).toBe('14h')
    expect(untilLabel('2026-10-03T12:25:00Z', now)).toBe('25m')
    expect(untilLabel('2026-10-03T12:00:20Z', now)).toBe('1m')
    expect(untilLabel('2026-10-03T11:00:00Z', now)).toBe('closed')
    expect(untilLabel('not a date', now)).toBe('closed')
  })

  it('knows when a round still has a game in play', () => {
    const g = parseRoundGames(doc)
    expect(gamesInPlay(g)).toBe(true)
    expect(gamesInPlay({ ...g, fight: null, takes: { ...g.takes!, closed: true } })).toBe(false)
    expect(gamesInPlay(null)).toBe(false)
  })
})
