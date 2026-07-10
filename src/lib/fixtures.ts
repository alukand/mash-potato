// Sample data for the M1 shell only. NOT real data and NOT the data model —
// this exists so the UI can exercise the scoring core before Supabase lands.

import type { MemberScorecard, RubricWeights } from './scoring'

export interface Member {
  id: string
  name: string
}

export interface SampleTitle {
  name: string
  year: number
  mediaType: 'movie' | 'tv'
}

/** The sample rubric's category order (ties break toward earlier entries). */
export const sampleCategories = [
  'story',
  'acting',
  'cinematography',
  'pacing',
  'scoreSound',
]

/** Sample group rubric. (Sums to 100 here, but weights need not.) */
export const sampleWeights: RubricWeights = {
  story: 30,
  acting: 25,
  cinematography: 20,
  pacing: 15,
  scoreSound: 10,
}

export const sampleMembers: Member[] = [
  { id: 'you', name: 'You' },
  { id: 'mara', name: 'Mara' },
  { id: 'devin', name: 'Devin' },
  { id: 'sam', name: 'Sam' },
]

export const sampleTitle: SampleTitle = {
  name: 'Dune: Part Two',
  year: 2024,
  mediaType: 'movie',
}

/** Four locked scorecards. Pacing is contested; cinematography is united. */
export const sampleScorecards: MemberScorecard[] = [
  { memberId: 'you', locked: true, scores: { story: 8, acting: 8, cinematography: 9, pacing: 6, scoreSound: 9 } },
  { memberId: 'mara', locked: true, scores: { story: 9, acting: 8, cinematography: 10, pacing: 9, scoreSound: 8 } },
  { memberId: 'devin', locked: true, scores: { story: 7, acting: 9, cinematography: 9, pacing: 4, scoreSound: 9 } },
  { memberId: 'sam', locked: true, scores: { story: 9, acting: 7, cinematography: 10, pacing: 8, scoreSound: 7 } },
]

/** Which member is "me" in this sample (drives the gold personal score). */
export const CURRENT_MEMBER_ID = 'you'

export function memberName(id: string): string {
  return sampleMembers.find((m) => m.id === id)?.name ?? id
}

/** Presentation colour per member (sample-only; real avatars come later). */
const AVATAR_COLORS: Record<string, string> = {
  you: '#e7b24e',
  mara: '#51c5be',
  devin: '#e07a5f',
  sam: '#9c93ab',
}

export function memberColor(id: string): string {
  return AVATAR_COLORS[id] ?? '#9c93ab'
}

/** A second title with a session still BLIND — what the Rate screen scores. */
export const sampleBlindTitle: SampleTitle = {
  name: 'Past Lives',
  year: 2023,
  mediaType: 'movie',
}

/**
 * Who has already locked in on the blind session (lock STATUS is safe to
 * show; the scores themselves stay hidden until the reveal).
 */
export const blindLockedMemberIds = ['mara', 'devin']
