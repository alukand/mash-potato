import { describe, expect, it } from 'vitest'
import { partFromRow, partLabel, partTitleName, samePart, tmdbIdFromRow } from './titleParts'

describe('part labels', () => {
  it('names seasons, specials and episodes the way the server does', () => {
    expect(partLabel({ season: 2, episode: null })).toBe('Season 2')
    expect(partLabel({ season: 0, episode: null })).toBe('Specials')
    expect(partLabel({ season: 2, episode: 3 })).toBe('S2E3')
    expect(partLabel({ season: 0, episode: 1 })).toBe('S0E1')
  })

  it('prefixes the show, trimmed, exactly like ensure_tv_part', () => {
    expect(partTitleName('  Severance ', { season: 2, episode: null })).toBe('Severance Season 2')
    expect(partTitleName('Severance', { season: 2, episode: 3 })).toBe('Severance S2E3')
    expect(partTitleName('Severance', { season: 0, episode: null })).toBe('Severance Specials')
  })
})

describe('the TMDB id a row opens by', () => {
  it("is a film's or show's own, and a part's show's", () => {
    expect(tmdbIdFromRow({ tmdb_id: 95396, show_tmdb_id: null })).toBe(95396)
    expect(tmdbIdFromRow({ tmdb_id: null, show_tmdb_id: 95396 })).toBe(95396)
    expect(tmdbIdFromRow({ tmdb_id: null, show_tmdb_id: null })).toBeNull()
    expect(tmdbIdFromRow({ tmdb_id: 603 })).toBe(603)
  })
})

describe('parts from rows', () => {
  it('reads a part, and nothing for a film or show', () => {
    expect(partFromRow({ season_number: 2, episode_number: 3 })).toEqual({ season: 2, episode: 3 })
    expect(partFromRow({ season_number: 0, episode_number: null })).toEqual({ season: 0, episode: null })
    expect(partFromRow({ season_number: null, episode_number: null })).toBeNull()
    expect(partFromRow({})).toBeNull()
  })

  it('compares parts, treating two "not a part"s as the same title', () => {
    expect(samePart({ season: 1, episode: 2 }, { season: 1, episode: 2 })).toBe(true)
    expect(samePart({ season: 1, episode: 2 }, { season: 1, episode: null })).toBe(false)
    expect(samePart(null, undefined)).toBe(true)
    expect(samePart(null, { season: 1, episode: null })).toBe(false)
  })
})
