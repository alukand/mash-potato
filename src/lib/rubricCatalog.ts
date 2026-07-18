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
  /**
   * Session weight when auto-added for a matching genre (default 20). Part of
   * the published genre table: Humor carries a comedy night and Fear Factor a
   * horror night, so they land HEAVIER than any base category.
   */
  addOnWeight?: number
}

export const RUBRIC_CATALOG: CatalogCategory[] = [
  // ---- base: seeded into every group -------------------------------------
  { key: 'story', label: 'Story', blurb: 'Plot, structure, payoff', kind: 'base' },
  { key: 'acting', label: 'Acting', blurb: 'Performances and chemistry', kind: 'base' },
  { key: 'writing', label: 'Writing', blurb: 'Script, dialogue, how it’s told', kind: 'base' },
  { key: 'cinematography', label: 'Cinematography', blurb: 'Framing, lighting, visuals', kind: 'base' },
  { key: 'pacing', label: 'Pacing', blurb: 'Flow, rhythm, runtime discipline', kind: 'base' },
  { key: 'scoreSound', label: 'Score & Soundtrack', blurb: 'Music, sound design', kind: 'base' },
  { key: 'emotionalImpact', label: 'Emotional Impact', blurb: 'Did it land?', kind: 'base' },

  // ---- optional: group toggles --------------------------------------------
  { key: 'directing', label: 'Directing', blurb: 'Vision, tone, cohesion', kind: 'optional' },
  { key: 'originality', label: 'Originality', blurb: 'Fresh ideas, surprises', kind: 'optional' },
  { key: 'rewatchability', label: 'Rewatchability', blurb: 'Would you watch it again?', kind: 'optional' },
  { key: 'dialogue', label: 'Dialogue', blurb: 'Lines worth quoting', kind: 'optional' },
  { key: 'ending', label: 'Ending', blurb: 'Payoff and final act', kind: 'optional' },
  { key: 'themes', label: 'Themes', blurb: 'Depth and ideas underneath', kind: 'optional' },
  { key: 'productionDesign', label: 'Production Design', blurb: 'Sets, costumes, the look', kind: 'optional' },

  // ---- genre: auto-included when the title's TMDB genres match ------------
  // Humor and Fear Factor define their nights: heavier than any base weight.
  { key: 'humor', label: 'Humor', blurb: 'How funny is it?', kind: 'genre', genreIds: [35], addOnWeight: 35 },
  { key: 'fearFactor', label: 'Fear Factor', blurb: 'How scary is it?', kind: 'genre', genreIds: [27], addOnWeight: 35 },
  { key: 'tension', label: 'Tension', blurb: 'Suspense and grip', kind: 'genre', genreIds: [53, 9648] },
  { key: 'spectacle', label: 'Spectacle', blurb: 'Action, stunts, scale', kind: 'genre', genreIds: [28, 10759] },
  { key: 'worldbuilding', label: 'Worldbuilding', blurb: 'The world it pulls you into', kind: 'genre', genreIds: [878, 14, 10765] },
  { key: 'chemistry', label: 'Chemistry', blurb: 'Do you buy the romance?', kind: 'genre', genreIds: [10749] },
  { key: 'insight', label: 'Insight', blurb: 'Did you learn something real?', kind: 'genre', genreIds: [99] },
  { key: 'musicNumbers', label: 'Music & Numbers', blurb: 'The songs and set pieces', kind: 'genre', genreIds: [10402] },
  { key: 'animation', label: 'Animation', blurb: 'Fluidity, style, craft of the animation', kind: 'genre', genreIds: [16] },
]

/** TMDB "Animation" genre (movies and TV share id 16). */
export const ANIMATION_GENRE_ID = 16
/**
 * On animated nights two base categories change clothes: Cinematography
 * BECOMES Animation (same weight — it is the visual craft category), and
 * Acting becomes Voice Acting, weighted a touch lighter because more of the
 * craft lives in the animation itself. Keys never change, so scores,
 * backfills, and cross-title history stay coherent.
 */
const VOICE_ACTING_WEIGHT_FACTOR = 0.85

export const BASE_CATEGORIES = RUBRIC_CATALOG.filter((c) => c.kind === 'base')

/**
 * The app-wide DEFAULT rubric weights: story/acting/cinematography count for
 * more than pacing/score, and Emotional Impact carries its own deliberate
 * weight ("did it land" moves people more than craft line-items). New groups
 * seed from this (and can reset to it), and every solo/community rating uses
 * exactly this rubric. Keep in sync with the seed_member_rubric() migrations.
 */
export const DEFAULT_WEIGHTS: Record<string, number> = {
  story: 30,
  acting: 25,
  writing: 20,
  cinematography: 25,
  pacing: 15,
  scoreSound: 15,
  emotionalImpact: 25,
}

/** The default rubric as ordered snapshot entries (base six + default weights). */
export function defaultRubricEntries(): SessionRubricEntry[] {
  return BASE_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    weight: DEFAULT_WEIGHTS[c.key] ?? 20,
  }))
}

/** The default rubric as group-editor rows (for seeding / reset). */
export function defaultRubricRows(): GroupRubricRow[] {
  return BASE_CATEGORIES.map((c, i) => ({
    key: c.key,
    label: c.label,
    weight: DEFAULT_WEIGHTS[c.key] ?? 20,
    enabled: true,
    sort: i,
  }))
}

const BY_KEY = new Map(RUBRIC_CATALOG.map((c) => [c.key, c]))
const BY_LABEL = new Map(RUBRIC_CATALOG.map((c) => [c.label, c]))

export function catalogCategory(key: string): CatalogCategory | undefined {
  return BY_KEY.get(key)
}

/**
 * Catalog lookup by DISPLAY label — for per-round relabels (Cinematography
 * shows as Animation on animated nights) where the key alone would fetch the
 * wrong definition.
 */
export function catalogCategoryByLabel(label: string): CatalogCategory | undefined {
  return BY_LABEL.get(label)
}

/** One member's personal rubric rows within a group. */
export interface MemberRubric {
  userId: string
  rows: GroupRubricRow[]
}

/**
 * Split a session's rubric snapshot into the categories YOU carry (core:
 * always on your card) and the extras (genre add-ons and other members'
 * picks). Extras are OPT-IN per member at scoring time: skip one and the
 * key simply never lands on your card, so its weight drops out of your
 * personal denominator and the group mean averages only the people who
 * rated it. Nobody's score is ever imputed.
 *
 * Members without a personal rubric (or whose rubric shares nothing with
 * the snapshot) treat everything as core: a card needs at least one slider.
 */
export function splitRubricForMember<T extends { key: string }>(
  sessionRubric: T[],
  myRows: { key: string; enabled: boolean }[] | null | undefined,
): { core: T[]; extras: T[] } {
  if (!myRows || myRows.length === 0) return { core: sessionRubric, extras: [] }
  const mine = new Set(myRows.filter((r) => r.enabled).map((r) => r.key))
  const core = sessionRubric.filter((e) => mine.has(e.key))
  if (core.length === 0) return { core: sessionRubric, extras: [] }
  return { core, extras: sessionRubric.filter((e) => !mine.has(e.key)) }
}

/** Parse a preset's jsonb rows (user_rubrics.rows) into validated rubric rows. */
export function presetRowsFromJson(value: unknown): GroupRubricRow[] {
  if (!Array.isArray(value)) return []
  const rows: GroupRubricRow[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { key, label, weight, enabled, sort } = item as Record<string, unknown>
    if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)) continue
    rows.push({
      key,
      label: typeof label === 'string' && label.length > 0 ? label.slice(0, 40) : key,
      weight:
        typeof weight === 'number' && Number.isFinite(weight)
          ? Math.min(1000, Math.max(0, Math.round(weight)))
          : 20,
      enabled: typeof enabled === 'boolean' ? enabled : true,
      sort: typeof sort === 'number' && Number.isFinite(sort) ? sort : rows.length,
    })
  }
  return rows
}

/**
 * Mash every member's personal rubric into the group's EFFECTIVE rubric:
 * each category's weight is the mean of what each member gives it, counting 0
 * for members who don't carry (or disabled) the category. So with two members
 * where only one weights Humor at 20, Humor lands at an effective 10 — the
 * difference is split across the group.
 *
 * A category is dropped entirely only when NO member carries it enabled.
 * Order: lowest personal `sort` wins (base categories keep their seeded order).
 */
export function mashRubrics(memberRubrics: MemberRubric[]): GroupRubricRow[] {
  const memberCount = memberRubrics.length
  if (memberCount === 0) return []

  const byKey = new Map<string, { label: string; total: number; sort: number }>()
  for (const member of memberRubrics) {
    for (const row of member.rows) {
      if (!row.enabled) continue
      const existing = byKey.get(row.key)
      if (existing) {
        existing.total += row.weight
        existing.sort = Math.min(existing.sort, row.sort)
      } else {
        byKey.set(row.key, { label: row.label, total: row.weight, sort: row.sort })
      }
    }
  }

  return [...byKey.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      // one decimal is plenty; keeps session snapshots readable
      weight: Math.round((v.total / memberCount) * 10) / 10,
      enabled: true,
      sort: v.sort,
    }))
    .filter((r) => r.weight > 0)
    .sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key))
}

/**
 * The union of category keys ANY member has configured, enabled or not.
 * This is what makes deliberate disables stick: mashRubrics drops a category
 * everyone disabled, so the mashed rows alone can't tell "never configured"
 * from "configured off" — the raw member rubrics can.
 */
export function configuredCategoryKeys(memberRubrics: MemberRubric[]): Set<string> {
  const keys = new Set<string>()
  for (const member of memberRubrics) {
    for (const r of member.rows) keys.add(r.key)
  }
  return keys
}

/** A resolved session category with its provenance. */
export interface ResolvedRubricEntry extends SessionRubricEntry {
  /** 'group': from the mashed member rubrics. 'genre': auto-added for this title. */
  source: 'group' | 'genre'
}

/**
 * Resolve the category set for a NEW session: the group's enabled categories
 * (in their configured order) plus any genre categories matching the title's
 * TMDB genres that the group hasn't already configured (a group that added —
 * or deliberately disabled — a genre category keeps its own setting).
 *
 * `configuredKeys` should be configuredCategoryKeys(raw member rubrics); it
 * defaults to the groupRows' own keys for callers without the raw rubrics,
 * which cannot see disabled-by-everyone categories (they get re-added).
 */
export function resolveSessionRubricTagged(
  groupRows: GroupRubricRow[],
  genreIds: number[],
  configuredKeys?: Iterable<string>,
): ResolvedRubricEntry[] {
  const configured = new Set(configuredKeys ?? [])
  for (const r of groupRows) configured.add(r.key)

  const entries: ResolvedRubricEntry[] = [...groupRows]
    .sort((a, b) => a.sort - b.sort)
    .filter((r) => r.enabled)
    .map((r) => ({ key: r.key, label: r.label, weight: r.weight, source: 'group' as const }))

  for (const cat of RUBRIC_CATALOG) {
    if (cat.kind !== 'genre' || configured.has(cat.key)) continue
    if (cat.genreIds?.some((id) => genreIds.includes(id))) {
      entries.push({
        key: cat.key,
        label: cat.label,
        weight: cat.addOnWeight ?? 20,
        source: 'genre',
      })
    }
  }

  // Animated titles: Cinematography is REPLACED by Animation (same weight),
  // and Acting becomes Voice Acting, slightly lighter. Keys stay unchanged
  // so scores and history remain coherent; only labels and weights shift for
  // this round. The auto-added animation category only stands in when the
  // group carries no Cinematography row to relabel.
  if (genreIds.includes(ANIMATION_GENRE_ID)) {
    const hasCinematography = entries.some((e) => e.key === 'cinematography')
    return entries
      .filter((e) => !(e.key === 'animation' && hasCinematography))
      .map((e) => {
        if (e.key === 'acting') {
          return {
            ...e,
            label: 'Voice Acting',
            weight: Math.round(e.weight * VOICE_ACTING_WEIGHT_FACTOR * 10) / 10,
          }
        }
        if (e.key === 'cinematography') {
          return { ...e, label: 'Animation' }
        }
        return e
      })
  }
  return entries
}

/** resolveSessionRubricTagged without the provenance tags (snapshot shape). */
export function resolveSessionRubric(
  groupRows: GroupRubricRow[],
  genreIds: number[],
  configuredKeys?: Iterable<string>,
): SessionRubricEntry[] {
  return resolveSessionRubricTagged(groupRows, genreIds, configuredKeys).map((e) => ({
    key: e.key,
    label: e.label,
    weight: e.weight,
  }))
}
