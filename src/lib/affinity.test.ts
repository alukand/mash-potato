import { describe, it, expect } from 'vitest'
import {
  pairAgreement,
  sorestSpot,
  commonGround,
  tasteTwins,
  groupRecap,
  myTilt,
  type HistoryNight,
} from './affinity'
import type { CategoryScores, MemberScorecard } from './scoring'
import type { SessionRubricEntry } from './mapping'

const RUBRIC: SessionRubricEntry[] = [
  { key: 'story', label: 'Story', weight: 1 },
  { key: 'pacing', label: 'Pacing', weight: 1 },
]

function card(memberId: string, scores: CategoryScores, locked = true): MemberScorecard {
  return { memberId, scores, locked }
}

function night(
  sessionId: string,
  cards: MemberScorecard[],
  rubric: SessionRubricEntry[] = RUBRIC,
): HistoryNight {
  return { sessionId, titleName: `Film ${sessionId}`, rubric, cards }
}

/** Three nights where Ana and Ben agree on Story and clash on Pacing. */
const AGREE_ON_STORY: HistoryNight[] = [
  night('1', [
    card('ana', { story: 8, pacing: 9 }),
    card('ben', { story: 8, pacing: 3 }),
  ]),
  night('2', [
    card('ana', { story: 6, pacing: 8 }),
    card('ben', { story: 7, pacing: 2 }),
  ]),
  night('3', [
    card('ana', { story: 9, pacing: 7 }),
    card('ben', { story: 9, pacing: 3 }),
  ]),
]

describe('pairAgreement', () => {
  it('measures the mean distance between two members across nights', () => {
    const result = pairAgreement(AGREE_ON_STORY, 'ana', 'ben')
    expect(result.nights).toBe(3)
    // weighted means: ana 8.5/7/8, ben 5.5/4.5/6 -> gaps 3, 2.5, 2
    expect(result.meanGap).toBeCloseTo(2.5)
  })

  it('separates the category they agree on from the one they fight over', () => {
    const result = pairAgreement(AGREE_ON_STORY, 'ana', 'ben')
    const story = result.perCategory.find((c) => c.category === 'story')
    const pacing = result.perCategory.find((c) => c.category === 'pacing')
    expect(story?.meanGap).toBeCloseTo(1 / 3) // |8−8|, |6−7|, |9−9|
    expect(pacing?.meanGap).toBeCloseTo(16 / 3) // |9−3|, |8−2|, |7−3|
    expect(sorestSpot(result)?.category).toBe('pacing')
    expect(commonGround(result)?.category).toBe('story')
  })

  it('is symmetric', () => {
    const ab = pairAgreement(AGREE_ON_STORY, 'ana', 'ben')
    const ba = pairAgreement(AGREE_ON_STORY, 'ben', 'ana')
    expect(ba.meanGap).toBeCloseTo(ab.meanGap!)
  })

  it('DROPS a category one of them never rated rather than scoring it zero', () => {
    // Ben skips the opt-in extra on both nights. Treating that as 0 would
    // invent a 9-point clash out of a category he simply did not rate.
    const rubric: SessionRubricEntry[] = [...RUBRIC, { key: 'humor', label: 'Humor', weight: 1 }]
    const nights = [
      night('1', [card('ana', { story: 8, pacing: 8, humor: 9 }), card('ben', { story: 8, pacing: 8 })], rubric),
      night('2', [card('ana', { story: 8, pacing: 8, humor: 9 }), card('ben', { story: 8, pacing: 8 })], rubric),
    ]
    const result = pairAgreement(nights, 'ana', 'ben')
    expect(result.perCategory.find((c) => c.category === 'humor')).toBeUndefined()
    // The weighted gap follows scoring.ts's partial tolerance: Humor lifts
    // ANA's own average (8+8+9)/3 while dropping out of BEN's (8+8)/2, so they
    // sit 1/3 apart. Scoring Ben's skip as a zero would put him at 5.33 and
    // invent a 3-point rift out of a category he simply opted out of.
    expect(result.meanGap).toBeCloseTo(1 / 3)
  })

  it('counts only nights where BOTH locked', () => {
    const nights = [
      night('1', [card('ana', { story: 8, pacing: 8 }), card('ben', { story: 2, pacing: 2 }, false)]),
      night('2', [card('ana', { story: 8, pacing: 8 }), card('ben', { story: 8, pacing: 8 })]),
    ]
    const result = pairAgreement(nights, 'ana', 'ben')
    expect(result.nights).toBe(1)
    expect(result.meanGap).toBeCloseTo(0)
  })

  it('reports no claim when they have never locked the same night', () => {
    const nights = [night('1', [card('ana', { story: 8, pacing: 8 })])]
    const result = pairAgreement(nights, 'ana', 'ben')
    expect(result.nights).toBe(0)
    expect(result.meanGap).toBeNull()
  })

  it('scores each night under its OWN rubric snapshot', () => {
    // Night 2 re-weights Pacing to nothing, so their Pacing clash stops
    // counting against them there. A single shared weights map would not.
    const nights = [
      night('1', [card('ana', { story: 8, pacing: 10 }), card('ben', { story: 8, pacing: 0 })]),
      night(
        '2',
        [card('ana', { story: 8, pacing: 10 }), card('ben', { story: 8, pacing: 0 })],
        [
          { key: 'story', label: 'Story', weight: 100 },
          { key: 'pacing', label: 'Pacing', weight: 0 },
        ],
      ),
    ]
    const result = pairAgreement(nights, 'ana', 'ben')
    // night 1 gap = |9 − 4| = 5; night 2 gap = 0 -> mean 2.5
    expect(result.meanGap).toBeCloseTo(2.5)
  })
})

describe('sorestSpot / commonGround', () => {
  it('ignore a category with only one shared night', () => {
    const rubric: SessionRubricEntry[] = [...RUBRIC, { key: 'fear', label: 'Fear Factor', weight: 1 }]
    const nights = [
      // one huge one-off clash on Fear Factor...
      night('1', [card('ana', { story: 8, pacing: 8, fear: 10 }), card('ben', { story: 8, pacing: 5, fear: 1 })], rubric),
      night('2', [card('ana', { story: 8, pacing: 8 }), card('ben', { story: 8, pacing: 5 })], rubric),
    ]
    const result = pairAgreement(nights, 'ana', 'ben')
    // ...loses to Pacing, which has actually recurred
    expect(sorestSpot(result)?.category).toBe('pacing')
  })

  it('return null when nothing has recurred', () => {
    const result = pairAgreement([AGREE_ON_STORY[0]], 'ana', 'ben')
    expect(sorestSpot(result)).toBeNull()
    expect(commonGround(result)).toBeNull()
  })
})

describe('tasteTwins', () => {
  const nights: HistoryNight[] = [
    night('1', [
      card('ana', { story: 8, pacing: 8 }),
      card('ben', { story: 8, pacing: 7 }),
      card('cara', { story: 2, pacing: 3 }),
    ]),
    night('2', [
      card('ana', { story: 7, pacing: 7 }),
      card('ben', { story: 7, pacing: 8 }),
      card('cara', { story: 3, pacing: 2 }),
    ]),
    night('3', [
      card('ana', { story: 9, pacing: 9 }),
      card('ben', { story: 9, pacing: 9 }),
      card('cara', { story: 1, pacing: 4 }),
    ]),
  ]

  it('names the closest and furthest groupmate', () => {
    const { twin, foil } = tasteTwins(nights, 'ana', ['ana', 'ben', 'cara'])
    expect(twin?.memberId).toBe('ben')
    expect(foil?.memberId).toBe('cara')
  })

  it('never names the viewer as their own twin', () => {
    const { twin, foil } = tasteTwins(nights, 'ana', ['ana', 'ben', 'cara'])
    expect(twin?.memberId).not.toBe('ana')
    expect(foil?.memberId).not.toBe('ana')
  })

  it('leaves the foil empty in a two-person group', () => {
    // Your only groupmate is not your "foil" — that would be an artifact of
    // having nobody to compare them against.
    const { twin, foil } = tasteTwins(nights, 'ana', ['ana', 'ben'])
    expect(twin?.memberId).toBe('ben')
    expect(foil).toBeNull()
  })

  it('claims nothing below the three-night floor', () => {
    const { twin, foil } = tasteTwins(nights.slice(0, 2), 'ana', ['ana', 'ben', 'cara'])
    expect(twin).toBeNull()
    expect(foil).toBeNull()
  })
})

describe('groupRecap', () => {
  const nights: HistoryNight[] = [
    night('1', [card('ana', { story: 9, pacing: 9 }), card('ben', { story: 9, pacing: 9 })]),
    night('2', [card('ana', { story: 9, pacing: 9 }), card('ben', { story: 1, pacing: 1 })]),
    night('3', [card('ana', { story: 4, pacing: 4 }), card('ben', { story: 4, pacing: 4 })]),
  ]

  it('summarises the run', () => {
    const recap = groupRecap(nights)
    expect(recap.nights).toBe(3)
    expect(recap.averageMashed).toBeCloseTo((9 + 5 + 4) / 3)
    expect(recap.highest?.sessionId).toBe('1')
    expect(recap.lowest?.sessionId).toBe('3')
  })

  it('finds the night they agreed and the night they fell out', () => {
    const recap = groupRecap(nights)
    expect(recap.mostDivisive?.sessionId).toBe('2')
    expect(recap.mostDivisive?.value).toBeCloseTo(8)
    expect(recap.mostUnited?.value).toBeCloseTo(0)
  })

  it('skips nights with no rubric snapshot', () => {
    const recap = groupRecap([...nights, night('4', [card('ana', { story: 9 })], [])])
    expect(recap.nights).toBe(3)
  })

  it('needs two locked cards before a night counts as a spread', () => {
    const recap = groupRecap([night('solo', [card('ana', { story: 9, pacing: 9 })])])
    expect(recap.nights).toBe(1)
    expect(recap.mostDivisive).toBeNull()
    expect(recap.mostUnited).toBeNull()
  })

  it('names the category the group keeps arguing over', () => {
    const recap = groupRecap([
      night('1', [card('ana', { story: 8, pacing: 10 }), card('ben', { story: 8, pacing: 2 })]),
      night('2', [card('ana', { story: 7, pacing: 9 }), card('ben', { story: 7, pacing: 1 })]),
    ])
    expect(recap.sorestCategory?.category).toBe('pacing')
    expect(recap.sorestCategory?.label).toBe('Pacing')
  })
})

describe('myTilt', () => {
  it('compares the viewer to the group over nights they locked', () => {
    const nights: HistoryNight[] = [
      night('1', [card('ana', { story: 10, pacing: 10 }), card('ben', { story: 6, pacing: 6 })]),
      night('2', [card('ana', { story: 8, pacing: 8 }), card('ben', { story: 4, pacing: 4 })]),
    ]
    const tilt = myTilt(nights, 'ana')
    expect(tilt.nights).toBe(2)
    expect(tilt.mine).toBeCloseTo(9)
    expect(tilt.group).toBeCloseTo(7) // (8 + 6) / 2
  })

  it('ignores nights the viewer never locked', () => {
    const nights: HistoryNight[] = [
      night('1', [card('ana', { story: 10, pacing: 10 }, false), card('ben', { story: 6, pacing: 6 })]),
    ]
    const tilt = myTilt(nights, 'ana')
    expect(tilt.nights).toBe(0)
    expect(tilt.mine).toBeNull()
  })
})
