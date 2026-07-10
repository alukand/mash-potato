import { describe, it, expect } from 'vitest'
import {
  scoresFromJson,
  scorecardFromRow,
  rubricFromJson,
  weightsFromRubric,
} from './mapping'

describe('scoresFromJson', () => {
  it('passes through a numeric map', () => {
    expect(scoresFromJson({ story: 9, fearFactor: 7 })).toEqual({ story: 9, fearFactor: 7 })
  })

  it('drops non-numeric and non-finite values', () => {
    expect(
      scoresFromJson({ story: 8, junk: 'nope', nan: NaN, inf: Infinity, nested: { a: 1 } }),
    ).toEqual({ story: 8 })
  })

  it('returns an empty map for null / arrays / primitives', () => {
    expect(scoresFromJson(null)).toEqual({})
    expect(scoresFromJson([1, 2])).toEqual({})
    expect(scoresFromJson('scores')).toEqual({})
  })
})

describe('scorecardFromRow', () => {
  it('builds a MemberScorecard from a row', () => {
    expect(
      scorecardFromRow({ member_id: 'user-1', locked: true, scores: { story: 9, humor: 6 } }),
    ).toEqual({ memberId: 'user-1', locked: true, scores: { story: 9, humor: 6 } })
  })
})

describe('rubricFromJson', () => {
  it('parses valid snapshot entries in order', () => {
    expect(
      rubricFromJson([
        { key: 'story', label: 'Story', weight: 30 },
        { key: 'humor', label: 'Humor', weight: 20 },
      ]),
    ).toEqual([
      { key: 'story', label: 'Story', weight: 30 },
      { key: 'humor', label: 'Humor', weight: 20 },
    ])
  })

  it('fills defective labels/weights and skips keyless entries', () => {
    expect(
      rubricFromJson([
        { key: 'story' },
        { label: 'No key', weight: 10 },
        { key: 'humor', label: '', weight: 'heavy' },
      ]),
    ).toEqual([
      { key: 'story', label: 'story', weight: 20 },
      { key: 'humor', label: 'humor', weight: 20 },
    ])
  })

  it('returns null for non-arrays and empty arrays', () => {
    expect(rubricFromJson(null)).toBeNull()
    expect(rubricFromJson({})).toBeNull()
    expect(rubricFromJson([])).toBeNull()
  })
})

describe('weightsFromRubric', () => {
  it('folds entries into a weights map', () => {
    expect(
      weightsFromRubric([
        { key: 'story', label: 'Story', weight: 30 },
        { key: 'humor', label: 'Humor', weight: 20 },
      ]),
    ).toEqual({ story: 30, humor: 20 })
  })
})
