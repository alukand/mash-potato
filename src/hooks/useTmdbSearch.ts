import { useEffect, useState } from 'react'
import { searchTitles } from '../lib/api'
import type { TmdbResult } from '../lib/api'

/** A search hit that knows which side of TMDB it came from. */
export interface TaggedResult extends TmdbResult {
  mediaType: 'movie' | 'tv'
}

/** Films and shows interleaved (film first), capped for a tidy dropdown. */
function interleave(movies: TaggedResult[], shows: TaggedResult[], cap = 10): TaggedResult[] {
  const out: TaggedResult[] = []
  const n = Math.max(movies.length, shows.length)
  for (let i = 0; i < n && out.length < cap; i++) {
    if (movies[i]) out.push(movies[i])
    if (shows[i] && out.length < cap) out.push(shows[i])
  }
  return out
}

/**
 * Debounced TMDB search (through the Edge Function) as the user types.
 * `media: 'both'` searches films AND shows together and interleaves the
 * results; every hit is tagged with its mediaType either way. Results are
 * empty until the query is >= 2 chars; `enabled` lets a caller pause
 * searching (e.g. once a result has been picked).
 */
export function useTmdbSearch(
  query: string,
  media: 'movie' | 'tv' | 'both',
  enabled = true,
) {
  const [results, setResults] = useState<TaggedResult[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!enabled || q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    let stale = false
    const timer = setTimeout(() => {
      const tag = (rs: TmdbResult[], t: 'movie' | 'tv'): TaggedResult[] =>
        rs.map((r) => ({ ...r, mediaType: t }))
      const run =
        media === 'both'
          ? Promise.all([
              searchTitles(q, 'movie').catch(() => [] as TmdbResult[]),
              searchTitles(q, 'tv').catch(() => [] as TmdbResult[]),
            ]).then(([m, t]) => interleave(tag(m, 'movie'), tag(t, 'tv')))
          : searchTitles(q, media).then((r) => tag(r, media))
      run
        .then((r) => {
          if (!stale) setResults(r)
        })
        .catch(() => {
          if (!stale) setResults([])
        })
        .finally(() => {
          if (!stale) setSearching(false)
        })
    }, 350)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query, media, enabled])

  return { results, searching }
}
