import { describe, it, expect } from 'vitest'
import { BASE_CATEGORIES, resolveSessionRubric, RUBRIC_CATALOG } from './rubricCatalog'
import type { GroupRubricRow } from './api'

const row = (key: string, over: Partial<GroupRubricRow> = {}): GroupRubricRow => {
  const cat = RUBRIC_CATALOG.find((c) => c.key === key)!
  return { key, label: cat.label, weight: 20, enabled: true, sort: 0, ...over }
}

const baseRows = BASE_CATEGORIES.map((c, i) => row(c.key, { sort: i }))

describe('the catalog', () => {
  it('has exactly six base categories, including directing', () => {
    expect(BASE_CATEGORIES).toHaveLength(6)
    expect(BASE_CATEGORIES.map((c) => c.key)).toContain('directing')
  })

  it('has unique keys throughout', () => {
    const keys = RUBRIC_CATALOG.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
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
