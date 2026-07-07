import { useEffect, useState } from 'react'
import { fetchBrowse, posterUrl } from '../lib/api'
import type { TmdbResult } from '../lib/api'
import { useTmdbSearch } from '../hooks/useTmdbSearch'
import { PosterShelf } from '../components/PosterShelf'

interface DiscoverScreenProps {
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
}

const inputClass =
  'w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-text ' +
  'placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60'

// Discover: search any TMDB title + trending / popular shelves. Every result
// opens that title's detail page.
export function DiscoverScreen({ onOpenTitle }: DiscoverScreenProps) {
  const [query, setQuery] = useState('')
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie')
  const { results, searching } = useTmdbSearch(query, mediaType)

  const [trendingMovies, setTrendingMovies] = useState<TmdbResult[]>([])
  const [trendingTv, setTrendingTv] = useState<TmdbResult[]>([])
  const [popularMovies, setPopularMovies] = useState<TmdbResult[]>([])
  const [shelfError, setShelfError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchBrowse('trending', 'movie'),
      fetchBrowse('trending', 'tv'),
      fetchBrowse('popular', 'movie'),
    ])
      .then(([tm, tv, pm]) => {
        if (cancelled) return
        setTrendingMovies(tm)
        setTrendingTv(tv)
        setPopularMovies(pm)
      })
      .catch((err) => {
        if (!cancelled) {
          setShelfError(err instanceof Error ? err.message : 'Could not load shelves')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isSearching = query.trim().length >= 2

  return (
    <div className="flex flex-col gap-6">
      <section className="mp-rise">
        <div className="mb-3 flex rounded-full border border-line bg-surface-2 p-1">
          {(['movie', 'tv'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMediaType(m)}
              className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition-colors ${
                mediaType === m ? 'bg-teal/10 text-teal' : 'text-muted'
              }`}
            >
              {m === 'movie' ? 'Films' : 'TV'}
            </button>
          ))}
        </div>
        <input
          type="text"
          maxLength={200}
          placeholder={`Search ${mediaType === 'movie' ? 'films' : 'TV shows'}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={inputClass}
        />
        {searching && <p className="mt-2 px-1 font-mono text-[10px] text-muted">searching…</p>}
      </section>

      {isSearching ? (
        <section className="mp-rise">
          {results.length > 0 ? (
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface-2">
              {results.map((r, i) => (
                <li key={`${r.tmdbId}`}>
                  <button
                    type="button"
                    onClick={() => onOpenTitle(r.tmdbId, mediaType)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface ${
                      i > 0 ? 'border-t border-line/50' : ''
                    }`}
                  >
                    {r.posterPath ? (
                      <img
                        src={posterUrl(r.posterPath, 'w92')}
                        alt=""
                        className="h-12 w-8 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="grid h-12 w-8 shrink-0 place-items-center rounded-md bg-line font-display text-sm font-semibold text-bg"
                      >
                        {r.name.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">{r.year ?? '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            !searching && (
              <p className="px-1 text-[13px] text-muted">No matches for “{query.trim()}”.</p>
            )
          )}
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {shelfError && <p className="px-1 text-[12px] text-coral">{shelfError}</p>}
          <div className="mp-rise">
            <PosterShelf
              heading="Trending films"
              items={trendingMovies}
              onPick={(it) => onOpenTitle(it.tmdbId, 'movie')}
            />
          </div>
          <div className="mp-rise" style={{ animationDelay: '80ms' }}>
            <PosterShelf
              heading="Trending TV"
              items={trendingTv}
              onPick={(it) => onOpenTitle(it.tmdbId, 'tv')}
            />
          </div>
          <div className="mp-rise" style={{ animationDelay: '160ms' }}>
            <PosterShelf
              heading="Popular films"
              items={popularMovies}
              onPick={(it) => onOpenTitle(it.tmdbId, 'movie')}
            />
          </div>
        </div>
      )}

      <p className="px-2 text-center text-[12px] leading-snug text-muted">
        Browse &amp; search powered by{' '}
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-teal">
          TMDB
        </a>
        .
      </p>
    </div>
  )
}
