// The trophy shelf: what each member has won in a group. Wins are given by
// the group's votes (a best take, a fight won on votes; a forfeit is not a
// win), counted inside one group, and cosmetic. DESIGN.md reward-loop law,
// amended 2026-10-03: badges and tallies, but never a ranked table.

export type TrophyTrack = 'take' | 'fight'

export interface Badge {
  track: TrophyTrack
  name: string
  /** Wins needed to earn it. */
  at: number
}

// Film words, like the Cred flairs: a pull quote is the line a studio prints
// on the poster; "I coulda been a contender" is the fight.
export const BADGES: readonly Badge[] = [
  { track: 'take', name: 'Quotable', at: 1 },
  { track: 'take', name: 'Pull Quote', at: 5 },
  { track: 'take', name: 'Final Word', at: 15 },
  { track: 'fight', name: 'Contender', at: 1 },
  { track: 'fight', name: 'Heavyweight', at: 5 },
  { track: 'fight', name: 'Undisputed', at: 15 },
]

export interface TrophyCount {
  userId: string
  takeWins: number
  fightWins: number
}

/** Every badge these wins have earned, takes first, in the order earned. */
export function earnedBadges(takeWins: number, fightWins: number): Badge[] {
  return BADGES.filter((b) => (b.track === 'take' ? takeWins : fightWins) >= b.at)
}

/** The next badge on a track, and how many more wins it needs. */
export function nextBadge(
  track: TrophyTrack,
  wins: number,
): { badge: Badge; remaining: number } | null {
  const badge = BADGES.find((b) => b.track === track && b.at > wins)
  return badge ? { badge, remaining: badge.at - wins } : null
}

/** "3 best takes", "1 fight won": the tally line, without the zeros. */
export function tallyLine(takeWins: number, fightWins: number): string {
  const parts: string[] = []
  if (takeWins > 0) parts.push(`${takeWins} best ${takeWins === 1 ? 'take' : 'takes'}`)
  if (fightWins > 0) parts.push(`${fightWins} ${fightWins === 1 ? 'fight' : 'fights'} won`)
  return parts.join(', ')
}

/**
 * The shelf: members with at least one win, in the order the group lists
 * its members. Never sorted by wins: that would be a leaderboard.
 */
export function shelf(counts: TrophyCount[], memberOrder: string[]): TrophyCount[] {
  const position = new Map(memberOrder.map((id, i) => [id, i]))
  return counts
    .filter((c) => c.takeWins + c.fightWins > 0 && position.has(c.userId))
    .sort((a, b) => (position.get(a.userId) ?? 0) - (position.get(b.userId) ?? 0))
}
