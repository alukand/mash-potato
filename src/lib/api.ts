// Data layer: every Supabase call the UI makes lives here. Screens never
// touch the client directly. All reads/writes go through RLS — the client
// only ever holds the anon key + the user's JWT.

import { supabase } from './supabase'
import type { CategoryScores, MemberScorecard } from './scoring'
import { mashedScore } from './scoring'
import { rubricFromJson, scorecardFromRow, scoresFromJson, weightsFromRubric } from './mapping'
import type { SessionRubricEntry } from './mapping'
// runtime-safe: rubricCatalog only type-imports from this module
import { presetRowsFromJson } from './rubricCatalog'

export type { SessionRubricEntry } from './mapping'

export interface GroupInfo {
  id: string
  name: string
  role: 'owner' | 'member'
  /** Whether YOUR membership in this group shows on your public profile. */
  isPublic: boolean
}

export interface MemberInfo {
  userId: string
  displayName: string
  /** Picked movie-archetype avatar; null = the classic initial circle. */
  avatarKey: string | null
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

// ---- push notifications -------------------------------------------------

/**
 * Register this device for pushes. The RPC takes the token over if the device
 * changed accounts (possessing the token string is proof APNs issued it here).
 */
export async function registerDeviceToken(
  token: string,
  platform: 'ios' | 'android',
): Promise<void> {
  const { error } = await supabase.rpc('register_device_token', {
    p_token: token,
    p_platform: platform,
  })
  if (error) throw new Error(error.message)
}

/** Stop pushes to this device (sign-out cleanup; self-only by RLS). */
export async function removeDeviceToken(token: string): Promise<void> {
  const { error } = await supabase.from('device_tokens').delete().eq('token', token)
  if (error) throw new Error(error.message)
}

// ---- groups -----------------------------------------------------------

/** Every group the user belongs to, oldest membership first. */
export async function fetchMyGroups(userId: string): Promise<GroupInfo[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('role, is_public, groups(id, name)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((row) => row.groups)
    .map((row) => ({
      id: row.groups!.id,
      name: row.groups!.name,
      role: row.role,
      isPublic: row.is_public,
    }))
}

/** Create a group; triggers add the owner membership + seed the rubric. */
export async function createGroup(userId: string, name: string): Promise<GroupInfo> {
  const { data, error } = await supabase
    .from('groups')
    .insert({ name, owner_id: userId })
    .select('id, name')
    .single()
  if (error) throw new Error(error.message)
  return { id: data.id, name: data.name, role: 'owner', isPublic: false }
}

export async function fetchMembers(groupId: string): Promise<MemberInfo[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, profiles(display_name, avatar_key)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    displayName: row.profiles?.display_name ?? 'Member',
    avatarKey: row.profiles?.avatar_key ?? null,
    role: row.role,
  }))
}

export interface UserSearchResult {
  userId: string
  displayName: string
}

/**
 * Find people by display name to add to a group. Profiles are readable by any
 * signed-in user (RLS `profiles_select_authenticated`), so this is a directory
 * search; `exclude` filters out people already in the group.
 */
export async function searchProfiles(
  query: string,
  exclude: string[] = [],
): Promise<UserSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  // Escape LIKE wildcards so a literal name is matched.
  const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .ilike('display_name', pattern)
    .limit(12)
  if (error) throw new Error(error.message)
  const excluded = new Set(exclude)
  return (data ?? [])
    .filter((r) => !excluded.has(r.id))
    .map((r) => ({ userId: r.id, displayName: r.display_name }))
}

/** Add a member to a group (owner-only by RLS). No-op if already a member. */
export async function addMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId, role: 'member' })
  if (error && error.code !== '23505') throw new Error(error.message)
}

/** Rename a group (owner-only by RLS `groups_update_owner`). */
export async function renameGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.from('groups').update({ name }).eq('id', groupId)
  if (error) throw new Error(error.message)
}

/**
 * Remove a membership row: the owner removing someone, or a member leaving
 * (RLS `group_members_delete_owner_or_self`). The member's rubric goes with
 * them (FK cascade); their scores on past sessions stay in the history.
 */
export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/**
 * Delete a group and everything in it — sessions, scores, rubrics (owner-only
 * by RLS `groups_delete_owner`; FK cascades). Shared titles are untouched.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId)
  if (error) throw new Error(error.message)
}

/** Update your display name (self-only by RLS `profiles_update_self`). */
export async function updateMyDisplayName(userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

// ---- rubrics (per member, mashed into the group's) -----------------------

/** One row of a rubric configuration (see rubricCatalog.ts). */
export interface GroupRubricRow {
  key: string
  label: string
  weight: number
  enabled: boolean
  sort: number
}

/**
 * Every member's personal rubric for a group (RLS: members read the whole
 * group's). Mash them with rubricCatalog's mashRubrics for the effective
 * rubric a session is scored under.
 */
export async function fetchGroupRubrics(
  groupId: string,
): Promise<{ userId: string; rows: GroupRubricRow[] }[]> {
  const { data, error } = await supabase
    .from('member_rubrics')
    .select('user_id, category_key, label, weight, enabled, sort')
    .eq('group_id', groupId)
    .order('sort', { ascending: true })
  if (error) throw new Error(error.message)

  const byUser = new Map<string, GroupRubricRow[]>()
  for (const r of data ?? []) {
    const row: GroupRubricRow = {
      key: r.category_key,
      label: r.label,
      weight: r.weight,
      enabled: r.enabled,
      sort: r.sort,
    }
    const rows = byUser.get(r.user_id)
    if (rows) rows.push(row)
    else byUser.set(r.user_id, [row])
  }
  return [...byUser.entries()].map(([userId, rows]) => ({ userId, rows }))
}

/** Save MY rubric for a group (self-only by RLS; upserts every row). */
export async function saveMyRubric(groupId: string, userId: string, rows: GroupRubricRow[]) {
  const payload = rows.map((r) => ({
    group_id: groupId,
    user_id: userId,
    category_key: r.key,
    label: r.label,
    weight: r.weight,
    enabled: r.enabled,
    sort: r.sort,
  }))
  const { error } = await supabase.from('member_rubrics').upsert(payload)
  if (error) throw new Error(error.message)
}

// ---- sessions -----------------------------------------------------------

export interface SessionInfo {
  id: string
  state: 'blind' | 'revealed'
  createdBy: string | null
  createdAt: string
  titleId: string
  titleName: string
  titleYear: number | null
  /** Null for manual entries (no TMDB identity). */
  titleTmdbId: number | null
  mediaType: 'movie' | 'tv'
  posterPath: string | null
  /** The category set this session is scored under (snapshot at creation). */
  rubric: SessionRubricEntry[] | null
}

export interface NewTitle {
  name: string
  year: number | null
  mediaType: 'movie' | 'tv'
  /** Set when the title was picked from TMDB search; null for manual entry. */
  tmdbId: number | null
  posterPath: string | null
}

/** The group's most recent session (blind or revealed), or null. */
export async function fetchLatestSession(groupId: string): Promise<SessionInfo | null> {
  const { data, error } = await supabase
    .from('reveal_sessions')
    .select(
      'id, state, created_by, created_at, rubric, titles(id, tmdb_id, name, year, media_type, poster_path)',
    )
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
    createdAt: row.created_at,
    titleId: row.titles.id,
    titleName: row.titles.name,
    titleYear: row.titles.year,
    titleTmdbId: row.titles.tmdb_id,
    mediaType: row.titles.media_type,
    posterPath: row.titles.poster_path,
    rubric: rubricFromJson(row.rubric),
  }
}

/**
 * Find-or-create the title row. TMDB picks are deduped on (tmdb_id,
 * media_type); manual entries always insert (titles has no update policy,
 * so upsert-on-conflict is not an option — insert races just re-select).
 */
async function ensureTitle(title: NewTitle): Promise<string> {
  if (title.tmdbId !== null) {
    const { data: existing, error: findError } = await supabase
      .from('titles')
      .select('id')
      .eq('tmdb_id', title.tmdbId)
      .eq('media_type', title.mediaType)
      .maybeSingle()
    if (findError) throw new Error(findError.message)
    if (existing) return existing.id
  }

  const { data, error } = await supabase
    .from('titles')
    .insert({
      name: title.name,
      year: title.year,
      media_type: title.mediaType,
      tmdb_id: title.tmdbId,
      poster_path: title.posterPath,
    })
    .select('id')
    .single()
  if (error) {
    // unique (tmdb_id, media_type): someone inserted it first — reuse theirs
    if (error.code === '23505' && title.tmdbId !== null) {
      const { data: raced, error: retryError } = await supabase
        .from('titles')
        .select('id')
        .eq('tmdb_id', title.tmdbId)
        .eq('media_type', title.mediaType)
        .single()
      if (retryError) throw new Error(retryError.message)
      return raced.id
    }
    throw new Error(error.message)
  }
  return data.id
}

/**
 * Create (or reuse) the title + start a blind session for it. `rubric` is the
 * resolved category snapshot the session will be scored under (the group's
 * enabled categories plus genre add-ons — see resolveSessionRubric).
 */
export async function createSession(
  groupId: string,
  userId: string,
  title: NewTitle,
  rubric: SessionRubricEntry[],
): Promise<SessionInfo> {
  const titleId = await ensureTitle(title)

  const { data, error } = await supabase
    .from('reveal_sessions')
    .insert({
      group_id: groupId,
      title_id: titleId,
      created_by: userId,
      // plain-object snapshot for the jsonb column (interfaces lack the
      // index signature the generated Json type wants)
      rubric: rubric.map((e) => ({ key: e.key, label: e.label, weight: e.weight })),
    })
    .select('id, state, created_by, created_at')
    .single()
  if (error) throw new Error(error.message)

  // Starting a round means you're in it (non-fatal if it races).
  await respondToSession(data.id, userId, 'in').catch(() => {})

  return {
    id: data.id,
    state: data.state,
    createdBy: data.created_by,
    createdAt: data.created_at,
    titleId,
    titleName: title.name,
    titleYear: title.year,
    titleTmdbId: title.tmdbId,
    mediaType: title.mediaType,
    posterPath: title.posterPath,
    rubric,
  }
}

// ---- session RSVPs ("who's in this round") --------------------------------

export type { RsvpStatus } from './rsvp'

export async function fetchSessionRsvps(
  sessionId: string,
): Promise<{ memberId: string; status: 'in' | 'pass' }[]> {
  const { data, error } = await supabase
    .from('session_rsvps')
    .select('member_id, status')
    .eq('session_id', sessionId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    memberId: r.member_id,
    status: r.status as 'in' | 'pass',
  }))
}

/** Answer (or change your answer) for a session: in or pass. */
export async function respondToSession(
  sessionId: string,
  userId: string,
  status: 'in' | 'pass',
): Promise<void> {
  const { error } = await supabase
    .from('session_rsvps')
    .upsert(
      { session_id: sessionId, member_id: userId, status },
      { onConflict: 'session_id,member_id' },
    )
  if (error) throw new Error(error.message)
}

// ---- TMDB search (proxied through an Edge Function; key stays server-side) --

export interface TmdbResult {
  tmdbId: number
  name: string
  year: number | null
  posterPath: string | null
}

export async function searchTitles(
  query: string,
  mediaType: 'movie' | 'tv',
): Promise<TmdbResult[]> {
  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: { op: 'search', query, mediaType },
  })
  if (error) throw new Error(error.message)
  return (data as { results: TmdbResult[] }).results ?? []
}

export type BrowseFeed = 'trending' | 'popular'

// Discover shelves change slowly; cache each (feed, mediaType) for the app
// session so tab revisits are instant. TTL keeps it from going stale mid-use.
const BROWSE_TTL_MS = 10 * 60 * 1000
const browseCache = new Map<string, { at: number; results: TmdbResult[] }>()

export async function fetchBrowse(
  feed: BrowseFeed,
  mediaType: 'movie' | 'tv',
): Promise<TmdbResult[]> {
  const key = `${feed}:${mediaType}`
  const hit = browseCache.get(key)
  if (hit && Date.now() - hit.at < BROWSE_TTL_MS) return hit.results

  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: { op: 'browse', feed, mediaType },
  })
  if (error) throw new Error(error.message)
  const results = (data as { results: TmdbResult[] }).results ?? []
  browseCache.set(key, { at: Date.now(), results })
  return results
}

// Genre shelves (Discover browse rows) reuse the discover op, cached like
// the browse feeds so tab hops don't refetch.
const genreShelfCache = new Map<string, { at: number; results: TmdbResult[] }>()

export async function fetchGenreShelf(
  genreId: number,
  mediaType: 'movie' | 'tv',
): Promise<TmdbResult[]> {
  const key = `${genreId}:${mediaType}`
  const hit = genreShelfCache.get(key)
  if (hit && Date.now() - hit.at < BROWSE_TTL_MS) return hit.results
  const results = await fetchDiscover({ genreIds: [genreId] }, mediaType)
  genreShelfCache.set(key, { at: Date.now(), results })
  return results
}

// ---- where to watch (JustWatch data via TMDB) -------------------------------

export interface WatchProvider {
  name: string
  logoPath: string | null
}

export interface WatchProviders {
  /** TMDB's watch page for this title (the required attribution target). */
  link: string | null
  stream: WatchProvider[]
  rent: WatchProvider[]
  buy: WatchProvider[]
}

/** The viewer's storefront region from the device locale (en-US -> US). */
function watchRegion(): string {
  try {
    const region = new Intl.Locale(navigator.language).region
    return region && /^[A-Z]{2}$/.test(region) ? region : 'US'
  } catch {
    return 'US'
  }
}

const providersCache = new Map<string, WatchProviders | null>()

export async function fetchWatchProviders(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<WatchProviders | null> {
  const key = `${mediaType}:${tmdbId}`
  const hit = providersCache.get(key)
  if (hit !== undefined) return hit
  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: { op: 'providers', tmdbId, mediaType, region: watchRegion() },
  })
  if (error) throw new Error(error.message)
  const providers = ((data as { providers: WatchProviders | null }).providers ?? null) as
    | WatchProviders
    | null
  providersCache.set(key, providers)
  return providers
}

// Recommendations barely change for a title; cache for the app session.
const recsCache = new Map<string, TmdbResult[]>()

/** TMDB's "more like this" for one title (drives the group's rec shelf). */
export async function fetchRecommendations(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<TmdbResult[]> {
  const key = `${mediaType}:${tmdbId}`
  const hit = recsCache.get(key)
  if (hit) return hit

  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: { op: 'recommendations', tmdbId, mediaType },
  })
  if (error) throw new Error(error.message)
  const results = (data as { results: TmdbResult[] }).results ?? []
  recsCache.set(key, results)
  return results
}

/** Full TMDB metadata for one title's detail page. */
export interface TitleDetail {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  overview: string
  genres: string[]
  /** TMDB genre ids — drive the genre add-on categories in the rubric. */
  genreIds: number[]
  runtimeMinutes: number | null
  seasons: number | null
  tmdbRating: number | null
  voteCount: number
  posterPath: string | null
  backdropPath: string | null
  cast: { name: string; character: string; profilePath: string | null }[]
}

/** Full details for one TMDB title, or null if TMDB has no such id. */
export async function fetchTitleDetail(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<TitleDetail | null> {
  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: { op: 'detail', tmdbId, mediaType },
  })
  if (error) throw new Error(error.message)
  return (data as { detail: TitleDetail | null }).detail ?? null
}

export interface TmdbGenre {
  id: number
  name: string
}

// The genre catalog changes ~never; cache per media type for the app session.
const genresCache = new Map<'movie' | 'tv', TmdbGenre[]>()

export async function fetchGenres(mediaType: 'movie' | 'tv'): Promise<TmdbGenre[]> {
  const hit = genresCache.get(mediaType)
  if (hit) return hit
  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: { op: 'genres', mediaType },
  })
  if (error) throw new Error(error.message)
  const genres = (data as { genres: TmdbGenre[] }).genres ?? []
  genresCache.set(mediaType, genres)
  return genres
}

export interface TmdbPerson {
  id: number
  name: string
  profilePath: string | null
  /** e.g. 'Acting' or 'Directing' — from TMDB's known_for_department. */
  department: string | null
}

/** Search people (actors + directors) for the filter picker. */
export async function searchPeople(query: string): Promise<TmdbPerson[]> {
  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: { op: 'person', query },
  })
  if (error) throw new Error(error.message)
  return (data as { people: TmdbPerson[] }).people ?? []
}

export interface DiscoverFilters {
  genreIds?: number[]
  personId?: number
  year?: number
}

/** Filtered discovery by genre / person / year (TMDB /discover). */
export async function fetchDiscover(
  filters: DiscoverFilters,
  mediaType: 'movie' | 'tv',
): Promise<TmdbResult[]> {
  const { data, error } = await supabase.functions.invoke('tmdb-search', {
    body: { op: 'discover', filters, mediaType },
  })
  if (error) throw new Error(error.message)
  return (data as { results: TmdbResult[] }).results ?? []
}

/** Public TMDB CDN url for a poster/profile image (no key required). */
export function posterUrl(
  posterPath: string,
  size: 'w92' | 'w185' | 'w342' = 'w185',
): string {
  return `https://image.tmdb.org/t/p/${size}${posterPath}`
}

/** Public TMDB CDN url for a wide backdrop image. */
export function backdropUrl(backdropPath: string, size: 'w780' | 'w1280' = 'w780'): string {
  return `https://image.tmdb.org/t/p/${size}${backdropPath}`
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
    .select('scores, locked')
    .eq('session_id', sessionId)
    .eq('member_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { scores: scoresFromJson(data.scores), locked: data.locked }
}

/** Write my scorecard. RLS: self-only, and only while the session is blind. */
export async function saveMyScore(
  sessionId: string,
  userId: string,
  scores: CategoryScores,
  locked: boolean,
) {
  const { error } = await supabase.from('member_scores').upsert(
    { session_id: sessionId, member_id: userId, locked, scores },
    { onConflict: 'session_id,member_id' },
  )
  if (error) throw new Error(error.message)
}

/**
 * Everyone's scorecards. Before the reveal RLS returns only your own row;
 * after it, the whole group. The blind rule lives server-side.
 */
/**
 * Score a REVEALED session you never locked: a member who joined the group
 * later, or sat the round out. Constrained server-side (RPC): revealed
 * sessions only, group members only, keys validated against the snapshot,
 * locked cards never re-scored. The Mashed recomputes for everyone.
 */
export async function lateScoreSession(
  sessionId: string,
  scores: CategoryScores,
): Promise<void> {
  const { error } = await supabase.rpc('late_score_session', {
    p_session_id: sessionId,
    p_scores: scores,
  })
  if (error) throw new Error(error.message)
}

/**
 * Fill in ONE missing category on your locked card after the group's rubric
 * grew. Server-side: never overwrites an existing score; appends the category
 * to the session's rubric snapshot (current effective weight) the first time.
 */
export async function backfillCategoryScore(
  sessionId: string,
  categoryKey: string,
  score: number,
): Promise<void> {
  const { error } = await supabase.rpc('backfill_category_score', {
    p_session_id: sessionId,
    p_category_key: categoryKey,
    p_score: score,
  })
  if (error) throw new Error(error.message)
}

export async function fetchAllScorecards(sessionId: string): Promise<MemberScorecard[]> {
  const { data, error } = await supabase
    .from('member_scores')
    .select('member_id, locked, scores')
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

// ---- saved titles ("my list") -------------------------------------------

export interface SavedTitle {
  titleId: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterPath: string | null
  savedAt: string
}

/** The user's saved titles, most recently saved first. */
export async function fetchMySavedTitles(userId: string): Promise<SavedTitle[]> {
  const { data, error } = await supabase
    .from('saved_titles')
    .select('created_at, titles(id, tmdb_id, media_type, name, year, poster_path)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((row) => row.titles)
    .map((row) => ({
      titleId: row.titles!.id,
      tmdbId: row.titles!.tmdb_id,
      mediaType: row.titles!.media_type,
      name: row.titles!.name,
      year: row.titles!.year,
      posterPath: row.titles!.poster_path,
      savedAt: row.created_at,
    }))
}

export interface ReviewedTitle {
  titleId: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterPath: string | null
  /** How many sessions (across the user's groups) the user has scored it in. */
  sessionCount: number
  /** True once at least one of those sessions has been revealed. */
  anyRevealed: boolean
}

/**
 * Every title the user has scored — i.e. has their OWN member_scores row for,
 * in any session state. RLS `scores_select_own` returns only the user's rows;
 * the reveal_sessions embed is gated to their groups. Grouped by title, most
 * recently scored first.
 */
export async function fetchMyReviewedTitles(userId: string): Promise<ReviewedTitle[]> {
  const { data, error } = await supabase
    .from('member_scores')
    .select(
      'updated_at, reveal_sessions(state, titles(id, tmdb_id, media_type, name, year, poster_path))',
    )
    .eq('member_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)

  const byTitle = new Map<string, ReviewedTitle>()
  for (const row of data ?? []) {
    const title = row.reveal_sessions?.titles
    if (!title) continue
    const revealed = row.reveal_sessions!.state === 'revealed'
    const existing = byTitle.get(title.id)
    if (existing) {
      existing.sessionCount += 1
      existing.anyRevealed = existing.anyRevealed || revealed
    } else {
      byTitle.set(title.id, {
        titleId: title.id,
        tmdbId: title.tmdb_id,
        mediaType: title.media_type,
        name: title.name,
        year: title.year,
        posterPath: title.poster_path,
        sessionCount: 1,
        anyRevealed: revealed,
      })
    }
  }
  return [...byTitle.values()]
}

/**
 * The titles-row id for a TMDB title IF the user has saved it, else null.
 * Two hops: the title may not be cached yet (nobody has saved/scored it).
 */
export async function fetchSavedTitleId(
  userId: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<string | null> {
  const { data: title, error: titleError } = await supabase
    .from('titles')
    .select('id')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (titleError) throw new Error(titleError.message)
  if (!title) return null

  const { data: saved, error: savedError } = await supabase
    .from('saved_titles')
    .select('title_id')
    .eq('user_id', userId)
    .eq('title_id', title.id)
    .maybeSingle()
  if (savedError) throw new Error(savedError.message)
  return saved ? title.id : null
}

/** Save a title to the user's list (idempotent). Returns the titles-row id. */
export async function saveTitle(userId: string, title: NewTitle): Promise<string> {
  const titleId = await ensureTitle(title)
  const { error } = await supabase
    .from('saved_titles')
    .insert({ user_id: userId, title_id: titleId })
  // Already saved — the (user_id, title_id) PK collides; treat as success.
  if (error && error.code !== '23505') throw new Error(error.message)
  return titleId
}

/** Remove a title from the user's list. */
export async function unsaveTitle(userId: string, titleId: string): Promise<void> {
  const { error } = await supabase
    .from('saved_titles')
    .delete()
    .eq('user_id', userId)
    .eq('title_id', titleId)
  if (error) throw new Error(error.message)
}

// ---- cross-group history for a title -------------------------------------

export interface TitleHistoryEntry {
  sessionId: string
  groupId: string
  groupName: string
  revealedAt: string | null
  scorecards: MemberScorecard[]
  /** The category snapshot the session was scored under. */
  rubric: SessionRubricEntry[]
}

/**
 * Every REVEALED session for this TMDB title across the caller's groups, with
 * the scorecards + rubric snapshot needed to compute each group's Mashed
 * score. RLS trims sessions to the caller's groups, and being revealed it
 * exposes the full scorecards — the blind rule is never bent, only revealed
 * history is read.
 */
export async function fetchTitleHistory(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<TitleHistoryEntry[]> {
  const { data: title, error: titleError } = await supabase
    .from('titles')
    .select('id')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (titleError) throw new Error(titleError.message)
  if (!title) return []

  const { data: sessions, error: sessionsError } = await supabase
    .from('reveal_sessions')
    .select('id, group_id, revealed_at, rubric, groups(name)')
    .eq('title_id', title.id)
    .eq('state', 'revealed')
    .order('revealed_at', { ascending: false })
  if (sessionsError) throw new Error(sessionsError.message)
  const rows = sessions ?? []
  if (rows.length === 0) return []

  const scorecardsBySession = await Promise.all(rows.map((r) => fetchAllScorecards(r.id)))

  return rows.map((r, i) => {
    const scorecards = scorecardsBySession[i]
    // Snapshot should always exist (set at creation, backfilled by migration);
    // if it somehow doesn't, derive equal-weight entries from the scores.
    const rubric =
      rubricFromJson(r.rubric) ??
      [...new Set(scorecards.flatMap((s) => Object.keys(s.scores)))].map((key) => ({
        key,
        label: key,
        weight: 20,
      }))
    return {
      sessionId: r.id,
      groupId: r.group_id,
      groupName: r.groups?.name ?? 'Group',
      revealedAt: r.revealed_at,
      scorecards,
      rubric,
    }
  })
}

// ---- personal rubric presets ----------------------------------------------

export interface UserRubricPreset {
  id: string
  name: string
  rows: GroupRubricRow[]
  isFavorite: boolean
}

/** My saved rubric presets, favorite first then A–Z. */
export async function fetchMyRubricPresets(userId: string): Promise<UserRubricPreset[]> {
  const { data, error } = await supabase
    .from('user_rubrics')
    .select('id, name, rows, is_favorite')
    .eq('user_id', userId)
    .order('is_favorite', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    rows: presetRowsFromJson(r.rows),
    isFavorite: r.is_favorite,
  }))
}

/** Save (or overwrite, by name) one of my presets. Returns its id. */
export async function saveRubricPreset(
  userId: string,
  name: string,
  rows: GroupRubricRow[],
): Promise<string> {
  const { data, error } = await supabase
    .from('user_rubrics')
    .upsert(
      {
        user_id: userId,
        name,
        rows: rows.map((r) => ({ ...r })),
      },
      { onConflict: 'user_id,name' },
    )
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

/** Star one preset as my favorite (or pass null to clear). One favorite max. */
export async function setFavoriteRubricPreset(
  userId: string,
  presetId: string | null,
): Promise<void> {
  const { error: clearError } = await supabase
    .from('user_rubrics')
    .update({ is_favorite: false })
    .eq('user_id', userId)
    .eq('is_favorite', true)
  if (clearError) throw new Error(clearError.message)
  if (presetId === null) return
  const { error } = await supabase
    .from('user_rubrics')
    .update({ is_favorite: true })
    .eq('user_id', userId)
    .eq('id', presetId)
  if (error) throw new Error(error.message)
}

export async function deleteRubricPreset(userId: string, presetId: string): Promise<void> {
  const { error } = await supabase
    .from('user_rubrics')
    .delete()
    .eq('user_id', userId)
    .eq('id', presetId)
  if (error) throw new Error(error.message)
}

// ---- group log ------------------------------------------------------------

export interface GroupLogEntry {
  sessionId: string
  titleName: string
  titleYear: number | null
  mediaType: 'movie' | 'tv'
  posterPath: string | null
  tmdbId: number | null
  revealedAt: string | null
  mashed: number | null
}

/**
 * Every REVEALED session of the group, newest first, each with its Mashed
 * score computed from its own rubric snapshot. One scorecards query covers
 * all sessions (RLS: revealed rows are member-visible).
 */
export async function fetchGroupLog(groupId: string): Promise<GroupLogEntry[]> {
  const { data: sessions, error } = await supabase
    .from('reveal_sessions')
    .select('id, revealed_at, rubric, titles(tmdb_id, media_type, name, year, poster_path)')
    .eq('group_id', groupId)
    .eq('state', 'revealed')
    .order('revealed_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (sessions ?? []).filter((r) => r.titles)
  if (rows.length === 0) return []

  const { data: scoreRows, error: scoresError } = await supabase
    .from('member_scores')
    .select('session_id, member_id, locked, scores')
    .in(
      'session_id',
      rows.map((r) => r.id),
    )
  if (scoresError) throw new Error(scoresError.message)

  const bySession = new Map<string, MemberScorecard[]>()
  for (const row of scoreRows ?? []) {
    const card = scorecardFromRow(row)
    const cards = bySession.get(row.session_id)
    if (cards) cards.push(card)
    else bySession.set(row.session_id, [card])
  }

  return rows.map((r) => {
    const rubric = rubricFromJson(r.rubric) ?? []
    const cards = bySession.get(r.id) ?? []
    return {
      sessionId: r.id,
      titleName: r.titles!.name,
      titleYear: r.titles!.year,
      mediaType: r.titles!.media_type,
      posterPath: r.titles!.poster_path,
      tmdbId: r.titles!.tmdb_id,
      revealedAt: r.revealed_at,
      mashed: rubric.length > 0 ? mashedScore(cards, weightsFromRubric(rubric)) : null,
    }
  })
}

// ---- global (community) ratings ------------------------------------------
// A solo rating that feeds a title's community score — everyone's implicitly
// in one big pool. Individual rows are self-only; the aggregate below is the
// only way to see across users.

export interface CommunityScore {
  count: number
  mashed: number | null
}

/** The community score for a title (count + weighted mean across all users). */
export async function fetchCommunityScore(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  weights: Record<string, number>,
): Promise<CommunityScore> {
  const { data: title, error: titleError } = await supabase
    .from('titles')
    .select('id')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (titleError) throw new Error(titleError.message)
  if (!title) return { count: 0, mashed: null }

  const { data, error } = await supabase.rpc('title_community_score', {
    p_title_id: title.id,
    p_weights: weights,
  })
  if (error) throw new Error(error.message)
  const row = data?.[0]
  return { count: row?.rating_count ?? 0, mashed: row?.mashed ?? null }
}

/**
 * The community rating distribution for a title: a 10-slot array where index i
 * is how many users' weighted score rounded to (i + 1). Aggregate-only (the
 * RPC never returns individual rows).
 */
export async function fetchCommunityHistogram(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  weights: Record<string, number>,
): Promise<number[]> {
  const empty = Array<number>(10).fill(0)
  const { data: title, error: titleError } = await supabase
    .from('titles')
    .select('id')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (titleError) throw new Error(titleError.message)
  if (!title) return empty

  const { data, error } = await supabase.rpc('title_community_histogram', {
    p_title_id: title.id,
    p_weights: weights,
  })
  if (error) throw new Error(error.message)
  const bins = [...empty]
  for (const row of data ?? []) {
    if (row.bucket >= 1 && row.bucket <= 10) bins[row.bucket - 1] = row.n
  }
  return bins
}

/** My own solo rating for a title (always self-readable), or null. */
export async function fetchMyGlobalRating(
  userId: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<CategoryScores | null> {
  const { data: title, error: titleError } = await supabase
    .from('titles')
    .select('id')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (titleError) throw new Error(titleError.message)
  if (!title) return null

  const { data, error } = await supabase
    .from('global_ratings')
    .select('scores')
    .eq('user_id', userId)
    .eq('title_id', title.id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? scoresFromJson(data.scores) : null
}

/** Save (or update) my solo rating for a title, which feeds the community score. */
export async function saveGlobalRating(
  userId: string,
  title: NewTitle,
  scores: CategoryScores,
): Promise<void> {
  const titleId = await ensureTitle(title)
  const { error } = await supabase
    .from('global_ratings')
    .upsert({ user_id: userId, title_id: titleId, scores }, { onConflict: 'user_id,title_id' })
  if (error) throw new Error(error.message)
}

/** Remove my solo rating for a title (self-only by RLS). No-op if unrated. */
export async function deleteGlobalRating(
  userId: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<void> {
  const { data: title, error: titleError } = await supabase
    .from('titles')
    .select('id')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (titleError) throw new Error(titleError.message)
  if (!title) return
  const { error } = await supabase
    .from('global_ratings')
    .delete()
    .eq('user_id', userId)
    .eq('title_id', title.id)
  if (error) throw new Error(error.message)
}

export interface RatedTitle {
  titleId: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterPath: string | null
  ratedAt: string
}

/** Titles the user has solo-rated, most recent first (for the profile). */
export async function fetchMyGlobalRatings(userId: string): Promise<RatedTitle[]> {
  const { data, error } = await supabase
    .from('global_ratings')
    .select('updated_at, titles(id, tmdb_id, media_type, name, year, poster_path)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((row) => row.titles)
    .map((row) => ({
      titleId: row.titles!.id,
      tmdbId: row.titles!.tmdb_id,
      mediaType: row.titles!.media_type,
      name: row.titles!.name,
      year: row.titles!.year,
      posterPath: row.titles!.poster_path,
      ratedAt: row.updated_at,
    }))
}

// ---- playlists ------------------------------------------------------------

export interface PlaylistSummary {
  id: string
  name: string
  description: string | null
  isPublic: boolean
  /** Set = a group watchlist (shared, never public); null = personal. */
  groupId: string | null
  itemCount: number
  /** Up to three poster paths for the cover collage, newest first. */
  posters: string[]
}

export interface PlaylistItemEntry {
  titleId: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterPath: string | null
  addedAt: string
}

export interface PlaylistDetail {
  id: string
  ownerId: string
  ownerName: string
  name: string
  description: string | null
  isPublic: boolean
  /** Set = a group watchlist; visibility implies membership (RLS). */
  groupId: string | null
  groupName: string | null
  items: PlaylistItemEntry[]
}

// One query: counts via the aggregate embed, covers via a second aliased
// embed limited server-side to the 3 newest items per playlist (a 500-item
// watchlist must not ship 500 rows for 3 posters).
const PLAYLIST_SUMMARY_SELECT =
  'id, name, description, is_public, group_id, playlist_items(count), covers:playlist_items(added_at, titles(poster_path))'

function toPlaylistSummary(row: {
  id: string
  name: string
  description: string | null
  is_public: boolean
  group_id: string | null
  playlist_items: { count: number }[] | null
  covers: { titles: { poster_path: string | null } | null }[] | null
}): PlaylistSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isPublic: row.is_public,
    groupId: row.group_id,
    itemCount: row.playlist_items?.[0]?.count ?? 0,
    posters: (row.covers ?? [])
      .map((c) => c.titles?.poster_path)
      .filter((p): p is string => Boolean(p)),
  }
}

/** The user's PERSONAL playlists, freshest first (group watchlists live on
 * the Group tab). */
export async function fetchMyPlaylists(userId: string): Promise<PlaylistSummary[]> {
  const { data, error } = await supabase
    .from('playlists')
    .select(PLAYLIST_SUMMARY_SELECT)
    .eq('owner_id', userId)
    .is('group_id', null)
    .order('updated_at', { ascending: false })
    .order('added_at', { referencedTable: 'covers', ascending: false })
    .limit(3, { referencedTable: 'covers' })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toPlaylistSummary)
}

/** One group's shared watchlists, freshest first. */
export async function fetchGroupPlaylists(groupId: string): Promise<PlaylistSummary[]> {
  const { data, error } = await supabase
    .from('playlists')
    .select(PLAYLIST_SUMMARY_SELECT)
    .eq('group_id', groupId)
    .order('updated_at', { ascending: false })
    .order('added_at', { referencedTable: 'covers', ascending: false })
    .limit(3, { referencedTable: 'covers' })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toPlaylistSummary)
}

/**
 * Every list the user can ADD a title to: their personal playlists plus all
 * their groups' watchlists (RLS trims group lists to memberships).
 */
export async function fetchAddablePlaylists(userId: string): Promise<PlaylistSummary[]> {
  const { data, error } = await supabase
    .from('playlists')
    .select(PLAYLIST_SUMMARY_SELECT)
    .or(`and(owner_id.eq.${userId},group_id.is.null),group_id.not.is.null`)
    .order('updated_at', { ascending: false })
    .order('added_at', { referencedTable: 'covers', ascending: false })
    .limit(3, { referencedTable: 'covers' })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toPlaylistSummary)
}

export async function createPlaylist(
  userId: string,
  name: string,
  groupId: string | null = null,
): Promise<string> {
  const { data, error } = await supabase
    .from('playlists')
    .insert({ owner_id: userId, name, group_id: groupId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function updatePlaylist(
  playlistId: string,
  patch: { name?: string; description?: string | null; isPublic?: boolean },
): Promise<void> {
  const row: { name?: string; description?: string | null; is_public?: boolean } = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.description !== undefined) row.description = patch.description
  if (patch.isPublic !== undefined) row.is_public = patch.isPublic
  const { error } = await supabase.from('playlists').update(row).eq('id', playlistId)
  if (error) throw new Error(error.message)
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const { error } = await supabase.from('playlists').delete().eq('id', playlistId)
  if (error) throw new Error(error.message)
}

/** One playlist with its titles — yours, or anyone's public one (by RLS). */
export async function fetchPlaylist(playlistId: string): Promise<PlaylistDetail | null> {
  const { data, error } = await supabase
    .from('playlists')
    .select(
      'id, owner_id, name, description, is_public, group_id, groups(name), profiles(display_name), playlist_items(added_at, titles(id, tmdb_id, media_type, name, year, poster_path))',
    )
    .eq('id', playlistId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return {
    id: data.id,
    ownerId: data.owner_id,
    ownerName: data.profiles?.display_name ?? 'Someone',
    name: data.name,
    description: data.description,
    isPublic: data.is_public,
    groupId: data.group_id,
    groupName: data.groups?.name ?? null,
    items: (data.playlist_items ?? [])
      .filter((i) => i.titles)
      .map((i) => ({
        titleId: i.titles!.id,
        tmdbId: i.titles!.tmdb_id,
        mediaType: i.titles!.media_type,
        name: i.titles!.name,
        year: i.titles!.year,
        posterPath: i.titles!.poster_path,
        addedAt: i.added_at,
      }))
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
  }
}

/**
 * Copy a playlist you can see into one you own: personal (groupId null) or
 * one of your groups' watchlists. This is how lists are shared around —
 * a browsed public list, a groupmate's list, or your own gets duplicated
 * wholesale (name + every title). Returns the new playlist's id.
 */
export async function duplicatePlaylist(
  sourceId: string,
  userId: string,
  groupId: string | null,
): Promise<string> {
  const source = await fetchPlaylist(sourceId)
  if (!source) throw new Error('That playlist is private or gone')
  const newId = await createPlaylist(userId, source.name, groupId)
  if (source.items.length > 0) {
    const { error } = await supabase.from('playlist_items').insert(
      source.items.map((item) => ({ playlist_id: newId, title_id: item.titleId })),
    )
    if (error) throw new Error(error.message)
  }
  return newId
}

/** Returns the title's row id so callers can patch their local state. */
export async function addTitleToPlaylist(playlistId: string, title: NewTitle): Promise<string> {
  const titleId = await ensureTitle(title)
  const { error } = await supabase
    .from('playlist_items')
    .insert({ playlist_id: playlistId, title_id: titleId })
  if (error && error.code !== '23505') throw new Error(error.message)
  // "freshest first" holds via the playlist_items_touch_playlist trigger.
  return titleId
}

export async function removeTitleFromPlaylist(
  playlistId: string,
  titleId: string,
): Promise<void> {
  const { error } = await supabase
    .from('playlist_items')
    .delete()
    .eq('playlist_id', playlistId)
    .eq('title_id', titleId)
  if (error) throw new Error(error.message)
}

/**
 * Which of MY playlists already hold this title (for the add-to sheet).
 * Maps playlist id -> the title's row id, so removal needs no extra lookup.
 */
export async function fetchMyPlaylistsContaining(
  userId: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('playlist_items')
    .select(
      'playlist_id, title_id, playlists!inner(owner_id, group_id), titles!inner(tmdb_id, media_type)',
    )
    // lists the user can WRITE to: their personal ones + group watchlists
    // (RLS already trims group lists to their memberships)
    .or(`and(owner_id.eq.${userId},group_id.is.null),group_id.not.is.null`, {
      referencedTable: 'playlists',
    })
    .eq('titles.tmdb_id', tmdbId)
    .eq('titles.media_type', mediaType)
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((r) => [r.playlist_id, r.title_id]))
}

// ---- friends + public profiles ---------------------------------------------

export interface FriendInfo {
  userId: string
  displayName: string
  avatarKey: string | null
  /** Names of the groups you share, for context under the name. */
  sharedGroups: string[]
}

/** Everyone you share a group with, deduped across groups. */
export async function fetchMyFriends(userId: string): Promise<FriendInfo[]> {
  const { data: mine, error: mineError } = await supabase
    .from('group_members')
    .select('group_id, groups(name)')
    .eq('user_id', userId)
  if (mineError) throw new Error(mineError.message)
  const groupIds = (mine ?? []).map((r) => r.group_id)
  if (groupIds.length === 0) return []
  const groupName = new Map((mine ?? []).map((r) => [r.group_id, r.groups?.name ?? 'a group']))

  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, user_id, profiles(display_name, avatar_key)')
    .in('group_id', groupIds)
  if (error) throw new Error(error.message)

  const byUser = new Map<string, FriendInfo>()
  for (const row of data ?? []) {
    if (row.user_id === userId) continue
    const existing = byUser.get(row.user_id)
    const shared = groupName.get(row.group_id) ?? 'a group'
    if (existing) existing.sharedGroups.push(shared)
    else
      byUser.set(row.user_id, {
        userId: row.user_id,
        displayName: row.profiles?.display_name ?? 'Member',
        avatarKey: row.profiles?.avatar_key ?? null,
        sharedGroups: [shared],
      })
  }
  return [...byUser.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export interface PublicProfile {
  displayName: string
  avatarKey: string | null
  groups: { id: string; name: string }[]
  playlists: { id: string; name: string; description: string | null; itemCount: number; posters: string[] }[]
}

/** Someone's public profile: name + the groups and playlists they chose to show. */
export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await supabase.rpc('public_profile', { p_user_id: userId })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object') return null
  const raw = data as {
    displayName?: string | null
    avatarKey?: string | null
    groups?: { id: string; name: string }[]
    playlists?: PublicProfile['playlists']
  }
  if (!raw.displayName) return null
  return {
    displayName: raw.displayName,
    avatarKey: raw.avatarKey ?? null,
    groups: raw.groups ?? [],
    playlists: raw.playlists ?? [],
  }
}

/** The signed-in user's own picked avatar key (null = initial circle). */
export async function fetchMyAvatarKey(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_key')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.avatar_key ?? null
}

/** Pick a movie-archetype avatar (or null to go back to the initial). */
export async function updateMyAvatar(userId: string, avatarKey: string | null): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_key: avatarKey })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

/** Show or hide one of YOUR group memberships on your public profile. */
export async function setGroupVisibility(groupId: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_group_visibility', {
    p_group_id: groupId,
    p_public: isPublic,
  })
  if (error) throw new Error(error.message)
}

/**
 * Everything the user owns, as one portable object: solo ratings (with their
 * per-category scores) and the saved list. Your history is yours to take.
 */
export async function fetchMyExport(userId: string): Promise<Record<string, unknown>> {
  const [ratings, saved] = await Promise.all([
    supabase
      .from('global_ratings')
      .select('updated_at, scores, titles(tmdb_id, media_type, name, year)')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    fetchMySavedTitles(userId),
  ])
  if (ratings.error) throw new Error(ratings.error.message)
  return {
    app: 'Mash Potato',
    exportedAt: new Date().toISOString(),
    soloRatings: (ratings.data ?? [])
      .filter((r) => r.titles)
      .map((r) => ({
        name: r.titles!.name,
        year: r.titles!.year,
        mediaType: r.titles!.media_type,
        tmdbId: r.titles!.tmdb_id,
        scores: scoresFromJson(r.scores),
        ratedAt: r.updated_at,
      })),
    savedTitles: saved.map((s) => ({
      name: s.name,
      year: s.year,
      mediaType: s.mediaType,
      tmdbId: s.tmdbId,
      savedAt: s.savedAt,
    })),
  }
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

// ---- discussion (threads, reactions, the compliance kit) --------------------
//
// Words follow the blind rule: group threads are SEALED per member while any
// session for that (group, title) is not open for them; public "takes" are
// posted only by people who have rated the title. Both enforced server-side
// (RLS + the post_comment RPC), never by UI hiding.

export type ReactionKind = 'like' | 'funny' | 'fire'

export interface DiscussionComment {
  id: string
  authorId: string
  authorName: string
  authorAvatarKey: string | null
  parentId: string | null
  body: string
  createdAt: string
  deleted: boolean
  reactions: Record<ReactionKind, number>
  myReaction: ReactionKind | null
}

export interface DiscussionGate {
  /** Group scope: is the thread open for me right now (sealed otherwise)? */
  openForMe: boolean
  /** Have I rated this title (gates public posting)? */
  rated: boolean
  /** Community terms accepted (first-post gate)? */
  termsAccepted: boolean
}

/** The titles-row id for a TMDB title, or null if nobody has touched it yet. */
export async function fetchTitleRowId(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<string | null> {
  const { data, error } = await supabase
    .from('titles')
    .select('id')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

/** Find-or-create the title row (posting can precede any rating or round). */
export async function ensureTitleRow(title: NewTitle): Promise<string> {
  return ensureTitle(title)
}

export async function fetchDiscussion(
  titleId: string,
  groupId: string | null,
  userId: string,
): Promise<DiscussionComment[]> {
  let query = supabase
    .from('title_comments')
    .select(
      // author embed is FK-hinted: the self-referencing parent_id makes the
      // profiles relationship ambiguous to PostgREST otherwise
      'id, author_id, parent_id, body, created_at, deleted, profiles!title_comments_author_id_fkey(display_name, avatar_key), comment_reactions(user_id, kind)',
    )
    .eq('title_id', titleId)
    .order('created_at', { ascending: true })
  query = groupId === null ? query.is('group_id', null) : query.eq('group_id', groupId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const reactions: Record<ReactionKind, number> = { like: 0, funny: 0, fire: 0 }
    let myReaction: ReactionKind | null = null
    for (const r of row.comment_reactions ?? []) {
      const kind = r.kind as ReactionKind
      if (kind in reactions) reactions[kind] += 1
      if (r.user_id === userId) myReaction = kind
    }
    return {
      id: row.id,
      authorId: row.author_id,
      authorName: row.profiles?.display_name ?? 'Member',
      authorAvatarKey: row.profiles?.avatar_key ?? null,
      parentId: row.parent_id,
      body: row.body,
      createdAt: row.created_at,
      deleted: row.deleted,
      reactions,
      myReaction,
    }
  })
}

/** How this scope stands for the viewer (sealed / rated / terms). */
export async function fetchDiscussionGate(
  titleId: string,
  groupId: string | null,
): Promise<DiscussionGate> {
  const { data, error } = await supabase.rpc('discussion_gate', {
    p_title_id: titleId,
    // generated types don't model nullable RPC params; null is valid here
    p_group_id: groupId as string,
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  return {
    openForMe: Boolean(row?.open_for_me),
    rated: Boolean(row?.rated),
    termsAccepted: Boolean(row?.terms_accepted),
  }
}

export async function acceptDiscussionTerms(): Promise<void> {
  const { error } = await supabase.rpc('accept_discussion_terms')
  if (error) throw new Error(error.message)
}

export async function postComment(
  titleId: string,
  groupId: string | null,
  parentId: string | null,
  body: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('post_comment', {
    p_title_id: titleId,
    // generated types don't model nullable RPC params; null is valid here
    p_group_id: groupId as string,
    p_parent_id: parentId as string,
    p_body: body,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function deleteComment(commentId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_comment', { p_comment_id: commentId })
  if (error) throw new Error(error.message)
}

/** Set (or switch) my reaction on a comment. */
export async function setReaction(
  commentId: string,
  userId: string,
  kind: ReactionKind,
): Promise<void> {
  const { error } = await supabase
    .from('comment_reactions')
    .upsert(
      { comment_id: commentId, user_id: userId, kind },
      { onConflict: 'comment_id,user_id' },
    )
  if (error) throw new Error(error.message)
}

export async function clearReaction(commentId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('comment_reactions')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/** Flag a comment for review; three distinct reports hide it pending review. */
export async function reportComment(
  commentId: string,
  userId: string,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('comment_reports')
    .insert({ comment_id: commentId, reporter_id: userId, reason })
  // reporting twice is a no-op, not an error
  if (error && error.code !== '23505') throw new Error(error.message)
}

/** Hide someone's comments for good, both directions. */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('user_blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId })
  if (error && error.code !== '23505') throw new Error(error.message)
}

/**
 * Cred by member for one group: reactions RECEIVED on that group's threads.
 * Peer-given and group-scoped by design; there is no global number.
 */
export async function fetchGroupCred(groupId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('group_cred', { p_group_id: groupId })
  if (error) throw new Error(error.message)
  const map = new Map<string, number>()
  for (const row of data ?? []) map.set(row.user_id, Number(row.cred))
  return map
}

/** Live refresh for an open discussion (RLS trims events per subscriber). */
export function onDiscussionChange(titleId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`discussion-${titleId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'title_comments',
        filter: `title_id=eq.${titleId}`,
      },
      onChange,
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
