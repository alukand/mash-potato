import { describe, expect, it } from 'vitest'
import { earnedBadges, nextBadge, shelf, tallyLine } from './trophies'

describe('badges', () => {
  it('earns each tier at its count, takes first', () => {
    expect(earnedBadges(0, 0)).toEqual([])
    expect(earnedBadges(1, 0).map((b) => b.name)).toEqual(['Quotable'])
    expect(earnedBadges(5, 1).map((b) => b.name)).toEqual(['Quotable', 'Pull Quote', 'Contender'])
    expect(earnedBadges(15, 15).map((b) => b.name)).toEqual([
      'Quotable', 'Pull Quote', 'Final Word', 'Contender', 'Heavyweight', 'Undisputed',
    ])
  })

  it('points at the next one, until there is none', () => {
    expect(nextBadge('take', 0)).toEqual({ badge: expect.objectContaining({ name: 'Quotable' }), remaining: 1 })
    expect(nextBadge('fight', 3)).toEqual({ badge: expect.objectContaining({ name: 'Heavyweight' }), remaining: 2 })
    expect(nextBadge('fight', 15)).toBeNull()
  })
})

describe('the shelf', () => {
  it('says the tallies without zeros', () => {
    expect(tallyLine(1, 0)).toBe('1 best take')
    expect(tallyLine(3, 1)).toBe('3 best takes, 1 fight won')
    expect(tallyLine(0, 2)).toBe('2 fights won')
    expect(tallyLine(0, 0)).toBe('')
  })

  it('lists winners in member order, never ranked by wins', () => {
    const counts = [
      { userId: 'c', takeWins: 9, fightWins: 4 },
      { userId: 'a', takeWins: 1, fightWins: 0 },
      { userId: 'b', takeWins: 0, fightWins: 0 },
      { userId: 'gone', takeWins: 3, fightWins: 0 },
    ]
    expect(shelf(counts, ['a', 'b', 'c']).map((c) => c.userId)).toEqual(['a', 'c'])
  })
})
