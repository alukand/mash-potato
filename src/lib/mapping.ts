// DB <-> app mapping. With dynamic categories the member_scores row carries a
// jsonb `scores` map keyed by category key (camelCase, see rubricCatalog.ts),
// so mapping is mostly a matter of validating shapes. Pure and dependency-free
// so it stays unit-testable without a Supabase client.

import type { CategoryScores, MemberScorecard } from './scoring'

/** A raw jsonb scores value from the DB -> the scoring core's CategoryScores.
 *  Drops anything that isn't a finite number (defensive: the column is
 *  client-written jsonb, not schema-checked per key). */
export function scoresFromJson(value: unknown): CategoryScores {
  const scores: CategoryScores = {}
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) scores[key] = v
    }
  }
  return scores
}

/** A full member_scores row -> the scoring core's MemberScorecard. */
export function scorecardFromRow(row: {
  member_id: string
  locked: boolean
  scores: unknown
  one_liner?: string | null
}): MemberScorecard {
  const line = typeof row.one_liner === 'string' ? row.one_liner.trim() : ''
  return {
    memberId: row.member_id,
    locked: row.locked,
    scores: scoresFromJson(row.scores),
    oneLiner: line === '' ? null : line,
  }
}

/** An entry of a session's rubric snapshot (reveal_sessions.rubric jsonb). */
export interface SessionRubricEntry {
  key: string
  label: string
  weight: number
}

/** A raw jsonb rubric snapshot -> validated, ordered entries (null if absent). */
export function rubricFromJson(value: unknown): SessionRubricEntry[] | null {
  if (!Array.isArray(value)) return null
  const entries: SessionRubricEntry[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const { key, label, weight } = item as Record<string, unknown>
    if (typeof key !== 'string' || key.length === 0) continue
    entries.push({
      key,
      label: typeof label === 'string' && label.length > 0 ? label : key,
      weight: typeof weight === 'number' && Number.isFinite(weight) ? weight : 20,
    })
  }
  return entries.length > 0 ? entries : null
}

/** Rubric snapshot entries -> the weights map the scoring core wants. */
export function weightsFromRubric(entries: SessionRubricEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((e) => [e.key, e.weight]))
}
