import { describe, it, expect } from 'vitest'
import {
  BASE_CATEGORIES,
  configuredCategoryKeys,
  mashRubrics,
  resolveSessionRubric,
  resolveSessionRubricTagged,
  RUBRIC_CATALOG,
} from './rubricCatalog'
import type { GroupRubricRow } from './api'

const row = (key: string, over: Partial<GroupRubricRow> = {}): GroupRubricRow => {
  const cat = RUBRIC_CATALOG.find((c) => c.key === key)!
  return { key, label: cat.label, weight: 20, enabled: true, sort: 0, ...over }
}

const baseRows = BASE_CATEGORIES.map((c, i) => row(c.key, { sort: i }))

describe('the catalog', () => {
  it('has exactly six base categories, including writing (directing is optional)', () => {
    expect(BASE_CATEGORIES).toHaveLength(6)
    expect(BASE_CATEGORIES.map((c) => c.key)).toContain('writing')
    expect(BASE_CATEGORIES.map((c) => c.key)).not.toContain('directing')
    expect(RUBRIC_CATALOG.find((c) => c.key === 'directing')?.kind).toBe('optional')
  })

  it('has unique keys throughout', () => {
    const keys = RUBRIC_CATALOG.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
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

  it('adds genre categories at the default weight 20', () => {
    const entries = resolveSessionRubric(baseRows, [27])
    expect(entries.find((e) => e.key === 'fearFactor')?.weight).toBe(20)
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
    expect(entries.find((e) => e.key === 'fearFactor')?.weight).toBe(20)
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
