// Genre rubrics: which genre leads a title, what each genre's standard
// changes, and the rubric a person scores a title with (solo or in a round).
// Pure: no Supabase, unit-tested in genres.test.ts.
//
// The law (DESIGN.md "Rubric cadence"): every genre has a STANDARD, which is
// your usual rubric plus what the genre adds. Anyone (Cinephiles) can make
// their own rubric for a genre; it is used for their solo ratings and in
// every group they are in. A round blends its members' rubrics for its genre
// and freezes the result in its snapshot. Nobody edits weights for one movie.
//
// The genre keys must match the check constraints in
// supabase/migrations/20261003150000_genre_rubrics.sql.

import type { GroupRubricRow, SessionRubricEntry } from './api'
import {
  casualRubricRows,
  catalogCategory,
  configuredCategoryKeys,
  defaultRubricRows,
  mashRubrics,
  presetRowsFromJson,
  relabelForAnimation,
  resolveSessionRubricTagged,
} from './rubricCatalog'
import type { MemberRubric, ResolvedRubricEntry, TasteMode } from './rubricCatalog'

export type GenreKey =
  | 'action'
  | 'animation'
  | 'comedy'
  | 'crime'
  | 'documentary'
  | 'drama'
  | 'family'
  | 'fantasySciFi'
  | 'history'
  | 'horror'
  | 'music'
  | 'mysteryThriller'
  | 'romance'
  | 'unscripted'
  | 'war'
  | 'western'

/** How a title's lead genre is picked: TMDB's first-listed genre, or our order. */
export type GenreRule = 'first' | 'order'

export interface GenreDef {
  key: GenreKey
  label: string
  /** TMDB genre ids (movie and TV) that belong to this genre. */
  tmdbIds: number[]
  /** Categories the standard adds to your usual rubric, with their weight. */
  adds: { key: string; weight: number }[]
  /** What the standard changes, as the prompt says it. Null: nothing. */
  change: string | null
}

/** TMDB's Documentary genre: documentaries score Editing in place of Writing. */
export const DOCUMENTARY_GENRE_ID = 99

// Today's published genre add-ons, now part of each genre's standard rubric.
// Documentary's Editing swap and Animation's relabels are FORMAT changes:
// they follow a title's genres whatever leads (see applyFormats and
// relabelForAnimation).
export const GENRES: GenreDef[] = [
  { key: 'action', label: 'Action & Adventure', tmdbIds: [28, 12, 10759], adds: [{ key: 'spectacle', weight: 20 }], change: 'adds Spectacle' },
  { key: 'animation', label: 'Animation', tmdbIds: [16], adds: [], change: 'scores Animation in place of Cinematography, and Voice Acting in place of Acting' },
  { key: 'comedy', label: 'Comedy', tmdbIds: [35], adds: [{ key: 'humor', weight: 35 }], change: 'adds Humor' },
  { key: 'crime', label: 'Crime', tmdbIds: [80], adds: [], change: null },
  { key: 'documentary', label: 'Documentary', tmdbIds: [DOCUMENTARY_GENRE_ID], adds: [{ key: 'insight', weight: 20 }], change: 'scores Editing in place of Writing, and adds Insight' },
  { key: 'drama', label: 'Drama', tmdbIds: [18, 10766], adds: [], change: null },
  { key: 'family', label: 'Family', tmdbIds: [10751, 10762], adds: [], change: null },
  { key: 'fantasySciFi', label: 'Fantasy & Sci-Fi', tmdbIds: [14, 878, 10765], adds: [{ key: 'worldbuilding', weight: 20 }], change: 'adds Worldbuilding' },
  { key: 'history', label: 'History', tmdbIds: [36], adds: [], change: null },
  { key: 'horror', label: 'Horror', tmdbIds: [27], adds: [{ key: 'fearFactor', weight: 35 }], change: 'adds Fear Factor' },
  { key: 'music', label: 'Music', tmdbIds: [10402], adds: [{ key: 'musicNumbers', weight: 20 }], change: 'adds Music & Numbers' },
  { key: 'mysteryThriller', label: 'Mystery & Thriller', tmdbIds: [9648, 53], adds: [{ key: 'tension', weight: 20 }], change: 'adds Tension' },
  { key: 'romance', label: 'Romance', tmdbIds: [10749], adds: [{ key: 'chemistry', weight: 20 }], change: 'adds Chemistry' },
  { key: 'unscripted', label: 'Reality & Talk', tmdbIds: [10764, 10763, 10767], adds: [], change: null },
  { key: 'war', label: 'War', tmdbIds: [10752, 10768], adds: [], change: null },
  { key: 'western', label: 'Western', tmdbIds: [37], adds: [], change: null },
]

/** "Our genre order": the genres that change the card most lead. */
export const GENRE_ORDER: GenreKey[] = [
  'documentary',
  'animation',
  'horror',
  'comedy',
  'romance',
  'fantasySciFi',
  'action',
  'mysteryThriller',
  'music',
  'crime',
  'war',
  'western',
  'history',
  'family',
  'unscripted',
  'drama',
]

const BY_KEY = new Map(GENRES.map((g) => [g.key, g]))
const BY_TMDB = new Map<number, GenreKey>()
for (const g of GENRES) for (const id of g.tmdbIds) BY_TMDB.set(id, g.key)

export function isGenreKey(value: unknown): value is GenreKey {
  return typeof value === 'string' && BY_KEY.has(value as GenreKey)
}

export function genreDef(key: GenreKey): GenreDef {
  return BY_KEY.get(key)!
}

export function genreRuleFrom(value: unknown): GenreRule {
  return value === 'order' ? 'order' : 'first'
}

/** A title's genres as ours, in TMDB's order, without repeats. */
export function genresOf(genreIds: number[]): GenreKey[] {
  const out: GenreKey[] = []
  for (const id of genreIds) {
    const key = BY_TMDB.get(id)
    if (key && !out.includes(key)) out.push(key)
  }
  return out
}

/** The genre whose rubric a title is scored with; null when it has none. */
export function genreForTitle(genreIds: number[], rule: GenreRule): GenreKey | null {
  const keys = genresOf(genreIds)
  if (keys.length === 0) return null
  if (rule === 'first') return keys[0]
  return [...keys].sort((a, b) => GENRE_ORDER.indexOf(a) - GENRE_ORDER.indexOf(b))[0]
}

/** Whether a genre's standard differs from your usual rubric (only those prompt). */
export function hasStandardChanges(genre: GenreKey): boolean {
  return genreDef(genre).change !== null
}

const rowLabel = (key: string) => catalogCategory(key)?.label ?? key

/**
 * A genre's standard: your usual rows plus what the genre adds. A category
 * you already carry, on or off, keeps your setting (deliberate disables
 * stick, as they always have).
 */
export function addGenreCategories(rows: GroupRubricRow[], genre: GenreKey | null): GroupRubricRow[] {
  if (!genre) return rows
  const have = new Set(rows.map((r) => r.key))
  let sort = rows.reduce((max, r) => Math.max(max, r.sort), -1)
  const added = genreDef(genre)
    .adds.filter((a) => !have.has(a.key))
    .map((a) => ({ key: a.key, label: rowLabel(a.key), weight: a.weight, enabled: true, sort: ++sort }))
  return [...rows, ...added]
}

/**
 * Format changes that follow a title's genres whatever leads: a documentary
 * scores Editing in place of Writing, at the same weight and in the same
 * place. A rubric that already carries Editing was made that way on purpose
 * and is left alone. (Animation's relabels happen on a card's entries:
 * relabelForAnimation in rubricCatalog.ts.)
 */
export function applyFormats(rows: GroupRubricRow[], genreIds: number[]): GroupRubricRow[] {
  if (!genreIds.includes(DOCUMENTARY_GENRE_ID)) return rows
  if (rows.some((r) => r.key === 'editing')) return rows
  return rows.map((r) => (r.key === 'writing' ? { ...r, key: 'editing', label: rowLabel('editing') } : r))
}

/**
 * A stored genre rubric, cleaned: catalog keys only, catalog labels only
 * (a row's label is never anyone's own text, since rounds show it to the
 * whole group), weights clamped. Null when there is nothing usable.
 */
export function genreRowsFromJson(value: unknown): GroupRubricRow[] | null {
  const rows = presetRowsFromJson(value)
    .filter((r) => catalogCategory(r.key) !== undefined)
    .map((r) => ({ ...r, label: rowLabel(r.key) }))
  return rows.some((r) => r.enabled) ? rows : null
}

/**
 * The rows a person scores a title with: their own rubric for its genre, or
 * the standard (their usual rows plus the genre), with the title's format
 * changes. Normies always get the standard: their mode has nothing to set up.
 */
export function genreRowsFor(input: {
  /** In a group: your rows there. Solo: your mode's card. */
  usual: GroupRubricRow[]
  genre: GenreKey | null
  genreIds: number[]
  /** Your own rubric for the genre; null or undefined means the standard. */
  own: GroupRubricRow[] | null | undefined
  casual: boolean
}): GroupRubricRow[] {
  const mine = !input.casual && input.own && input.own.some((r) => r.enabled) ? input.own : null
  return applyFormats(mine ?? addGenreCategories(input.usual, input.genre), input.genreIds)
}

/** Your mode's usual card, as rows. */
export function usualRowsFor(mode: TasteMode): GroupRubricRow[] {
  return mode === 'casual' ? casualRubricRows() : defaultRubricRows()
}

const toEntries = (rows: GroupRubricRow[]): SessionRubricEntry[] =>
  [...rows]
    .filter((r) => r.enabled)
    .sort((a, b) => a.sort - b.sort)
    .map((r) => ({ key: r.key, label: r.label, weight: r.weight }))

/** A solo card: your rubric for the title's genre, with animation's relabels. */
export function soloEntriesFor(input: {
  mode: TasteMode
  genre: GenreKey | null
  genreIds: number[]
  own: GroupRubricRow[] | null | undefined
}): SessionRubricEntry[] {
  const rows = genreRowsFor({
    usual: usualRowsFor(input.mode),
    genre: input.genre,
    genreIds: input.genreIds,
    own: input.own,
    casual: input.mode === 'casual',
  })
  return relabelForAnimation(toEntries(rows), input.genreIds)
}

/** Weights by category key, from a card's entries. */
export function weightsOf(entries: SessionRubricEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((e) => [e.key, e.weight]))
}

/**
 * The community numbers' weights for a title: each mode's STANDARD card for
 * the title's first-listed genre, so the number is the same for everyone
 * whatever their own rubrics and rules.
 */
export function communityWeights(genreIds: number[]): { casual: Record<string, number>; buff: Record<string, number> } {
  const genre = genreForTitle(genreIds, 'first')
  const weights = (mode: TasteMode) => weightsOf(soloEntriesFor({ mode, genre, genreIds, own: null }))
  return { casual: weights('casual'), buff: weights('buff') }
}

/**
 * A round's rubric: every member's rows for its genre (their own, or the
 * standard on their usual rows), blended (mashRubrics), plus the other
 * genres' categories as extras and animation's relabels. Frozen into the
 * round's snapshot by whoever starts it.
 */
export function resolveGenreRound(input: {
  /** Each member's usual rows in this group (fetchGroupRubrics). */
  memberRubrics: MemberRubric[]
  /** Each member's own rubric for the round's genre, by user id (absent: standard). */
  genreRubrics: Map<string, GroupRubricRow[] | null>
  genre: GenreKey | null
  genreIds: number[]
  casual: boolean
}): ResolvedRubricEntry[] {
  const perMember: MemberRubric[] = input.memberRubrics.map((m) => ({
    userId: m.userId,
    rows: genreRowsFor({
      usual: m.rows,
      genre: input.genre,
      genreIds: input.genreIds,
      own: input.genreRubrics.get(m.userId),
      casual: input.casual,
    }),
  }))
  const mashed = mashRubrics(perMember)
  const rows =
    mashed.length > 0
      ? mashed
      : genreRowsFor({
          usual: input.casual ? casualRubricRows() : defaultRubricRows(),
          genre: input.genre,
          genreIds: input.genreIds,
          own: null,
          casual: input.casual,
        })
  return resolveSessionRubricTagged(rows, input.genreIds, configuredCategoryKeys(perMember))
}

/**
 * Your rows for a round already under way, to split its card into your
 * categories and the extras. A round stores its genre, not its TMDB genres,
 * so a documentary round is recognised by its snapshot: Editing without
 * Writing.
 */
export function roundRowsFor(input: {
  usual: GroupRubricRow[] | null
  own: GroupRubricRow[] | null | undefined
  genre: GenreKey | null
  snapshot: { key: string }[]
  casual: boolean
}): GroupRubricRow[] | null {
  if (!input.usual && !input.own) return null
  const keys = new Set(input.snapshot.map((e) => e.key))
  const documentary = keys.has('editing') && !keys.has('writing')
  return genreRowsFor({
    usual: input.usual ?? [],
    genre: input.genre,
    genreIds: documentary ? [DOCUMENTARY_GENRE_ID] : [],
    own: input.own,
    casual: input.casual,
  })
}

/** Whether to ask someone about a genre: never Normies, only genres with changes, once. */
export function needsGenrePrompt(
  genre: GenreKey | null,
  decided: Map<GenreKey, GroupRubricRow[] | null> | null,
  casual: boolean,
): genre is GenreKey {
  return !casual && genre !== null && decided !== null && hasStandardChanges(genre) && !decided.has(genre)
}

/** The standard rubric for a genre on a mode's card, as editable rows. */
export function standardRowsFor(mode: TasteMode, genre: GenreKey): GroupRubricRow[] {
  return genreRowsFor({
    usual: usualRowsFor(mode),
    genre,
    genreIds: genre === 'documentary' ? [DOCUMENTARY_GENRE_ID] : [],
    own: null,
    casual: mode === 'casual',
  })
}

/** "Our genre order", as a sentence for the settings. */
export function genreOrderText(): string {
  const leaders = GENRE_ORDER.slice(0, 9).map((k) => genreDef(k).label)
  return `${leaders.join(', ')}, then the rest`
}
