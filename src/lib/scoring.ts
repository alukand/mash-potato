// Mash Potato — scoring core.
// ALL group-scoring math lives here so it can be unit-tested in isolation
// (see scoring.test.ts). Pure functions only: no I/O, no React, no Supabase.
// Blindness/reveal is enforced server-side (Supabase RLS) — never here.

/** The five rubric categories. Fixed set; the GROUP chooses their weights. */
export const CATEGORY_IDS = [
  'story',
  'acting',
  'cinematography',
  'pacing',
  'scoreSound',
] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

/** Human-facing labels. */
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  story: 'Story',
  acting: 'Acting',
  cinematography: 'Cinematography',
  pacing: 'Pacing',
  scoreSound: 'Score & Sound',
}

/** A member's 1–10 rating for each category. */
export type CategoryScores = Record<CategoryId, number>

/**
 * The group rubric: how much each category counts ("importance"). Weights are
 * arbitrary non-negative numbers — they need not sum to 100, because the
 * weighted average normalises by their total.
 */
export type RubricWeights = Record<CategoryId, number>

/** One member's scorecard for a single title. */
export interface MemberScorecard {
  memberId: string
  scores: CategoryScores
  /** Mashed only counts members who have locked in their scores. */
  locked: boolean
}

/**
 * A member's weighted score: Σ(score × importance) / Σ(importance).
 * Returns 0 when every weight is 0 (a degenerate rubric the UI must prevent).
 */
export function memberWeightedScore(
  scores: CategoryScores,
  weights: RubricWeights,
): number {
  let weightedSum = 0
  let totalWeight = 0
  for (const id of CATEGORY_IDS) {
    weightedSum += scores[id] * weights[id]
    totalWeight += weights[id]
  }
  return totalWeight === 0 ? 0 : weightedSum / totalWeight
}

/**
 * The group "Mashed" score: the mean of the weighted scores of the members who
 * have LOCKED in. Returns null when nobody has locked yet.
 */
export function mashedScore(
  scorecards: MemberScorecard[],
  weights: RubricWeights,
): number | null {
  const locked = scorecards.filter((s) => s.locked)
  if (locked.length === 0) return null
  const total = locked.reduce(
    (sum, s) => sum + memberWeightedScore(s.scores, weights),
    0,
  )
  return total / locked.length
}

/** Spread of locked members' weighted scores (max − min) — "how split were we". */
export function weightedSpread(
  scorecards: MemberScorecard[],
  weights: RubricWeights,
): number | null {
  const values = scorecards
    .filter((s) => s.locked)
    .map((s) => memberWeightedScore(s.scores, weights))
  if (values.length === 0) return null
  return Math.max(...values) - Math.min(...values)
}

/** Stats for one category across the given scorecards. */
export interface CategoryStat {
  category: CategoryId
  mean: number
  min: number
  max: number
  /** max − min: how much the group disagreed on this category. */
  range: number
}

export function categoryStat(
  category: CategoryId,
  scorecards: MemberScorecard[],
): CategoryStat | null {
  if (scorecards.length === 0) return null
  const values = scorecards.map((s) => s.scores[category])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return { category, mean, min, max, range: max - min }
}

/** Stats for every category, in canonical CATEGORY_IDS order. */
export function allCategoryStats(scorecards: MemberScorecard[]): CategoryStat[] {
  const stats: CategoryStat[] = []
  for (const id of CATEGORY_IDS) {
    const stat = categoryStat(id, scorecards)
    if (stat) stats.push(stat)
  }
  return stats
}

/**
 * Most contested category = widest range of member scores.
 * Ties break toward the earlier category in CATEGORY_IDS order.
 */
export function mostContestedCategory(
  scorecards: MemberScorecard[],
): CategoryStat | null {
  const stats = allCategoryStats(scorecards)
  if (stats.length === 0) return null
  return stats.reduce((best, s) => (s.range > best.range ? s : best))
}

/**
 * Most united category = narrowest range.
 * Ties break toward the earlier category in CATEGORY_IDS order.
 */
export function mostUnitedCategory(
  scorecards: MemberScorecard[],
): CategoryStat | null {
  const stats = allCategoryStats(scorecards)
  if (stats.length === 0) return null
  return stats.reduce((best, s) => (s.range < best.range ? s : best))
}

/** The member who diverged most from the group on a given category. */
export interface Outlier {
  memberId: string
  category: CategoryId
  score: number
  mean: number
  /** Absolute distance from the category mean. */
  deviation: number
}

export function categoryOutlier(
  category: CategoryId,
  scorecards: MemberScorecard[],
): Outlier | null {
  const stat = categoryStat(category, scorecards)
  if (!stat) return null
  let outlier: Outlier | null = null
  for (const s of scorecards) {
    const deviation = Math.abs(s.scores[category] - stat.mean)
    if (outlier === null || deviation > outlier.deviation) {
      outlier = {
        memberId: s.memberId,
        category,
        score: s.scores[category],
        mean: stat.mean,
        deviation,
      }
    }
  }
  return outlier
}

/** Everything the Reveal headline needs, computed from a set of scorecards. */
export interface MashAnalysis {
  mashed: number | null
  spread: number | null
  lockedCount: number
  totalCount: number
  perMember: { memberId: string; weighted: number; locked: boolean }[]
  mostContested: CategoryStat | null
  mostUnited: CategoryStat | null
  /** Outlier within the most contested category (the headline clash). */
  outlier: Outlier | null
}

export function analyze(
  scorecards: MemberScorecard[],
  weights: RubricWeights,
): MashAnalysis {
  const locked = scorecards.filter((s) => s.locked)
  const mostContested = mostContestedCategory(locked)
  return {
    mashed: mashedScore(scorecards, weights),
    spread: weightedSpread(scorecards, weights),
    lockedCount: locked.length,
    totalCount: scorecards.length,
    perMember: scorecards.map((s) => ({
      memberId: s.memberId,
      weighted: memberWeightedScore(s.scores, weights),
      locked: s.locked,
    })),
    mostContested,
    mostUnited: mostUnitedCategory(locked),
    outlier: mostContested
      ? categoryOutlier(mostContested.category, locked)
      : null,
  }
}

/** Format a score for display: one decimal, or an em dash when null/NaN. */
export function formatScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  return (Math.round(value * 10) / 10).toFixed(1)
}
