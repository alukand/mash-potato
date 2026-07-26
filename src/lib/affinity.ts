// Agreement math ACROSS nights — the group's whole run, not one Reveal.
//
// scoring.ts answers "how split were we tonight?". This answers "who do I
// actually agree with, and what do we always fight about?". Both questions are
// the same moat (disagreement as the headline); only the window differs.
//
// Every function here is pure and takes the nights it should consider, so the
// caller owns filtering. Same discipline as scoring.ts: a category absent from
// a member's card DROPS OUT rather than counting as zero — extras are opt-in
// per member, so a missing key means "didn't rate it", never "rated it 0".

import { memberWeightedScore, weightedSpread, mashedScore } from './scoring'
import type { CategoryId, MemberScorecard } from './scoring'
import type { SessionRubricEntry } from './mapping'

/** One revealed night, reduced to what agreement math needs. */
export interface HistoryNight {
  sessionId: string
  titleName: string
  rubric: SessionRubricEntry[]
  cards: MemberScorecard[]
}

/**
 * A night only counts toward agreement once BOTH members locked. An open card
 * is not an opinion yet, and the blind rule means we could not read it anyway.
 */
function lockedCard(night: HistoryNight, memberId: string): MemberScorecard | null {
  const card = night.cards.find((c) => c.memberId === memberId)
  return card && card.locked ? card : null
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** How far apart two people sit on one category, and over how many nights. */
export interface CategoryGap {
  category: CategoryId
  label: string
  /** Mean |a − b| across the nights where BOTH rated it. */
  meanGap: number
  nights: number
}

export interface PairAgreement {
  /** Nights where both members locked a card. */
  nights: number
  /** Mean absolute distance between their weighted scores. Null with no nights. */
  meanGap: number | null
  /** Per category, widest disagreement first. Only categories both have rated. */
  perCategory: CategoryGap[]
}

/**
 * Two members measured against each other over the given nights.
 *
 * Each night is scored under its OWN rubric snapshot, so a group that changed
 * its weights later doesn't retroactively rewrite how close two people were.
 */
export function pairAgreement(
  nights: HistoryNight[],
  memberA: string,
  memberB: string,
): PairAgreement {
  const gaps: number[] = []
  // category key -> the per-night absolute gaps, plus its display label
  const byCategory = new Map<CategoryId, { label: string; gaps: number[] }>()

  for (const night of nights) {
    const a = lockedCard(night, memberA)
    const b = lockedCard(night, memberB)
    if (!a || !b) continue

    const weights = Object.fromEntries(night.rubric.map((e) => [e.key, e.weight]))
    gaps.push(Math.abs(memberWeightedScore(a.scores, weights) - memberWeightedScore(b.scores, weights)))

    for (const entry of night.rubric) {
      const scoreA = a.scores[entry.key]
      const scoreB = b.scores[entry.key]
      // Both must have rated it: an opt-in extra one of them skipped says
      // nothing about whether they agree.
      if (typeof scoreA !== 'number' || typeof scoreB !== 'number') continue
      const bucket = byCategory.get(entry.key)
      if (bucket) bucket.gaps.push(Math.abs(scoreA - scoreB))
      else byCategory.set(entry.key, { label: entry.label, gaps: [Math.abs(scoreA - scoreB)] })
    }
  }

  const perCategory: CategoryGap[] = [...byCategory.entries()]
    .map(([category, { label, gaps: g }]) => ({
      category,
      label,
      meanGap: mean(g),
      nights: g.length,
    }))
    .sort((x, y) => y.meanGap - x.meanGap)

  return {
    nights: gaps.length,
    meanGap: gaps.length > 0 ? mean(gaps) : null,
    perCategory,
  }
}

/**
 * One shared night is a coincidence, not a pattern. Claims about a PAIR need
 * this many nights behind them; the same floor guards the group recap.
 */
export const MIN_NIGHTS_FOR_A_CLAIM = 3

/**
 * A category needs at least two shared ratings before it can headline —
 * the cross-night twin of the `raters >= 2` floor in mostUnitedCategory.
 */
export const MIN_NIGHTS_FOR_A_CATEGORY = 2

/** The category a pair reliably clashes on, or null if nothing qualifies. */
export function sorestSpot(agreement: PairAgreement): CategoryGap | null {
  const eligible = agreement.perCategory.filter((c) => c.nights >= MIN_NIGHTS_FOR_A_CATEGORY)
  if (eligible.length === 0) return null
  return eligible.reduce((worst, c) => (c.meanGap > worst.meanGap ? c : worst))
}

/** The category a pair reliably agrees on. */
export function commonGround(agreement: PairAgreement): CategoryGap | null {
  const eligible = agreement.perCategory.filter((c) => c.nights >= MIN_NIGHTS_FOR_A_CATEGORY)
  if (eligible.length === 0) return null
  return eligible.reduce((best, c) => (c.meanGap < best.meanGap ? c : best))
}

export interface Twin {
  memberId: string
  agreement: PairAgreement
}

export interface TasteTwins {
  /** Closest groupmate by mean gap. Null until someone clears the floor. */
  twin: Twin | null
  /** Furthest groupmate — the reliable foil. Null in a two-person group. */
  foil: Twin | null
}

/**
 * The viewer's closest and furthest groupmate.
 *
 * With exactly one qualifying groupmate there IS no comparison, so they are
 * the twin and the foil is null — calling your only groupmate your "foil"
 * would be an artifact of having nobody else, not a finding.
 */
export function tasteTwins(
  nights: HistoryNight[],
  viewerId: string,
  memberIds: string[],
): TasteTwins {
  const scored: Twin[] = []
  for (const memberId of memberIds) {
    if (memberId === viewerId) continue
    const agreement = pairAgreement(nights, viewerId, memberId)
    if (agreement.nights < MIN_NIGHTS_FOR_A_CLAIM || agreement.meanGap === null) continue
    scored.push({ memberId, agreement })
  }
  if (scored.length === 0) return { twin: null, foil: null }

  scored.sort((a, b) => (a.agreement.meanGap ?? 0) - (b.agreement.meanGap ?? 0))
  return {
    twin: scored[0],
    foil: scored.length > 1 ? scored[scored.length - 1] : null,
  }
}

/** One night reduced to a headline number, for "best/worst/most divisive". */
export interface RecapNight {
  sessionId: string
  titleName: string
  value: number
}

export interface GroupRecap {
  /** Revealed nights that produced a Mashed score. */
  nights: number
  /** Mean Mashed across those nights. */
  averageMashed: number | null
  highest: RecapNight | null
  lowest: RecapNight | null
  /** Narrowest spread of member scores — the night everyone agreed. */
  mostUnited: RecapNight | null
  /** Widest spread — the night the group fell out. */
  mostDivisive: RecapNight | null
  /** The category with the widest mean range across nights. */
  sorestCategory: CategoryGap | null
}

/**
 * The group's run so far.
 *
 * Deliberately says nothing about who scores highest or whose picks land best:
 * ranking members is the failure mode DESIGN.md's reward-loop law exists to
 * prevent, and it does not stop being a leaderboard because it is made of
 * ratings instead of points.
 */
export function groupRecap(nights: HistoryNight[]): GroupRecap {
  const mashedNights: RecapNight[] = []
  const spreadNights: RecapNight[] = []
  // category key -> per-night ranges (max − min among that night's raters)
  const byCategory = new Map<CategoryId, { label: string; ranges: number[] }>()

  for (const night of nights) {
    if (night.rubric.length === 0) continue
    const weights = Object.fromEntries(night.rubric.map((e) => [e.key, e.weight]))
    const locked = night.cards.filter((c) => c.locked)

    const mashed = mashedScore(night.cards, weights)
    if (mashed !== null) {
      mashedNights.push({ sessionId: night.sessionId, titleName: night.titleName, value: mashed })
    }
    // A spread needs two voices; one locked card has nothing to spread across.
    const spread = locked.length >= 2 ? weightedSpread(night.cards, weights) : null
    if (spread !== null) {
      spreadNights.push({ sessionId: night.sessionId, titleName: night.titleName, value: spread })
    }

    for (const entry of night.rubric) {
      const values = locked
        .map((c) => c.scores[entry.key])
        .filter((v): v is number => typeof v === 'number')
      if (values.length < 2) continue
      const range = Math.max(...values) - Math.min(...values)
      const bucket = byCategory.get(entry.key)
      if (bucket) bucket.ranges.push(range)
      else byCategory.set(entry.key, { label: entry.label, ranges: [range] })
    }
  }

  const categories: CategoryGap[] = [...byCategory.entries()]
    .filter(([, { ranges }]) => ranges.length >= MIN_NIGHTS_FOR_A_CATEGORY)
    .map(([category, { label, ranges }]) => ({
      category,
      label,
      meanGap: mean(ranges),
      nights: ranges.length,
    }))

  const pick = (list: RecapNight[], better: (a: number, b: number) => boolean) =>
    list.length > 0 ? list.reduce((best, n) => (better(n.value, best.value) ? n : best)) : null

  return {
    nights: mashedNights.length,
    averageMashed: mashedNights.length > 0 ? mean(mashedNights.map((n) => n.value)) : null,
    highest: pick(mashedNights, (a, b) => a > b),
    lowest: pick(mashedNights, (a, b) => a < b),
    mostUnited: pick(spreadNights, (a, b) => a < b),
    mostDivisive: pick(spreadNights, (a, b) => a > b),
    sorestCategory:
      categories.length > 0
        ? categories.reduce((worst, c) => (c.meanGap > worst.meanGap ? c : worst))
        : null,
  }
}

/**
 * The viewer's own average against the group's, over nights they locked.
 *
 * Deliberately one person's number, never a table of everyone's: "you run
 * about a point warm" is a fact about you, while the same list sorted is a
 * ranking of your friends.
 */
export function myTilt(
  nights: HistoryNight[],
  viewerId: string,
): { nights: number; mine: number | null; group: number | null } {
  const mine: number[] = []
  const group: number[] = []
  for (const night of nights) {
    if (night.rubric.length === 0) continue
    const card = lockedCard(night, viewerId)
    if (!card) continue
    const weights = Object.fromEntries(night.rubric.map((e) => [e.key, e.weight]))
    const mashed = mashedScore(night.cards, weights)
    if (mashed === null) continue
    mine.push(memberWeightedScore(card.scores, weights))
    group.push(mashed)
  }
  return {
    nights: mine.length,
    mine: mine.length > 0 ? mean(mine) : null,
    group: group.length > 0 ? mean(group) : null,
  }
}
