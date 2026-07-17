import { useEffect, useState } from 'react'
import { fetchBrowse, fetchDiscover, fetchGenres, fetchGenreShelf, searchPeople } from '../lib/api'
import type { TmdbGenre, TmdbPerson, TmdbResult } from '../lib/api'
import { useTmdbSearch } from '../hooks/useTmdbSearch'
import { fieldClass } from '../components/ui'
import { PosterShelf } from '../components/PosterShelf'
import { PosterResultGrid } from '../components/PosterResultGrid'

interface DiscoverScreenProps {
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
}

const MEDIA_KEY = 'mp.discoverMedia'

// Genre browse rows under the trending/popular shelves. TMDB genre ids
// differ between films and TV, so each side gets its own lineup.
const GENRE_SHELVES: Record<'movie' | 'tv', { heading: string; genreId: number }[]> = {
  movie: [
    { heading: 'Comedy nights', genreId: 35 },
    { heading: 'Horror nights', genreId: 27 },
    { heading: 'Animated', genreId: 16 },
    { heading: 'Sci-Fi', genreId: 878 },
    { heading: 'Thrillers', genreId: 53 },
    { heading: 'Romance', genreId: 10749 },
    { heading: 'Documentaries', genreId: 99 },
  ],
  tv: [
    { heading: 'Comedy', genreId: 35 },
    { heading: 'Animated', genreId: 16 },
    { heading: 'Sci-Fi & Fantasy', genreId: 10765 },
    { heading: 'Crime', genreId: 80 },
    { heading: 'Drama', genreId: 18 },
    { heading: 'Documentaries', genreId: 99 },
  ],
}

// Discover: free-text search, filter by genre / actor / director / year, and
// trending / popular shelves. Every result opens that title's detail page.
export function DiscoverScreen({ onOpenTitle }: DiscoverScreenProps) {
  const [query, setQuery] = useState('')
  // The films/TV switch persists: coming back lands where you were browsing.
  const [mediaType, setMediaTypeState] = useState<'movie' | 'tv'>(() => {
    try {
      return localStorage.getItem(MEDIA_KEY) === 'tv' ? 'tv' : 'movie'
    } catch {
      return 'movie'
    }
  })
  const setMediaType = (m: 'movie' | 'tv') => {
    setMediaTypeState(m)
    try {
      localStorage.setItem(MEDIA_KEY, m)
    } catch {
      // ignore
    }
  }
  const { results, searching } = useTmdbSearch(query, mediaType)

  // filters
  const [showFilters, setShowFilters] = useState(false)
  const [genres, setGenres] = useState<TmdbGenre[]>([])
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([])
  const [personQuery, setPersonQuery] = useState('')
  const [personResults, setPersonResults] = useState<TmdbPerson[]>([])
  const [selectedPerson, setSelectedPerson] = useState<TmdbPerson | null>(null)
  const [year, setYear] = useState('')

  const [discoverResults, setDiscoverResults] = useState<TmdbResult[]>([])
  const [discovering, setDiscovering] = useState(false)

  // shelves
  const [trendingMovies, setTrendingMovies] = useState<TmdbResult[]>([])
  const [trendingTv, setTrendingTv] = useState<TmdbResult[]>([])
  const [popularMovies, setPopularMovies] = useState<TmdbResult[]>([])
  const [genreShelves, setGenreShelves] = useState<{ heading: string; items: TmdbResult[] }[]>([])
  const [shelfError, setShelfError] = useState<string | null>(null)

  const yearNum = /^\d{4}$/.test(year) ? Number(year) : undefined
  const genreKey = selectedGenreIds.join(',')
  const hasFilters = selectedGenreIds.length > 0 || selectedPerson !== null || yearNum !== undefined
  const textActive = query.trim().length >= 2

  // Load the genre catalog for the current media type (ids differ movie vs tv).
  useEffect(() => {
    let cancelled = false
    setSelectedGenreIds([])
    fetchGenres(mediaType)
      .then((g) => !cancelled && setGenres(g))
      .catch(() => !cancelled && setGenres([]))
    return () => {
      cancelled = true
    }
  }, [mediaType])

  // Debounced people search for the person picker.
  useEffect(() => {
    const q = personQuery.trim()
    if (selectedPerson || q.length < 2) {
      setPersonResults([])
      return
    }
    let stale = false
    const t = setTimeout(() => {
      searchPeople(q)
        .then((p) => !stale && setPersonResults(p))
        .catch(() => !stale && setPersonResults([]))
    }, 350)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [personQuery, selectedPerson])

  // Run a filtered discovery when filters are set and no text search is active.
  useEffect(() => {
    if (textActive || !hasFilters) {
      setDiscoverResults([])
      return
    }
    let stale = false
    setDiscovering(true)
    const t = setTimeout(() => {
      fetchDiscover(
        {
          genreIds: selectedGenreIds,
          personId: selectedPerson?.id,
          year: yearNum,
        },
        mediaType,
      )
        .then((r) => !stale && setDiscoverResults(r))
        .catch(() => !stale && setDiscoverResults([]))
        .finally(() => !stale && setDiscovering(false))
    }, 300)
    return () => {
      stale = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreKey, selectedPerson, yearNum, mediaType, textActive, hasFilters])

  // Trending / popular shelves (cached in api.ts).
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
        if (!cancelled) setShelfError(err instanceof Error ? err.message : 'Could not load shelves')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Genre rows follow the Films/TV switch (ids differ per side, cached too).
  useEffect(() => {
    let cancelled = false
    const lineup = GENRE_SHELVES[mediaType]
    Promise.all(
      lineup.map((s) =>
        fetchGenreShelf(s.genreId, mediaType)
          .then((items) => ({ heading: s.heading, items }))
          .catch(() => ({ heading: s.heading, items: [] as TmdbResult[] })),
      ),
    ).then((shelves) => {
      if (cancelled) return
      setGenreShelves(shelves.filter((s) => s.items.length > 0))
    })
    return () => {
      cancelled = true
    }
  }, [mediaType])

  function toggleGenre(id: number) {
    setSelectedGenreIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    )
  }

  function clearFilters() {
    setSelectedGenreIds([])
    setSelectedPerson(null)
    setPersonQuery('')
    setYear('')
  }

  const activeFilterCount =
    selectedGenreIds.length + (selectedPerson ? 1 : 0) + (yearNum !== undefined ? 1 : 0)

  return (
    <div className="flex flex-col gap-6">
      <section className="mp-rise">
        <p className="mb-3 px-1 text-[13px] leading-snug text-muted">
          Look up any film or show: rate it solo on the standard rubric and see how it stacks up
          against everyone else on Mash Potato.
        </p>
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
          className={fieldClass}
        />

        {/* filter toggle */}
        <div className="mt-2 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="tabular text-teal">{activeFilterCount}</span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-coral"
            >
              Clear
            </button>
          )}
        </div>
        {searching && <p className="mt-1 px-1 font-mono text-[10px] text-muted">searching…</p>}
        {textActive && hasFilters && (
          <p className="mt-1 px-1 text-[12px] leading-snug text-muted">
            Showing text matches. Clear the search box to browse by filters.
          </p>
        )}

        {/* filter panel */}
        {showFilters && (
          <div className="mp-card mt-3 flex flex-col gap-4 rounded-2xl p-4">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Genre
              </p>
              <div className="flex flex-wrap gap-1.5">
                {genres.map((g) => {
                  const on = selectedGenreIds.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGenre(g.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                        on
                          ? 'border-teal/40 bg-teal/10 text-teal'
                          : 'border-line text-muted hover:text-text'
                      }`}
                    >
                      {g.name}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Actor or director
              </p>
              {selectedPerson ? (
                <div className="flex items-center gap-2 rounded-full border border-teal/30 bg-teal/5 px-3 py-1.5">
                  <span className="flex-1 truncate text-[13px] font-medium">
                    {selectedPerson.name}
                    {selectedPerson.department && (
                      <span className="ml-1.5 font-mono text-[10px] text-muted">
                        {selectedPerson.department}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPerson(null)
                      setPersonQuery('')
                    }}
                    className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-coral"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    maxLength={100}
                    placeholder="e.g. Christopher Nolan"
                    value={personQuery}
                    onChange={(e) => setPersonQuery(e.target.value)}
                    className={fieldClass}
                  />
                  {personResults.length > 0 && (
                    <ul className="mt-2 overflow-hidden rounded-xl border border-line bg-surface-2">
                      {personResults.map((p, i) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPerson(p)
                              setPersonResults([])
                            }}
                            className={`group flex w-full items-center gap-2 px-3 py-2 text-left ${
                              i > 0 ? 'border-t border-line/50' : ''
                            }`}
                          >
                            <span className="flex-1 truncate text-[13px] transition-colors group-hover:text-teal">{p.name}</span>
                            {p.department && (
                              <span className="shrink-0 font-mono text-[10px] text-muted">
                                {p.department}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Year
              </p>
              <input
                type="number"
                min={1870}
                max={2100}
                placeholder="e.g. 2014"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>
        )}
      </section>

      {textActive ? (
        <section className="mp-rise">
          {results.length > 0 ? (
            <PosterResultGrid results={results} mediaType={mediaType} onOpenTitle={onOpenTitle} />
          ) : (
            !searching && (
              <p className="px-1 text-[13px] text-muted">No matches for “{query.trim()}”.</p>
            )
          )}
        </section>
      ) : hasFilters ? (
        <section className="mp-rise">
          {discovering ? (
            <p className="px-1 font-mono text-[10px] text-muted">finding titles…</p>
          ) : discoverResults.length > 0 ? (
            <PosterResultGrid results={discoverResults} mediaType={mediaType} onOpenTitle={onOpenTitle} />
          ) : (
            <p className="px-1 text-[13px] text-muted">No titles match those filters.</p>
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
          {/* genre rows follow the Films/TV switch above */}
          {genreShelves.map((shelf, i) => (
            <div
              key={`${mediaType}:${shelf.heading}`}
              className="mp-rise"
              style={{ animationDelay: `${Math.min(240 + i * 80, 640)}ms` }}
            >
              <PosterShelf
                heading={shelf.heading}
                items={shelf.items}
                onPick={(it) => onOpenTitle(it.tmdbId, mediaType)}
              />
            </div>
          ))}
        </div>
      )}

      <p className="px-2 text-center text-[13px] leading-snug text-muted">
        Browse &amp; search powered by{' '}
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-teal">
          TMDB
        </a>
        .
      </p>
    </div>
  )
}
