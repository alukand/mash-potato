import { describe, it, expect } from 'vitest'
import {
  memberWeightedScore,
  mashedScore,
  weightedSpread,
  categoryStat,
  mostContestedCategory,
  mostUnitedCategory,
  categoryOutlier,
  analyze,
  formatScore,
  type CategoryScores,
  type RubricWeights,
  type MemberScorecard,
} from './scoring'
import { sampleCategories, sampleScorecards, sampleWeights } from './fixtures'

const equalWeights: RubricWeights = {
  story: 1,
  acting: 1,
  cinematography: 1,
  pacing: 1,
  scoreSound: 1,
}

function card(memberId: string, scores: CategoryScores, locked = true): MemberScorecard {
  return { memberId, scores, locked }
}

describe('memberWeightedScore', () => {
  it('with equal weights is the plain mean', () => {
    const scores: CategoryScores = { story: 10, acting: 5, cinematography: 5, pacing: 5, scoreSound: 5 }
    expect(memberWeightedScore(scores, equalWeights)).toBeCloseTo(6) // 30 / 5
  })

  it('weights the categories (Σ score×imp / Σ imp)', () => {
    const scores: CategoryScores = { story: 8, acting: 8, cinematography: 9, pacing: 6, scoreSound: 9 }
    // (8*30 + 8*25 + 9*20 + 6*15 + 9*10) / 100 = 800 / 100
    expect(memberWeightedScore(scores, sampleWeights)).toBeCloseTo(8.0)
  })

  it('is invariant to scaling all weights by a constant', () => {
    const scores: CategoryScores = { story: 8, acting: 8, cinematography: 9, pacing: 6, scoreSound: 9 }
    const scaled: RubricWeights = { story: 60, acting: 50, cinematography: 40, pacing: 30, scoreSound: 20 }
    expect(memberWeightedScore(scores, scaled)).toBeCloseTo(
      memberWeightedScore(scores, sampleWeights),
    )
  })

  it('returns 0 when every weight is 0', () => {
    const scores: CategoryScores = { story: 9, acting: 9, cinematography: 9, pacing: 9, scoreSound: 9 }
    const zero: RubricWeights = { story: 0, acting: 0, cinematography: 0, pacing: 0, scoreSound: 0 }
    expect(memberWeightedScore(scores, zero)).toBe(0)
  })
})

describe('mashedScore', () => {
  it('is the mean of locked members weighted scores', () => {
    // weighted: 8.00, 8.85, 7.65, 8.35 -> mean 8.2125
    expect(mashedScore(sampleScorecards, sampleWeights)).toBeCloseTo(8.2125)
  })

  it('ignores members who have not locked', () => {
    const cards = sampleScorecards.map((c) => (c.memberId === 'devin' ? { ...c, locked: false } : c))
    // mean of 8.00, 8.85, 8.35 = 8.4
    expect(mashedScore(cards, sampleWeights)).toBeCloseTo(8.4)
  })

  it('is null when nobody has locked', () => {
    const cards = sampleScorecards.map((c) => ({ ...c, locked: false }))
    expect(mashedScore(cards, sampleWeights)).toBeNull()
  })
})

describe('weightedSpread', () => {
  it('is max minus min of locked weighted scores', () => {
    expect(weightedSpread(sampleScorecards, sampleWeights)).toBeCloseTo(1.2) // 8.85 - 7.65
  })

  it('is null with no locked members', () => {
    expect(weightedSpread([], sampleWeights)).toBeNull()
  })
})

describe('category analysis', () => {
  it('computes the range per category', () => {
    expect(categoryStat('pacing', sampleScorecards)?.range).toBe(5) // 9 - 4
    expect(categoryStat('cinematography', sampleScorecards)?.range).toBe(1) // 10 - 9
  })

  it('finds the most contested and most united categories', () => {
    expect(mostContestedCategory(sampleCategories, sampleScorecards)?.category).toBe('pacing')
    expect(mostUnitedCategory(sampleCategories, sampleScorecards)?.category).toBe(
      'cinematography',
    )
  })

  it('breaks range ties toward the earlier category', () => {
    const cards = [
      card('a', { story: 2, acting: 2, cinematography: 5, pacing: 5, scoreSound: 5 }),
      card('b', { story: 4, acting: 4, cinematography: 5, pacing: 5, scoreSound: 5 }),
    ]
    // story & acting both range 2; the rest range 0.
    expect(mostContestedCategory(sampleCategories, cards)?.category).toBe('story')
    expect(mostUnitedCategory(sampleCategories, cards)?.category).toBe('cinematography')
  })

  it('identifies the per-category outlier (furthest from the mean)', () => {
    const o = categoryOutlier('pacing', sampleScorecards)
    // pacing 6,9,4,8 -> mean 6.75; Devin at 4 is furthest (dev 2.75)
    expect(o?.memberId).toBe('devin')
    expect(o?.deviation).toBeCloseTo(2.75)
  })

  it('returns null for an empty set', () => {
    expect(categoryStat('story', [])).toBeNull()
    expect(categoryOutlier('story', [])).toBeNull()
    expect(mostContestedCategory(sampleCategories, [])).toBeNull()
  })
})

describe('dynamic categories', () => {
  it('skips categories a member has no score for (weight excluded)', () => {
    // 'humor' only counts for the member who scored it.
    const weights: RubricWeights = { story: 1, humor: 1 }
    expect(memberWeightedScore({ story: 8 }, weights)).toBeCloseTo(8)
    expect(memberWeightedScore({ story: 8, humor: 4 }, weights)).toBeCloseTo(6)
  })

  it('computes stats only over members who scored the category', () => {
    const cards = [
      card('a', { story: 8, humor: 10 }),
      card('b', { story: 6 }), // scored before Humor existed
    ]
    const stat = categoryStat('humor', cards)
    expect(stat?.mean).toBe(10)
    expect(stat?.range).toBe(0)
  })
})

describe('analyze', () => {
  it('bundles the reveal headline numbers', () => {
    const a = analyze(sampleCategories, sampleScorecards, sampleWeights)
    expect(a.mashed).toBeCloseTo(8.2125)
    expect(a.spread).toBeCloseTo(1.2)
    expect(a.lockedCount).toBe(4)
    expect(a.totalCount).toBe(4)
    expect(a.mostContested?.category).toBe('pacing')
    expect(a.mostUnited?.category).toBe('cinematography')
    expect(a.outlier?.memberId).toBe('devin')
  })
})

describe('formatScore', () => {
  it('shows one decimal place', () => {
    expect(formatScore(8.2125)).toBe('8.2')
    expect(formatScore(8)).toBe('8.0')
  })

  it('shows an em dash for null or NaN', () => {
    expect(formatScore(null)).toBe('—')
    expect(formatScore(NaN)).toBe('—')
  })
})
