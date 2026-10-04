import { describe, expect, it } from 'vitest'
import {
  GENRES,
  GENRE_ORDER,
  addGenreCategories,
  applyFormats,
  communityWeights,
  genreForTitle,
  genreRowsFor,
  genreRowsFromJson,
  genresOf,
  needsGenrePrompt,
  resolveGenreRound,
  roundRowsFor,
  soloEntriesFor,
  standardRowsFor,
} from './genres'
import type { GenreKey } from './genres'
import { CASUAL_WEIGHTS, DEFAULT_WEIGHTS, defaultRubricRows } from './rubricCatalog'
import type { GroupRubricRow } from './api'

const keys = (rows: { key: string }[]) => rows.map((r) => r.key)
const weightOf = (rows: { key: string; weight: number }[], key: string) =>
  rows.find((r) => r.key === key)?.weight

describe('the genre table', () => {
  it('maps every TMDB id once, and our order names every genre once', () => {
    const ids = GENRES.flatMap((g) => g.tmdbIds)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...GENRE_ORDER].sort()).toEqual(GENRES.map((g) => g.key).sort())
  })

  it('reads a title in TMDB order, skipping ids it does not know', () => {
    expect(genresOf([10770, 878, 27, 14])).toEqual(['fantasySciFi', 'horror'])
    expect(genresOf([])).toEqual([])
  })
})

describe('which genre leads', () => {
  it('is the first genre TMDB lists, by default', () => {
    expect(genreForTitle([878, 27], 'first')).toBe('fantasySciFi')
    expect(genreForTitle([10770, 18], 'first')).toBe('drama')
  })

  it('or the earliest in our order', () => {
    expect(genreForTitle([878, 27], 'order')).toBe('horror')
    expect(genreForTitle([10402, 99], 'order')).toBe('documentary')
    expect(genreForTitle([18, 80], 'order')).toBe('crime')
  })

  it('is no genre for a title without one', () => {
    expect(genreForTitle([], 'first')).toBeNull()
    expect(genreForTitle([10770], 'order')).toBeNull()
  })
})

describe('a genre standard', () => {
  it('adds the genre to your usual rows', () => {
    const rows = addGenreCategories(defaultRubricRows(), 'horror')
    expect(weightOf(rows, 'fearFactor')).toBe(35)
    expect(rows.find((r) => r.key === 'fearFactor')?.label).toBe('Fear Factor')
    expect(rows).toHaveLength(defaultRubricRows().length + 1)
  })

  it('keeps a category you already carry, even switched off', () => {
    const mine = [...defaultRubricRows(), { key: 'fearFactor', label: 'Fear Factor', weight: 10, enabled: false, sort: 9 }]
    const rows = addGenreCategories(mine, 'horror')
    expect(rows.filter((r) => r.key === 'fearFactor')).toEqual([mine[mine.length - 1]])
  })

  it('changes nothing for a genre without changes', () => {
    expect(addGenreCategories(defaultRubricRows(), 'drama')).toEqual(defaultRubricRows())
  })
})

describe('a documentary', () => {
  it('scores Editing in place of Writing, at the same weight and place', () => {
    const before = defaultRubricRows()
    const rows = applyFormats(before, [99])
    const writing = before.find((r) => r.key === 'writing')!
    expect(keys(rows)).not.toContain('writing')
    expect(rows.find((r) => r.key === 'editing')).toEqual({ ...writing, key: 'editing', label: 'Editing' })
  })

  it('does so even when another genre leads', () => {
    const rows = genreRowsFor({ usual: defaultRubricRows(), genre: 'music', genreIds: [10402, 99], own: null, casual: false })
    expect(keys(rows)).toContain('editing')
    expect(keys(rows)).toContain('musicNumbers')
    expect(keys(rows)).not.toContain('writing')
  })

  it('leaves a rubric that already carries Editing alone', () => {
    const mine = [...defaultRubricRows(), { key: 'editing', label: 'Editing', weight: 30, enabled: true, sort: 9 }]
    expect(applyFormats(mine, [99])).toBe(mine)
  })

  it('has a standard with Editing and Insight, and no Writing', () => {
    const rows = standardRowsFor('buff', 'documentary')
    expect(keys(rows)).toEqual(expect.arrayContaining(['editing', 'insight']))
    expect(keys(rows)).not.toContain('writing')
    expect(keys(standardRowsFor('casual', 'documentary'))).toEqual(['enjoyment', 'acting', 'editing', 'insight'])
  })
})

describe('your rubric for a genre', () => {
  const mine: GroupRubricRow[] = [
    { key: 'fearFactor', label: 'Fear Factor', weight: 50, enabled: true, sort: 0 },
    { key: 'story', label: 'Story', weight: 20, enabled: true, sort: 1 },
  ]

  it('replaces the standard for Cinephiles', () => {
    expect(genreRowsFor({ usual: defaultRubricRows(), genre: 'horror', genreIds: [27], own: mine, casual: false })).toEqual(mine)
  })

  it('never applies to Normies, who always get the standard', () => {
    const rows = genreRowsFor({ usual: defaultRubricRows(), genre: 'horror', genreIds: [27], own: mine, casual: true })
    expect(weightOf(rows, 'fearFactor')).toBe(35)
  })

  it('is cleaned when read: catalog keys and labels only', () => {
    expect(
      genreRowsFromJson([
        { key: 'fearFactor', label: 'anything at all', weight: 50, enabled: true, sort: 0 },
        { key: 'madeUp', label: 'Made Up', weight: 20, enabled: true, sort: 1 },
      ]),
    ).toEqual([{ key: 'fearFactor', label: 'Fear Factor', weight: 50, enabled: true, sort: 0 }])
    expect(genreRowsFromJson(null)).toBeNull()
    expect(genreRowsFromJson([{ key: 'story', label: 'Story', weight: 20, enabled: false, sort: 0 }])).toBeNull()
  })
})

describe('a solo card', () => {
  it('is your mode card plus the genre', () => {
    const entries = soloEntriesFor({ mode: 'casual', genre: 'horror', genreIds: [27], own: null })
    expect(entries.map((e) => [e.key, e.weight])).toEqual([
      ['enjoyment', 50], ['acting', 25], ['writing', 25], ['fearFactor', 35],
    ])
  })

  it('relabels an animated title, whatever leads', () => {
    const entries = soloEntriesFor({ mode: 'buff', genre: 'action', genreIds: [28, 16], own: null })
    expect(entries.find((e) => e.key === 'cinematography')?.label).toBe('Animation')
    expect(entries.find((e) => e.key === 'acting')).toEqual({ key: 'acting', label: 'Voice Acting', weight: 21.3 })
    expect(weightOf(entries, 'spectacle')).toBe(20)
  })
})

describe('the community number', () => {
  it('uses each mode standard for the first-listed genre', () => {
    const w = communityWeights([27, 878])
    expect(w.buff).toEqual({ ...DEFAULT_WEIGHTS, fearFactor: 35 })
    expect(w.casual).toEqual({ ...CASUAL_WEIGHTS, fearFactor: 35 })
  })

  it('is the old card for a title with no genre', () => {
    expect(communityWeights([])).toEqual({ casual: CASUAL_WEIGHTS, buff: DEFAULT_WEIGHTS })
  })
})

describe('a round', () => {
  const ana = { userId: 'ana', rows: defaultRubricRows() }
  const ben = { userId: 'ben', rows: defaultRubricRows() }
  const anaHorror: GroupRubricRow[] = [
    { key: 'fearFactor', label: 'Fear Factor', weight: 50, enabled: true, sort: 0 },
    { key: 'story', label: 'Story', weight: 20, enabled: true, sort: 1 },
  ]

  it('blends each member rubric for its genre: own or standard', () => {
    const entries = resolveGenreRound({
      memberRubrics: [ana, ben],
      genreRubrics: new Map([['ana', anaHorror]]),
      genre: 'horror',
      genreIds: [27],
      casual: false,
    })
    expect(weightOf(entries, 'fearFactor')).toBe(42.5) // (50 + 35) / 2
    expect(weightOf(entries, 'story')).toBe(25) // (20 + 30) / 2
    expect(weightOf(entries, 'acting')).toBe(12.5) // (0 + 25) / 2
    expect(entries.find((e) => e.key === 'fearFactor')?.source).toBe('group')
  })

  it('offers the film other genres as extras', () => {
    const entries = resolveGenreRound({
      memberRubrics: [ana, ben],
      genreRubrics: new Map(),
      genre: 'horror',
      genreIds: [27, 878],
      casual: false,
    })
    expect(entries.find((e) => e.key === 'worldbuilding')).toEqual({
      key: 'worldbuilding', label: 'Worldbuilding', weight: 20, source: 'genre',
    })
  })

  it('in a Normie group, is the standard for everyone', () => {
    const casualRows = soloEntriesFor({ mode: 'casual', genre: null, genreIds: [], own: null }).map((e, i) => ({
      ...e, enabled: true, sort: i,
    }))
    const entries = resolveGenreRound({
      memberRubrics: [{ userId: 'ana', rows: casualRows }, { userId: 'ben', rows: casualRows }],
      genreRubrics: new Map([['ana', anaHorror]]),
      genre: 'horror',
      genreIds: [27],
      casual: true,
    })
    expect(entries.map((e) => [e.key, e.weight])).toEqual([
      ['enjoyment', 50], ['acting', 25], ['writing', 25], ['fearFactor', 35],
    ])
  })

  it('splits your card on your rows, a documentary round included', () => {
    const rows = roundRowsFor({
      usual: defaultRubricRows(),
      own: null,
      genre: 'documentary',
      snapshot: [{ key: 'story' }, { key: 'editing' }, { key: 'insight' }],
      casual: false,
    })!
    expect(keys(rows)).toEqual(expect.arrayContaining(['editing', 'insight']))
    expect(keys(rows)).not.toContain('writing')
  })
})

describe('the prompt', () => {
  const decided = new Map<GenreKey, GroupRubricRow[] | null>([['comedy', null]])

  it('asks once, about genres with changes, and never Normies', () => {
    expect(needsGenrePrompt('horror', decided, false)).toBe(true)
    expect(needsGenrePrompt('comedy', decided, false)).toBe(false)
    expect(needsGenrePrompt('drama', decided, false)).toBe(false)
    expect(needsGenrePrompt('horror', decided, true)).toBe(false)
    expect(needsGenrePrompt(null, decided, false)).toBe(false)
    expect(needsGenrePrompt('horror', null, false)).toBe(false)
  })
})
