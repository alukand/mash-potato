import { describe, it, expect } from 'vitest'
import { toDbCategory, fromDbCategory, weightsFromRows } from './mapping'
import { CATEGORY_IDS } from './scoring'

describe('category mapping', () => {
  it('maps the one differing id both ways', () => {
    expect(toDbCategory('scoreSound')).toBe('score_sound')
    expect(fromDbCategory('score_sound')).toBe('scoreSound')
  })

  it('round-trips every category', () => {
    for (const id of CATEGORY_IDS) {
      expect(fromDbCategory(toDbCategory(id))).toBe(id)
    }
  })
})

describe('weightsFromRows', () => {
  it('maps rows into RubricWeights', () => {
    const weights = weightsFromRows([
      { category: 'story', weight: 30 },
      { category: 'acting', weight: 25 },
      { category: 'cinematography', weight: 20 },
      { category: 'pacing', weight: 15 },
      { category: 'score_sound', weight: 10 },
    ])
    expect(weights).toEqual({
      story: 30,
      acting: 25,
      cinematography: 20,
      pacing: 15,
      scoreSound: 10,
    })
  })

  it('defaults missing categories to the seed value 20', () => {
    expect(weightsFromRows([{ category: 'story', weight: 50 }])).toEqual({
      story: 50,
      acting: 20,
      cinematography: 20,
      pacing: 20,
      scoreSound: 20,
    })
  })
})
