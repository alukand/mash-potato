import { describe, it, expect } from 'vitest'
import {
  toDbCategory,
  fromDbCategory,
  weightsFromRows,
  scoresFromRow,
  scoresToRow,
  scorecardFromRow,
} from './mapping'
import { CATEGORY_IDS } from './scoring'
import type { CategoryScores } from './scoring'

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

describe('score row mapping', () => {
  const scores: CategoryScores = {
    story: 9,
    acting: 8,
    cinematography: 10,
    pacing: 6,
    scoreSound: 7,
  }

  it('round-trips CategoryScores through DB columns', () => {
    expect(scoresFromRow(scoresToRow(scores))).toEqual(scores)
  })

  it('maps score_sound to scoreSound', () => {
    expect(scoresToRow(scores).score_sound).toBe(7)
    expect(
      scoresFromRow({ story: 1, acting: 1, cinematography: 1, pacing: 1, score_sound: 4 })
        .scoreSound,
    ).toBe(4)
  })

  it('builds a MemberScorecard from a full row', () => {
    const card = scorecardFromRow({
      member_id: 'user-1',
      locked: true,
      ...scoresToRow(scores),
    })
    expect(card).toEqual({ memberId: 'user-1', locked: true, scores })
  })
})
