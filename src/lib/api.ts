// Data layer: every Supabase call the UI makes lives here. Screens never
// touch the client directly. All reads/writes go through RLS — the client
// only ever holds the anon key + the user's JWT.

import { supabase } from './supabase'
import type { RubricWeights } from './scoring'
import { CATEGORY_IDS } from './scoring'
import { toDbCategory, weightsFromRows } from './mapping'

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
