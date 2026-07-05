// Data layer: every Supabase call the UI makes lives here. Screens never
// touch the client directly. All reads/writes go through RLS — the client
// only ever holds the anon key + the user's JWT.

import { supabase } from './supabase'
import type { CategoryScores, MemberScorecard, RubricWeights } from './scoring'
import { CATEGORY_IDS } from './scoring'
import { toDbCategory, weightsFromRows, scoresFromRow, scoresToRow, scorecardFromRow } from './mapping'

export interface GroupInfo {
  id: string
  name: string
  role: 'owner' | 'member'
}

export interface MemberInfo {
  userId: string
  displayName: string
  role: 'owner' | 'member'
}

// ---- auth -------------------------------------------------------------

export async function signUp(email: string, password: string, displayName: string) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Lands in raw_user_meta_data; the handle_new_user trigger copies it
    // into public.profiles.display_name.
    options: { data: { display_name: displayName } },
  })
  if (error) throw new Error(error.message)
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

// ---- groups -----------------------------------------------------------

/** The user's first group (single-group UX for now), or null if none. */
export async function fetchMyGroup(userId: string): Promise<GroupInfo | null> {
  const { data, error } = await supabase
    .from('group_members')
    .select('role, groups(id, name)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row?.groups) return null
  return { id: row.groups.id, name: row.groups.name, role: row.role }
}

/** Create a group; triggers add the owner membership + seed the rubric. */
export async function createGroup(userId: string, name: string): Promise<GroupInfo> {
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, owner_id: userId })
    .select('id, name')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id, name: data.name, role: 'owner' }
}

export async function fetchMembers(groupId: string): Promise<MemberInfo[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, profiles(display_name)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    displayName: row.profiles?.display_name ?? 'Member',
    role: row.role,
  }))
}

// ---- rubric -----------------------------------------------------------

export async function fetchWeights(groupId: string): Promise<RubricWeights> {
  const { data, error } = await supabase
    .from('rubric_weights')
    .select('category, weight')
    .eq('group_id', groupId)
  if (error) throw new Error(error.message)
  return weightsFromRows(data ?? [])
}

/** Owner-only by RLS; upserts all five categories. */
export async function saveWeights(groupId: string, weights: RubricWeights) {
  const rows = CATEGORY_IDS.map((id) => ({
    group_id: groupId,
    category: toDbCategory(id),
    weight: weights[id],
  }))
  const { error } = await supabase.from('rubric_weights').upsert(rows)
  if (error) throw new Error(error.message)
}

// ---- sessions -----------------------------------------------------------

export interface SessionInfo {
  id: string
  state: 'blind' | 'revealed'
  createdBy: string | null
  titleName: string
  titleYear: number | null
  mediaType: 'movie' | 'tv'
}

export interface NewTitle {
  name: string
  year: number | null
  mediaType: 'movie' | 'tv'
}

/** The group's most recent session (blind or revealed), or null. */
export async function fetchLatestSession(groupId: string): Promise<SessionInfo | null> {
  const { data, error } = await supabase
    .from('reveal_sessions')
    .select('id, state, created_by, titles(name, year, media_type)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row?.titles) return null
  return {
    id: row.id,
    state: row.state,
    createdBy: row.created_by,
    titleName: row.titles.name,
    titleYear: row.titles.year,
    mediaType: row.titles.media_type,
  }
}

/** Create a manually-entered title + a blind session for it. */
export async function createSession(
  groupId: string,
  userId: string,
  title: NewTitle,
): Promise<SessionInfo> {
  const { data: titleRow, error: titleError } = await supabase
    .from('titles')
    .insert({ name: title.name, year: title.year, media_type: title.mediaType })
    .select('id')
    .single()
  if (titleError) throw new Error(titleError.message)

  const { data, error } = await supabase
    .from('reveal_sessions')
    .insert({ group_id: groupId, title_id: titleRow.id, created_by: userId })
    .select('id, state, created_by')
    .single()
  if (error) throw new Error(error.message)
  return {
    id: data.id,
    state: data.state,
    createdBy: data.created_by,
    titleName: title.name,
    titleYear: title.year,
    mediaType: title.mediaType,
  }
}

/** Flip a blind session to revealed (owner or creator; enforced in the RPC). */
export async function revealSession(sessionId: string) {
  const { error } = await supabase.rpc('reveal_session', { p_session_id: sessionId })
  if (error) throw new Error(error.message)
}

// ---- scores -------------------------------------------------------------

export interface MyScore {
  scores: CategoryScores
  locked: boolean
}

/** My scorecard for a session (always visible to me), or null. */
export async function fetchMyScore(sessionId: string, userId: string): Promise<MyScore | null> {
  const { data, error } = await supabase
    .from('member_scores')
    .select('story, acting, cinematography, pacing, score_sound, locked')
    .eq('session_id', sessionId)
    .eq('member_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { scores: scoresFromRow(data), locked: data.locked }
}

/** Write my scorecard. RLS: self-only, and only while the session is blind. */
export async function saveMyScore(
  sessionId: string,
  userId: string,
  scores: CategoryScores,
  locked: boolean,
) {
  const { error } = await supabase.from('member_scores').upsert(
    { session_id: sessionId, member_id: userId, locked, ...scoresToRow(scores) },
    { onConflict: 'session_id,member_id' },
  )
  if (error) throw new Error(error.message)
}

/**
 * Everyone's scorecards. Before the reveal RLS returns only your own row;
 * after it, the whole group. The blind rule lives server-side.
 */
export async function fetchAllScorecards(sessionId: string): Promise<MemberScorecard[]> {
  const { data, error } = await supabase
    .from('member_scores')
    .select('member_id, locked, story, acting, cinematography, pacing, score_sound')
    .eq('session_id', sessionId)
  if (error) throw new Error(error.message)
  return (data ?? []).map(scorecardFromRow)
}

/** Who has locked in (flags only — scores stay hidden while blind). */
export async function fetchLockStatus(
  sessionId: string,
): Promise<{ memberId: string; locked: boolean }[]> {
  const { data, error } = await supabase.rpc('session_lock_status', {
    p_session_id: sessionId,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ memberId: row.member_id, locked: row.locked }))
}

// ---- realtime -----------------------------------------------------------

/**
 * Fire `onChange` whenever one of the group's reveal sessions changes —
 * that's the Reveal drop. Returns an unsubscribe function.
 */
export function onSessionChange(groupId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`reveal-${groupId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'reveal_sessions',
        filter: `group_id=eq.${groupId}`,
      },
      onChange,
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
