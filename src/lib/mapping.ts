// DB <-> app mapping for the category enum. The database uses snake_case
// (`score_sound`); the scoring core uses camelCase (`scoreSound`). Pure and
// dependency-free so it stays unit-testable without a Supabase client.

import type { CategoryId } from './scoring'
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
