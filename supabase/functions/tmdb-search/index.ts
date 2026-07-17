// TMDB proxy. The TMDB key lives HERE (server-side secret) — never in the
// client binary. Callers must be signed in (verify_jwt is on by default), so
// this is not an open relay.
//
// One function, several ops (routed on `op`, default 'search' for back-compat):
//   { op?: 'search', query, mediaType }         -> { results: TmdbResult[] }
//   { op: 'detail', tmdbId, mediaType }          -> { detail: TitleDetail | null }
//   { op: 'browse', feed, mediaType }            -> { results: TmdbResult[] }
//   { op: 'genres', mediaType }                  -> { genres: {id,name}[] }
//   { op: 'person', query }                      -> { people: {id,name,profilePath}[] }
//   { op: 'discover', filters, mediaType }       -> { results: TmdbResult[] }
//   { op: 'recommendations', tmdbId, mediaType } -> { results: TmdbResult[] }
//   { op: 'providers', tmdbId, mediaType, region? } -> { providers: WatchProviders | null }
// where mediaType is 'movie' | 'tv', feed is 'trending' | 'popular', and
// filters is { genreIds?: number[]; personId?: number; year?: number }.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

const TMDB = 'https://api.themoviedb.org/3'

interface TmdbListItem {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
}

// A search/browse row — the compact shape the client's TmdbResult expects.
function mapListItem(r: TmdbListItem) {
  const date = r.release_date ?? r.first_air_date ?? ''
  const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null
  return {
    tmdbId: r.id,
    name: r.title ?? r.name ?? 'Untitled',
    year,
    posterPath: r.poster_path ?? null,
  }
}

type MediaType = 'movie' | 'tv'

function normalizeMediaType(value: unknown): MediaType {
  return value === 'tv' ? 'tv' : 'movie'
}

async function tmdbFetch(path: string, apiKey: string, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ api_key: apiKey, language: 'en-US', ...params })
  const res = await fetch(`${TMDB}${path}?${search.toString()}`)
  return res
}

// ---- op: search ----------------------------------------------------------
async function handleSearch(body: Record<string, unknown>, apiKey: string): Promise<Response> {
  const query = String(body.query ?? '').trim()
  const mediaType = normalizeMediaType(body.mediaType)
  if (query.length < 2 || query.length > 200) return json({ results: [] })

  const res = await tmdbFetch(`/search/${mediaType}`, apiKey, {
    query,
    include_adult: 'false',
    page: '1',
  })
  if (!res.ok) return json({ error: `TMDB responded ${res.status}` }, 502)
  const data = (await res.json()) as { results?: TmdbListItem[] }
  return json({ results: (data.results ?? []).slice(0, 8).map(mapListItem) })
}

// ---- op: browse (trending / popular shelves) -----------------------------
async function handleBrowse(body: Record<string, unknown>, apiKey: string): Promise<Response> {
  const mediaType = normalizeMediaType(body.mediaType)
  const feed = body.feed === 'popular' ? 'popular' : 'trending'
  const path = feed === 'popular' ? `/${mediaType}/popular` : `/trending/${mediaType}/week`

  const res = await tmdbFetch(path, apiKey, { page: '1' })
  if (!res.ok) return json({ error: `TMDB responded ${res.status}` }, 502)
  const data = (await res.json()) as { results?: TmdbListItem[] }
  return json({ results: (data.results ?? []).slice(0, 14).map(mapListItem) })
}

// ---- op: detail (full page for one title) --------------------------------
interface TmdbDetail {
  id: number
  title?: string
  name?: string
  overview?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  runtime?: number | null
  episode_run_time?: number[]
  number_of_seasons?: number | null
  genres?: { id: number; name: string }[]
  credits?: {
    cast?: { name?: string; character?: string; profile_path?: string | null }[]
  }
}

async function handleDetail(body: Record<string, unknown>, apiKey: string): Promise<Response> {
  const tmdbId = Number(body.tmdbId)
  const mediaType = normalizeMediaType(body.mediaType)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return json({ error: 'invalid tmdbId' }, 400)

  const res = await tmdbFetch(`/${mediaType}/${tmdbId}`, apiKey, {
    append_to_response: 'credits',
  })
  if (res.status === 404) return json({ detail: null })
  if (!res.ok) return json({ error: `TMDB responded ${res.status}` }, 502)
  const d = (await res.json()) as TmdbDetail

  const date = d.release_date ?? d.first_air_date ?? ''
  const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null
  const runtimeMinutes =
    mediaType === 'movie'
      ? (d.runtime ?? null)
      : (d.episode_run_time && d.episode_run_time.length > 0 ? d.episode_run_time[0] : null)

  const detail = {
    tmdbId: d.id,
    mediaType,
    name: d.title ?? d.name ?? 'Untitled',
    year,
    overview: d.overview ?? '',
    genres: (d.genres ?? []).map((g) => g.name),
    genreIds: (d.genres ?? []).map((g) => g.id),
    runtimeMinutes,
    seasons: mediaType === 'tv' ? (d.number_of_seasons ?? null) : null,
    tmdbRating: typeof d.vote_average === 'number' ? Math.round(d.vote_average * 10) / 10 : null,
    voteCount: d.vote_count ?? 0,
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    cast: (d.credits?.cast ?? []).slice(0, 8).map((c) => ({
      name: c.name ?? '',
      character: c.character ?? '',
      profilePath: c.profile_path ?? null,
    })),
  }
  return json({ detail })
}

// ---- op: genres (the genre catalog for the filter chips) -----------------
async function handleGenres(body: Record<string, unknown>, apiKey: string): Promise<Response> {
  const mediaType = normalizeMediaType(body.mediaType)
  const res = await tmdbFetch(`/genre/${mediaType}/list`, apiKey)
  if (!res.ok) return json({ error: `TMDB responded ${res.status}` }, 502)
  const data = (await res.json()) as { genres?: { id: number; name: string }[] }
  return json({ genres: data.genres ?? [] })
}

// ---- op: person (actor / director lookup for the people filter) ----------
interface TmdbPerson {
  id: number
  name?: string
  profile_path?: string | null
  known_for_department?: string
}

async function handlePerson(body: Record<string, unknown>, apiKey: string): Promise<Response> {
  const query = String(body.query ?? '').trim()
  if (query.length < 2 || query.length > 100) return json({ people: [] })

  const res = await tmdbFetch('/search/person', apiKey, {
    query,
    include_adult: 'false',
    page: '1',
  })
  if (!res.ok) return json({ error: `TMDB responded ${res.status}` }, 502)
  const data = (await res.json()) as { results?: TmdbPerson[] }
  return json({
    people: (data.results ?? []).slice(0, 8).map((p) => ({
      id: p.id,
      name: p.name ?? '',
      profilePath: p.profile_path ?? null,
      department: p.known_for_department ?? null,
    })),
  })
}

// ---- op: discover (filter by genre / person / year) ----------------------
interface DiscoverFilters {
  genreIds?: number[]
  personId?: number
  year?: number
}

async function handleDiscover(body: Record<string, unknown>, apiKey: string): Promise<Response> {
  const mediaType = normalizeMediaType(body.mediaType)
  const filters = (body.filters ?? {}) as DiscoverFilters

  const params: Record<string, string> = {
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: '1',
  }
  if (Array.isArray(filters.genreIds) && filters.genreIds.length > 0) {
    params.with_genres = filters.genreIds.join(',')
  }
  // with_people matches cast OR crew, so one control covers actors + directors.
  if (typeof filters.personId === 'number') {
    params.with_people = String(filters.personId)
  }
  if (typeof filters.year === 'number') {
    params[mediaType === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = String(
      filters.year,
    )
  }

  const res = await tmdbFetch(`/discover/${mediaType}`, apiKey, params)
  if (!res.ok) return json({ error: `TMDB responded ${res.status}` }, 502)
  const data = (await res.json()) as { results?: TmdbListItem[] }
  return json({ results: (data.results ?? []).slice(0, 20).map(mapListItem) })
}

// ---- op: recommendations (TMDB's "more like this" for one title) ----------
async function handleRecommendations(
  body: Record<string, unknown>,
  apiKey: string,
): Promise<Response> {
  const tmdbId = Number(body.tmdbId)
  const mediaType = normalizeMediaType(body.mediaType)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return json({ error: 'invalid tmdbId' }, 400)

  const res = await tmdbFetch(`/${mediaType}/${tmdbId}/recommendations`, apiKey, { page: '1' })
  if (res.status === 404) return json({ results: [] })
  if (!res.ok) return json({ error: `TMDB responded ${res.status}` }, 502)
  const data = (await res.json()) as { results?: TmdbListItem[] }
  return json({ results: (data.results ?? []).slice(0, 16).map(mapListItem) })
}

// ---- op: providers (where to stream / rent / buy; JustWatch data) ---------
interface TmdbProvider {
  provider_name?: string
  logo_path?: string | null
  display_priority?: number
}

function mapProviders(list: TmdbProvider[] | undefined) {
  return (list ?? [])
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99))
    .slice(0, 8)
    .map((p) => ({ name: p.provider_name ?? 'Unknown', logoPath: p.logo_path ?? null }))
}

async function handleProviders(body: Record<string, unknown>, apiKey: string): Promise<Response> {
  const mediaType = normalizeMediaType(body.mediaType)
  const tmdbId = Number(body.tmdbId)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return json({ providers: null })
  const region = /^[A-Z]{2}$/.test(String(body.region ?? '')) ? String(body.region) : 'US'

  const res = await tmdbFetch(`/${mediaType}/${tmdbId}/watch/providers`, apiKey)
  if (!res.ok) return json({ error: `TMDB responded ${res.status}` }, 502)
  const data = (await res.json()) as {
    results?: Record<
      string,
      { link?: string; flatrate?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[]; free?: TmdbProvider[] }
    >
  }
  const forRegion = data.results?.[region] ?? (region !== 'US' ? data.results?.US : undefined)
  if (!forRegion) return json({ providers: null })
  return json({
    providers: {
      link: forRegion.link ?? null,
      stream: mapProviders([...(forRegion.flatrate ?? []), ...(forRegion.free ?? [])]),
      rent: mapProviders(forRegion.rent),
      buy: mapProviders(forRegion.buy),
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }

  const apiKey = Deno.env.get('TMDB_API_KEY')
  if (!apiKey) {
    return json({ error: 'TMDB_API_KEY is not configured' }, 500)
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const op = body.op ?? 'search'
  switch (op) {
    case 'search':
      return handleSearch(body, apiKey)
    case 'browse':
      return handleBrowse(body, apiKey)
    case 'detail':
      return handleDetail(body, apiKey)
    case 'genres':
      return handleGenres(body, apiKey)
    case 'person':
      return handlePerson(body, apiKey)
    case 'discover':
      return handleDiscover(body, apiKey)
    case 'recommendations':
      return handleRecommendations(body, apiKey)
    case 'providers':
      return handleProviders(body, apiKey)
    default:
      return json({ error: `unknown op: ${String(op)}` }, 400)
  }
})
