// The rubric catalog: every scoring category the app knows about.
//
// - `base` categories seed every new group (the research-backed core six).
// - `optional` categories can be added by the group owner.
// - `genre` categories can ALSO be added manually, and are auto-included in a
//   session when the title's TMDB genres match (e.g. Humor for a comedy).
//
// Groups store their configuration in public.rubric_categories; each session
// snapshots its resolved category set onto reveal_sessions.rubric so history
// stays coherent when the group later edits its rubric.

import type { GroupRubricRow, SessionRubricEntry } from './api'

export interface CatalogCategory {
  key: string
  label: string
  /** One-line description shown in the "add categories" picker. */
  blurb: string
  kind: 'base' | 'optional' | 'genre'
  /** TMDB genre ids (movie + TV) that auto-suggest this category. */
  genreIds?: number[]
}

export const RUBRIC_CATALOG: CatalogCategory[] = [
  // ---- base: seeded into every group -------------------------------------
  { key: 'story', label: 'Story', blurb: 'Writing, plot, structure', kind: 'base' },
  { key: 'acting', label: 'Acting', blurb: 'Performances and chemistry', kind: 'base' },
  { key: 'directing', label: 'Directing', blurb: 'Vision, tone, cohesion', kind: 'base' },
  { key: 'cinematography', label: 'Cinematography', blurb: 'Framing, lighting, visuals', kind: 'base' },
  { key: 'pacing', label: 'Editing & Pacing', blurb: 'Flow, rhythm, runtime discipline', kind: 'base' },
  { key: 'scoreSound', label: 'Sound & Music', blurb: 'Score, sound design', kind: 'base' },

  // ---- optional: group toggles --------------------------------------------
  { key: 'emotionalImpact', label: 'Emotional Impact', blurb: 'Did it land?', kind: 'optional' },
  { key: 'originality', label: 'Originality', blurb: 'Fresh ideas, surprises', kind: 'optional' },
  { key: 'rewatchability', label: 'Rewatchability', blurb: 'Would you watch it again?', kind: 'optional' },
  { key: 'dialogue', label: 'Dialogue', blurb: 'Lines worth quoting', kind: 'optional' },
  { key: 'ending', label: 'Ending', blurb: 'Payoff and final act', kind: 'optional' },
  { key: 'themes', label: 'Themes', blurb: 'Depth and ideas underneath', kind: 'optional' },
  { key: 'productionDesign', label: 'Production Design', blurb: 'Sets, costumes, the look', kind: 'optional' },

  // ---- genre: auto-included when the title's TMDB genres match ------------
  { key: 'humor', label: 'Humor', blurb: 'How funny is it?', kind: 'genre', genreIds: [35] },
  { key: 'fearFactor', label: 'Fear Factor', blurb: 'How scary is it?', kind: 'genre', genreIds: [27] },
  { key: 'tension', label: 'Tension', blurb: 'Suspense and grip', kind: 'genre', genreIds: [53, 9648] },
  { key: 'spectacle', label: 'Spectacle', blurb: 'Action, stunts, scale', kind: 'genre', genreIds: [28, 10759] },
  { key: 'worldbuilding', label: 'Worldbuilding', blurb: 'The world it pulls you into', kind: 'genre', genreIds: [878, 14, 10765] },
  { key: 'chemistry', label: 'Chemistry', blurb: 'Do you buy the romance?', kind: 'genre', genreIds: [10749] },
  { key: 'insight', label: 'Insight', blurb: 'Did you learn something real?', kind: 'genre', genreIds: [99] },
  { key: 'musicNumbers', label: 'Music & Numbers', blurb: 'The songs and set pieces', kind: 'genre', genreIds: [10402] },
]

export const BASE_CATEGORIES = RUBRIC_CATALOG.filter((c) => c.kind === 'base')

const BY_KEY = new Map(RUBRIC_CATALOG.map((c) => [c.key, c]))

export function catalogCategory(key: string): CatalogCategory | undefined {
  return BY_KEY.get(key)
}

/**
 * Resolve the category set for a NEW session: the group's enabled categories
 * (in their configured order) plus any genre categories matching the title's
 * TMDB genres that the group hasn't already configured (a group that added —
 * or deliberately disabled — a genre category keeps its own setting).
 */
export function resolveSessionRubric(
  groupRows: GroupRubricRow[],
  genreIds: number[],
): SessionRubricEntry[] {
  const configured = new Set(groupRows.map((r) => r.key))
  const entries: SessionRubricEntry[] = [...groupRows]
    .sort((a, b) => a.sort - b.sort)
    .filter((r) => r.enabled)
    .map((r) => ({ key: r.key, label: r.label, weight: r.weight }))

  for (const cat of RUBRIC_CATALOG) {
    if (cat.kind !== 'genre' || configured.has(cat.key)) continue
    if (cat.genreIds?.some((id) => genreIds.includes(id))) {
      entries.push({ key: cat.key, label: cat.label, weight: 20 })
    }
  }
  return entries
}
