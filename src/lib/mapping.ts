// DB <-> app mapping for the category enum. The database uses snake_case
// (`score_sound`); the scoring core uses camelCase (`scoreSound`). Pure and
// dependency-free so it stays unit-testable without a Supabase client.

import type { CategoryId, CategoryScores, MemberScorecard } from './scoring'
import { CATEGORY_IDS } from './scoring'
import type { Database } from './database.types'

export type DbCategoryId = Database['public']['Enums']['category_id']

const TO_DB: Record<CategoryId, DbCategoryId> = {
  story: 'story',
  acting: 'acting',
  cinematography: 'cinematography',
  pacing: 'pacing',
  scoreSound: 'score_sound',
}

const FROM_DB: Record<DbCategoryId, CategoryId> = {
  story: 'story',
  acting: 'acting',
  cinematography: 'cinematography',
  pacing: 'pacing',
  score_sound: 'scoreSound',
}

export function toDbCategory(id: CategoryId): DbCategoryId {
  return TO_DB[id]
}

export function fromDbCategory(id: DbCategoryId): CategoryId {
  return FROM_DB[id]
}

/** The five score columns of a member_scores row, as the DB names them. */
export interface DbScoreColumns {
  story: number
  acting: number
  cinematography: number
  pacing: number
  score_sound: number
}

/** DB score columns -> the scoring core's CategoryScores. */
export function scoresFromRow(row: DbScoreColumns): CategoryScores {
  return {
    story: row.story,
    acting: row.acting,
    cinematography: row.cinematography,
    pacing: row.pacing,
    scoreSound: row.score_sound,
  }
}

/** CategoryScores -> DB score columns (for insert/upsert payloads). */
export function scoresToRow(scores: CategoryScores): DbScoreColumns {
  return {
    story: scores.story,
    acting: scores.acting,
    cinematography: scores.cinematography,
    pacing: scores.pacing,
    score_sound: scores.scoreSound,
  }
}

/** A full member_scores row -> the scoring core's MemberScorecard. */
export function scorecardFromRow(
  row: DbScoreColumns & { member_id: string; locked: boolean },
): MemberScorecard {
  return { memberId: row.member_id, locked: row.locked, scores: scoresFromRow(row) }
}

/**
 * Fold rubric rows into the scoring core's RubricWeights shape.
 * Missing categories default to 20 (the trigger's seed value).
 */
export function weightsFromRows(
  rows: { category: DbCategoryId; weight: number }[],
): Record<CategoryId, number> {
  const weights = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 20])) as Record<
    CategoryId,
    number
  >
  for (const row of rows) {
    weights[fromDbCategory(row.category)] = row.weight
  }
  return weights
}
