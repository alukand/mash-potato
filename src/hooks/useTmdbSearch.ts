import { useEffect, useState } from 'react'
import { searchTitles } from '../lib/api'
import type { TmdbResult } from '../lib/api'

/**
 * Debounced TMDB search (through the Edge Function) as the user types. Results
 * are empty until the query is >= 2 chars; `enabled` lets a caller pause
 * searching (e.g. once a result has been picked). Extracted from RateScreen so
 * Discover can reuse the exact same behaviour.
 */
export function useTmdbSearch(query: string, mediaType: 'movie' | 'tv', enabled = true) {
  const [results, setResults] = useState<TmdbResult[]>([])
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
      searchTitles(q, mediaType)
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
  }, [query, mediaType, enabled])

  return { results, searching }
}
