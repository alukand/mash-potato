import { describe, it, expect } from 'vitest'
import {
  BASE_CATEGORIES,
  CASUAL_WEIGHTS,
  casualRubricEntries,
  casualRubricRows,
  configuredCategoryKeys,
  DEFAULT_WEIGHTS,
  mashRubrics,
  resolveSessionRubric,
  resolveSessionRubricTagged,
  rubricRowsForMode,
  soloRubricEntriesFor,
  soloWeightsFor,
  splitRubricForMember,
  RUBRIC_CATALOG,
  TASTE_MODES,
} from './rubricCatalog'
import type { GroupRubricRow } from './api'

const row = (key: string, over: Partial<GroupRubricRow> = {}): GroupRubricRow => {
  const cat = RUBRIC_CATALOG.find((c) => c.key === key)!
  return { key, label: cat.label, weight: 20, enabled: true, sort: 0, ...over }
}

const baseRows = BASE_CATEGORIES.map((c, i) => row(c.key, { sort: i }))

describe('the catalog', () => {
  it('has exactly seven base categories, including writing and emotional impact', () => {
    expect(BASE_CATEGORIES).toHaveLength(7)
    expect(BASE_CATEGORIES.map((c) => c.key)).toContain('writing')
    expect(BASE_CATEGORIES.map((c) => c.key)).toContain('emotionalImpact')
    expect(BASE_CATEGORIES.map((c) => c.key)).not.toContain('directing')
    expect(RUBRIC_CATALOG.find((c) => c.key === 'directing')?.kind).toBe('optional')
  })

  it('weights emotional impact deliberately in the default rubric', () => {
    expect(DEFAULT_WEIGHTS.emotionalImpact).toBe(25)
  })

  it('has unique keys throughout', () => {
    const keys = RUBRIC_CATALOG.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps enjoyment out of the base set but in the catalog', () => {
    expect(RUBRIC_CATALOG.find((c) => c.key === 'enjoyment')?.kind).toBe('optional')
    expect(BASE_CATEGORIES.map((c) => c.key)).not.toContain('enjoyment')
  })
})

describe('taste modes', () => {
  it('weights enjoyment heaviest on the casual card, at half the total', () => {
    const total = Object.values(CASUAL_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(CASUAL_WEIGHTS.enjoyment / total).toBe(0.5)
    expect(Math.max(...Object.values(CASUAL_WEIGHTS))).toBe(CASUAL_WEIGHTS.enjoyment)
  })

  it('builds the casual rubric in order: enjoyment, acting, writing', () => {
    expect(casualRubricEntries().map((e) => e.key)).toEqual(['enjoyment', 'acting', 'writing'])
    expect(casualRubricEntries()[0]).toMatchObject({ label: 'Enjoyment', weight: 50 })
  })

  it('routes solo rubric and weights by mode', () => {
    expect(soloRubricEntriesFor('casual')).toHaveLength(3)
    expect(soloRubricEntriesFor('buff')).toHaveLength(BASE_CATEGORIES.length)
    expect(soloWeightsFor('casual')).toBe(CASUAL_WEIGHTS)
    expect(soloWeightsFor('buff')).toBe(DEFAULT_WEIGHTS)
  })

  it('names both crowds', () => {
    expect(TASTE_MODES.casual.plural).toBe('Normies')
    expect(TASTE_MODES.buff.plural).toBe('Cinephiles')
  })

  it('builds seedable group rows per mode', () => {
    expect(casualRubricRows().map((r) => r.key)).toEqual(['enjoyment', 'acting', 'writing'])
    expect(casualRubricRows().every((r) => r.enabled)).toBe(true)
    expect(rubricRowsForMode('casual')).toHaveLength(3)
    expect(rubricRowsForMode('buff')).toHaveLength(BASE_CATEGORIES.length)
  })
})

describe('a casual group scores its own way', () => {
  // The bug that moved the mode onto the group: when a casual member's rubric
  // was mashed with buff members', Enjoyment (their heaviest) was averaged
  // down to the LIGHTEST thing on their card. A casual GROUP can't drift.
  const casualMembers = ['a', 'b', 'c'].map((userId) => ({
    userId,
    rows: casualRubricRows(),
  }))

  it('keeps enjoyment heaviest no matter how many members', () => {
    const effective = mashRubrics(casualMembers)
    expect(effective.map((r) => r.key)).toEqual(['enjoyment', 'acting', 'writing'])
    const enjoyment = effective.find((r) => r.key === 'enjoyment')!
    expect(enjoyment.weight).toBe(50)
    expect(Math.max(...effective.map((r) => r.weight))).toBe(enjoyment.weight)
  })

  it('lets a genre night add its category without displacing enjoyment', () => {
    const resolved = resolveSessionRubric(mashRubrics(casualMembers), [35]) // comedy
    expect(resolved.map((e) => e.key)).toContain('humor')
    const enjoyment = resolved.find((e) => e.key === 'enjoyment')!
    const humor = resolved.find((e) => e.key === 'humor')!
    expect(enjoyment.weight).toBeGreaterThan(humor.weight)
  })

  it('treats the whole session rubric as core when allCore is set', () => {
    const resolved = resolveSessionRubric(mashRubrics(casualMembers), [35])
    const myRows = casualRubricRows()
    // without the flag, the genre add-on would be an opt-in extra
    expect(splitRubricForMember(resolved, myRows).extras.map((e) => e.key)).toEqual(['humor'])
    const split = splitRubricForMember(resolved, myRows, true)
    expect(split.extras).toEqual([])
    expect(split.core).toHaveLength(resolved.length)
  })
})

describe('mashRubrics', () => {
  it('averages weights across members', () => {
    const effective = mashRubrics([
      { userId: 'a', rows: [row('story', { weight: 30 })] },
      { userId: 'b', rows: [row('story', { weight: 20 })] },
    ])
    expect(effective).toHaveLength(1)
    expect(effective[0]).toMatchObject({ key: 'story', weight: 25 })
  })

  it('splits the difference when only some members carry a category', () => {
    // Two members; only one has Humor at 20 -> effective 10.
    const effective = mashRubrics([
      { userId: 'a', rows: [row('story', { weight: 20 }), row('humor', { weight: 20, sort: 9 })] },
      { userId: 'b', rows: [row('story', { weight: 20 })] },
    ])
    expect(effective.find((r) => r.key === 'humor')?.weight).toBe(10)
    expect(effective.find((r) => r.key === 'story')?.weight).toBe(20)
  })

  it('treats a disabled row like an absent one', () => {
    const effective = mashRubrics([
      { userId: 'a', rows: [row('story', { weight: 20 }), row('humor', { weight: 30, sort: 9 })] },
      { userId: 'b', rows: [row('story', { weight: 20 }), row('humor', { weight: 30, sort: 9, enabled: false })] },
    ])
    expect(effective.find((r) => r.key === 'humor')?.weight).toBe(15)
  })

  it('drops categories nobody carries enabled, and empty input', () => {
    const effective = mashRubrics([
      { userId: 'a', rows: [row('story', { weight: 20 }), row('humor', { enabled: false, sort: 9 })] },
      { userId: 'b', rows: [row('story', { weight: 20 })] },
    ])
    expect(effective.map((r) => r.key)).toEqual(['story'])
    expect(mashRubrics([])).toEqual([])
  })

  it('keeps the base order via the lowest personal sort', () => {
    const effective = mashRubrics([
      { userId: 'a', rows: [row('acting', { sort: 1 }), row('story', { sort: 0 })] },
    ])
    expect(effective.map((r) => r.key)).toEqual(['story', 'acting'])
  })
})

describe('resolveSessionRubric', () => {
  it('returns the enabled group rows in sort order', () => {
    const rows = [row('acting', { sort: 1 }), row('story', { sort: 0 })]
    expect(resolveSessionRubric(rows, []).map((e) => e.key)).toEqual(['story', 'acting'])
  })

  it('excludes disabled rows', () => {
    const rows = [row('story', { sort: 0 }), row('acting', { sort: 1, enabled: false })]
    expect(resolveSessionRubric(rows, []).map((e) => e.key)).toEqual(['story'])
  })

  it('adds Humor for a comedy and Fear Factor for a horror', () => {
    const comedy = resolveSessionRubric(baseRows, [35])
    expect(comedy.map((e) => e.key)).toContain('humor')
    const horror = resolveSessionRubric(baseRows, [27])
    expect(horror.map((e) => e.key)).toContain('fearFactor')
    expect(horror.map((e) => e.key)).not.toContain('humor')
  })

  it('adds Humor and Fear Factor HEAVY (they define their nights)', () => {
    const comedy = resolveSessionRubric(baseRows, [35])
    expect(comedy.find((e) => e.key === 'humor')?.weight).toBe(35)
    const horror = resolveSessionRubric(baseRows, [27])
    expect(horror.find((e) => e.key === 'fearFactor')?.weight).toBe(35)
    // Heavier than any base weight: the add-on carries the night.
    const maxBase = Math.max(...Object.values(DEFAULT_WEIGHTS))
    expect(35).toBeGreaterThan(maxBase)
  })

  it('adds other genre categories at the default weight 20', () => {
    const entries = resolveSessionRubric(baseRows, [53]) // thriller -> tension
    expect(entries.find((e) => e.key === 'tension')?.weight).toBe(20)
  })

  it('respects a group row over the genre auto-add (including disabled)', () => {
    const withHumor = [...baseRows, row('humor', { sort: 10, weight: 50 })]
    const entries = resolveSessionRubric(withHumor, [35])
    expect(entries.filter((e) => e.key === 'humor')).toHaveLength(1)
    expect(entries.find((e) => e.key === 'humor')?.weight).toBe(50)

    const humorOff = [...baseRows, row('humor', { sort: 10, enabled: false })]
    expect(resolveSessionRubric(humorOff, [35]).map((e) => e.key)).not.toContain('humor')
  })

  it('matches TV genre ids too (Sci-Fi & Fantasy 10765 → worldbuilding)', () => {
    expect(resolveSessionRubric(baseRows, [10765]).map((e) => e.key)).toContain('worldbuilding')
  })

  it('adds nothing for unmatched genres', () => {
    expect(resolveSessionRubric(baseRows, [36])).toHaveLength(baseRows.length) // History
  })
})

describe('configuredCategoryKeys + the disabled-by-everyone pipeline', () => {
  const members = [
    { userId: 'a', rows: [row('story', { weight: 20 }), row('humor', { sort: 9, enabled: false })] },
    { userId: 'b', rows: [row('story', { weight: 20 })] },
  ]

  it('collects keys from every member, enabled or not', () => {
    const keys = configuredCategoryKeys(members)
    expect(keys.has('story')).toBe(true)
    expect(keys.has('humor')).toBe(true)
    expect(configuredCategoryKeys([])).toEqual(new Set())
  })

  it('a category the whole group disabled stays out on genre nights', () => {
    // mashRubrics drops humor (nobody enabled) -> without configuredKeys the
    // comedy auto-add would re-add it; with them, the disable sticks.
    const mashed = mashRubrics(members)
    expect(mashed.map((r) => r.key)).not.toContain('humor')

    const withoutFix = resolveSessionRubric(mashed, [35])
    expect(withoutFix.map((e) => e.key)).toContain('humor') // the old bug

    const withFix = resolveSessionRubric(mashed, [35], configuredCategoryKeys(members))
    expect(withFix.map((e) => e.key)).not.toContain('humor')
  })

  it('a category one member carries keeps its mashed weight (no duplicate add)', () => {
    const carried = [
      { userId: 'a', rows: [row('story', { weight: 20 }), row('humor', { sort: 9, weight: 20 })] },
      { userId: 'b', rows: [row('story', { weight: 20 })] },
    ]
    const mashed = mashRubrics(carried)
    const entries = resolveSessionRubric(mashed, [35], configuredCategoryKeys(carried))
    expect(entries.filter((e) => e.key === 'humor')).toHaveLength(1)
    expect(entries.find((e) => e.key === 'humor')?.weight).toBe(10)
  })

  it('an unconfigured genre category is still auto-added', () => {
    const mashed = mashRubrics(members)
    const entries = resolveSessionRubric(mashed, [27], configuredCategoryKeys(members))
    // Fear Factor is a HEAVY add-on (35): it carries horror night.
    expect(entries.find((e) => e.key === 'fearFactor')?.weight).toBe(35)
  })
})

describe('resolveSessionRubricTagged', () => {
  it('tags group rows as group and auto-adds as genre', () => {
    const entries = resolveSessionRubricTagged(baseRows, [27])
    expect(entries.find((e) => e.key === 'story')?.source).toBe('group')
    expect(entries.find((e) => e.key === 'fearFactor')?.source).toBe('genre')
  })

  it('a group-configured genre category is tagged group, not genre', () => {
    const withHumor = [...baseRows, row('humor', { sort: 10, weight: 50 })]
    const entries = resolveSessionRubricTagged(withHumor, [35])
    expect(entries.find((e) => e.key === 'humor')?.source).toBe('group')
  })

  it('the untagged wrapper strips provenance but keeps the same entries', () => {
    const tagged = resolveSessionRubricTagged(baseRows, [35])
    const plain = resolveSessionRubric(baseRows, [35])
    expect(plain).toEqual(tagged.map(({ key, label, weight }) => ({ key, label, weight })))
    expect(Object.keys(plain[0])).not.toContain('source')
  })
})

describe('animated titles (genre 16)', () => {
  it('REPLACES Cinematography with Animation at the same weight', () => {
    const entries = resolveSessionRubric(baseRows, [16])
    const swapped = entries.find((e) => e.key === 'cinematography')
    expect(swapped?.label).toBe('Animation')
    expect(swapped?.weight).toBe(20) // inherits the group's cinematography weight
    expect(entries.map((e) => e.label)).not.toContain('Cinematography')
    // exactly one Animation entry: no genre auto-add on top of the swap
    expect(entries.filter((e) => e.label === 'Animation')).toHaveLength(1)
  })

  it('scores Voice Acting in place of Acting, slightly lighter', () => {
    // baseRows carry acting at weight 20 -> voice acting at 20 * 0.85 = 17.
    const acting = baseRows.find((r) => r.key === 'acting')!.weight
    const entries = resolveSessionRubric(baseRows, [16])
    const voice = entries.find((e) => e.key === 'acting')
    expect(voice?.label).toBe('Voice Acting')
    expect(voice?.weight).toBe(17)
    expect(voice!.weight).toBeLessThan(acting)
  })

  it('keeps the KEYS so scores and history stay coherent', () => {
    const keys = resolveSessionRubric(baseRows, [16]).map((e) => e.key)
    expect(keys).toContain('acting')
    expect(keys).toContain('cinematography')
    expect(keys).not.toContain('voiceActing')
  })

  it('falls back to the Animation add-on when the group carries no Cinematography', () => {
    const noCinema = baseRows.filter((r) => r.key !== 'cinematography')
    const entries = resolveSessionRubric(noCinema, [16], noCinema.map((r) => r.key))
    const anim = entries.find((e) => e.key === 'animation')
    expect(anim?.label).toBe('Animation')
    expect(anim?.weight).toBe(20)
    expect(entries.filter((e) => e.label === 'Animation')).toHaveLength(1)
  })

  it('leaves Acting and Cinematography untouched for live-action titles', () => {
    const entries = resolveSessionRubric(baseRows, [28]) // action
    expect(entries.find((e) => e.key === 'acting')?.label).toBe('Acting')
    expect(entries.find((e) => e.key === 'acting')?.weight).toBe(20)
    expect(entries.find((e) => e.key === 'cinematography')?.label).toBe('Cinematography')
    expect(entries.map((e) => e.key)).not.toContain('animation')
  })
})

describe('splitRubricForMember', () => {
  const snapshot = [
    { key: 'story', label: 'Story', weight: 20 },
    { key: 'acting', label: 'Acting', weight: 20 },
    { key: 'humor', label: 'Humor', weight: 35 },
  ]

  it('marks session categories outside your rubric as opt-in extras', () => {
    const mine = [row('story'), row('acting')]
    const { core, extras } = splitRubricForMember(snapshot, mine)
    expect(core.map((e) => e.key)).toEqual(['story', 'acting'])
    expect(extras.map((e) => e.key)).toEqual(['humor'])
  })

  it('treats disabled rows as not carried', () => {
    const mine = [row('story'), row('acting', { enabled: false })]
    const { core, extras } = splitRubricForMember(snapshot, mine)
    expect(core.map((e) => e.key)).toEqual(['story'])
    expect(extras.map((e) => e.key)).toEqual(['acting', 'humor'])
  })

  it('falls back to everything-core when you have no rubric', () => {
    expect(splitRubricForMember(snapshot, null).core).toHaveLength(3)
    expect(splitRubricForMember(snapshot, []).extras).toHaveLength(0)
  })

  it('falls back to everything-core when your rubric shares nothing', () => {
    const mine = [row('pacing')]
    const { core, extras } = splitRubricForMember(snapshot, mine)
    expect(core).toHaveLength(3)
    expect(extras).toHaveLength(0)
  })
})
