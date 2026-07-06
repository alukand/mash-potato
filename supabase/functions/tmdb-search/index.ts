// TMDB search proxy. The TMDB key lives HERE (server-side secret) — never in
// the client binary. Callers must be signed in (verify_jwt is on by default),
// so this is not an open relay.
//
// POST { query: string, mediaType: 'movie' | 'tv' }
// ->   { results: [{ tmdbId, name, year, posterPath }] }

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

interface TmdbMovie {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
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

  let query = ''
  let mediaType: 'movie' | 'tv' = 'movie'
  try {
    const body = await req.json()
    query = String(body.query ?? '').trim()
    mediaType = body.mediaType === 'tv' ? 'tv' : 'movie'
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }
  if (query.length < 2 || query.length > 200) {
    return json({ results: [] })
  }

  const url =
    `https://api.themoviedb.org/3/search/${mediaType}` +
    `?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1` +
    `&api_key=${apiKey}`

  const tmdbRes = await fetch(url)
  if (!tmdbRes.ok) {
    return json({ error: `TMDB responded ${tmdbRes.status}` }, 502)
  }
  const data = (await tmdbRes.json()) as { results?: TmdbMovie[] }

  const results = (data.results ?? []).slice(0, 8).map((r) => {
    const date = r.release_date ?? r.first_air_date ?? ''
    const year = /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null
    return {
      tmdbId: r.id,
      name: r.title ?? r.name ?? 'Untitled',
      year,
      posterPath: r.poster_path ?? null,
    }
  })

  return json({ results })
})
