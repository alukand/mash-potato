// Seasons and episodes, as titles of their own.
//
// A part is a row in `titles` with season_number (and episode_number) set
// (supabase/migrations/20261001180000_tv_parts.sql). It is filed under its
// show's TMDB id in show_tmdb_id and has NO tmdb_id of its own
// (20261003130000), so the apps from before 1.1, which look a title up by
// (tmdb_id, media_type), never find two rows for one TMDB id.
// The server composes the row's name; this module composes the SAME label so
// the app can show it before the row exists. Pure: no Supabase, unit-tested.

/** A season or an episode of a show. Absent or null means the film or show itself. */
export interface TitlePart {
  season: number
  /** null = the whole season */
  episode: number | null
}

/** The part on its own: "Season 2", "Specials" (TMDB's season 0) or "S2E3". */
export function partLabel(part: TitlePart): string {
  if (part.episode !== null) return `S${part.season}E${part.episode}`
  return part.season === 0 ? 'Specials' : `Season ${part.season}`
}

/** The name ensure_tv_part gives the row: "Severance Season 2", "Severance S2E3". */
export function partTitleName(showName: string, part: TitlePart): string {
  return `${showName.trim()} ${partLabel(part)}`
}

/** A part from a titles row's columns; null for a film or a show. */
export function partFromRow(row: {
  season_number?: number | null
  episode_number?: number | null
}): TitlePart | null {
  if (row.season_number === null || row.season_number === undefined) return null
  return { season: row.season_number, episode: row.episode_number ?? null }
}

/**
 * The TMDB id to open a titles row by: its own, or, for a part (which has
 * none), its show's. Every list that can hold a part reads it this way.
 */
export function tmdbIdFromRow(row: {
  tmdb_id: number | null
  show_tmdb_id?: number | null
}): number | null {
  return row.tmdb_id ?? row.show_tmdb_id ?? null
}

/** Two parts (or two "not a part"s) name the same title. */
export function samePart(a: TitlePart | null | undefined, b: TitlePart | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.season === b.season && a.episode === b.episode
}
