import { useEffect, useRef, useState } from 'react'
import {
  fetchBrowse,
  fetchDiscover,
  fetchGenres,
  fetchMyGlobalRatings,
  fetchMyReviewedTitles,
  fetchRecommendations,
  fetchShelf,
  fetchStreamingServices,
  searchPeople,
} from '../lib/api'
import type { BrowseFeed, DiscoverFilters, TmdbGenre, TmdbPerson, TmdbResult } from '../lib/api'
import { useTmdbSearch } from '../hooks/useTmdbSearch'
import type { TaggedResult } from '../hooks/useTmdbSearch'
import { JustWatchCredit, ProviderLogo, fieldClass } from '../components/ui'
import {
  NO_STREAMING,
  parseStreamingPrefs,
  servicesFor,
  streamingFilterOf,
  streamingKey,
  streamingPhrase,
} from '../lib/streaming'
import type { StreamingFilter, StreamingPrefs, StreamingService } from '../lib/streaming'
import { PosterShelf } from '../components/PosterShelf'
import { PosterResultGrid } from '../components/PosterResultGrid'
import { Sticker } from '../components/Sticker'

interface DiscoverScreenProps {
  /** null = signed out. Browsing is public; only the "Because you rated"
   *  seeds need an account (guideline 5.1.1(v)). */
  userId: string | null
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
}

const MEDIA_KEY = 'mp.discoverMedia'
const STREAMING_KEY = 'mp.discoverStreaming'
type TypeFilter = 'both' | 'movie' | 'tv'

// Anime is not a TMDB genre: the chip is synthetic (negative id) and expands
// to Animation (16) + Japanese original language in the discover query.
const ANIME_CHIP_ID = -16

// ---- the shelf lineup (streaming-home style) --------------------------------
// ONE stack, films and shows interleaved — each row is a recipe (a TMDB list
// feed or a discover query) on one side of TMDB. The Type filter narrows the
// stack; rows load lazily as you scroll (LazyShelf) and cache in api.ts.
type ShelfSpec = { kind: 'browse'; feed: BrowseFeed } | { kind: 'discover'; filters: DiscoverFilters }

type ShelfDef = { key: string; heading: string; media: 'movie' | 'tv'; spec: ShelfSpec }

const movieRow =(key: string, heading: string, spec: ShelfSpec): ShelfDef => ({
  key,
  heading,
  media: 'movie',
  spec,
})
const tvRow = (key: string, heading: string, spec: ShelfSpec): ShelfDef => ({
  key,
  heading,
  media: 'tv',
  spec,
})
const genre = (id: number): ShelfSpec => ({ kind: 'discover', filters: { genreIds: [id] } })
const browse = (feed: BrowseFeed): ShelfSpec => ({ kind: 'browse', feed })

// A gem needs time to become hidden: cut the row off two years back so
// brand-new titles with a handful of inflated early votes don't crowd it.
const GEMS_MAX_YEAR = new Date().getFullYear() - 2

const SHELVES: ShelfDef[] = [
  movieRow('m-trending', 'Trending films', browse('trending')),
  tvRow('t-trending', 'Trending TV', browse('trending')),
  // the personalized rows slot in here (see recs below)
  movieRow('m-popular', 'Popular films', browse('popular')),
  tvRow('t-popular', 'Popular shows', browse('popular')),
  movieRow('m-now', 'In theaters now', browse('now_playing')),
  tvRow('t-onair', 'On the air now', browse('now_playing')),
  movieRow('m-soon', 'Coming soon', browse('upcoming')),
  movieRow('m-top', 'Top rated films', browse('top_rated')),
  tvRow('t-top', 'Top rated shows', browse('top_rated')),
  movieRow('m-comedy', 'Comedy nights', genre(35)),
  tvRow('t-comedy', 'Comedy shows', genre(35)),
  movieRow('m-horror', 'Horror nights', genre(27)),
  movieRow('m-gems', 'Hidden gems', {
    kind: 'discover',
    filters: { sortBy: 'rating', minRating: 7.4, minVotes: 200, maxVotes: 2500, yearTo: GEMS_MAX_YEAR },
  }),
  tvRow('t-gems', 'Hidden gem shows', {
    kind: 'discover',
    filters: { sortBy: 'rating', minRating: 7.6, minVotes: 100, maxVotes: 1500, yearTo: GEMS_MAX_YEAR },
  }),
  movieRow('m-nineties', '90s throwbacks', {
    kind: 'discover',
    filters: { yearFrom: 1990, yearTo: 1999, minVotes: 300 },
  }),
  movieRow('m-eighties', '80s classics', {
    kind: 'discover',
    filters: { yearFrom: 1980, yearTo: 1989, minVotes: 300 },
  }),
  movieRow('m-animated', 'Animated films', genre(16)),
  tvRow('t-animated', 'Animated shows', genre(16)),
  // Anime is not a TMDB genre; the standard recipe is Animation + Japanese
  // original language.
  movieRow('m-anime', 'Anime films', {
    kind: 'discover',
    filters: { genreIds: [16], language: 'ja' },
  }),
  tvRow('t-anime', 'Anime series', {
    kind: 'discover',
    filters: { genreIds: [16], language: 'ja' },
  }),
  movieRow('m-thrillers', 'Acclaimed thrillers', {
    kind: 'discover',
    filters: { genreIds: [53], sortBy: 'rating', minVotes: 800 },
  }),
  movieRow('m-scifi', 'Sci-Fi films', genre(878)),
  tvRow('t-scifi', 'Sci-Fi & Fantasy shows', genre(10765)),
  movieRow('m-action', 'Action', genre(28)),
  tvRow('t-crime', 'Crime shows', genre(80)),
  movieRow('m-romance', 'Romance', genre(10749)),
  movieRow('m-crime', 'Crime films', genre(80)),
  tvRow('t-drama', 'Drama series', genre(18)),
  movieRow('m-family', 'Family night', genre(10751)),
  tvRow('t-mystery', 'TV mysteries', genre(9648)),
  movieRow('m-fantasy', 'Fantasy', genre(14)),
  movieRow('m-mystery', 'Mysteries', genre(9648)),
  tvRow('t-actadv', 'Action & Adventure shows', genre(10759)),
  movieRow('m-war', 'War stories', genre(10752)),
  tvRow('t-nineties', '90s TV', {
    kind: 'discover',
    filters: { yearFrom: 1990, yearTo: 1999, minVotes: 200 },
  }),
  movieRow('m-western', 'Westerns', genre(37)),
  tvRow('t-kids', 'For the kids', genre(10762)),
  movieRow('m-music', 'Music & musicals', genre(10402)),
  tvRow('t-reality', 'Reality', genre(10764)),
  movieRow('m-history', 'History', genre(36)),
  movieRow('m-docs', 'Documentaries', genre(99)),
  tvRow('t-docs', 'Doc series', genre(99)),
]

const loadShelf = (spec: ShelfSpec, media: 'movie' | 'tv') =>
  spec.kind === 'browse' ? fetchBrowse(spec.feed, media) : fetchShelf(spec.filters, media)

const THIS_YEAR = new Date().getFullYear()

// With "Where to watch" on, every row becomes a discover query on those
// services. TMDB's list feeds take no such filter, so each maps to its nearest
// recipe: trending becomes new and popular, and the theater rows drop out
// (nothing in theaters streams yet).
function onServices(shelf: ShelfDef, streaming: StreamingFilter): ShelfDef | null {
  const { spec, media } = shelf
  const row = (filters: DiscoverFilters, heading = shelf.heading): ShelfDef => ({
    ...shelf,
    heading,
    spec: { kind: 'discover', filters: { ...filters, streaming } },
  })
  if (spec.kind === 'discover') return row(spec.filters)
  switch (spec.feed) {
    case 'trending':
      return row({ yearFrom: THIS_YEAR - 1 }, media === 'movie' ? 'New and popular films' : 'New and popular shows')
    case 'popular':
      return row({})
    case 'top_rated':
      return row({ sortBy: 'rating', minVotes: media === 'movie' ? 1000 : 300 })
    case 'now_playing':
      return media === 'tv' ? row({ onTheAir: true }) : null
    case 'upcoming':
      return null
  }
}

// A shelf that waits to fetch until it's near the viewport (streaming-home
// pattern: the lineup is long, the network cost is per-row). Empty rows
// collapse; the placeholder holds the row's height so the page doesn't jump.
function LazyShelf({
  heading,
  eager,
  load,
  onPick,
}: {
  heading: string
  eager?: boolean
  load: () => Promise<TmdbResult[]>
  onPick: (item: TmdbResult) => void
}) {
  const [items, setItems] = useState<TmdbResult[] | undefined>(undefined)
  const [visible, setVisible] = useState(eager === true)
  const hostRef = useRef<HTMLDivElement | null>(null)

  // Visibility via a direct rect check on scroll/resize (not
  // IntersectionObserver or rAF: parked webviews can starve both, and a
  // shelf that never loads is a broken page). Listeners detach the moment
  // the shelf goes visible.
  useEffect(() => {
    if (visible) return
    const el = hostRef.current
    if (!el) {
      setVisible(true)
      return
    }
    const check = () => {
      const r = el.getBoundingClientRect()
      if (r.top < window.innerHeight + 700 && r.bottom > -700) setVisible(true)
    }
    check()
    window.addEventListener('scroll', check, { passive: true, capture: true })
    window.addEventListener('resize', check, { passive: true })
    return () => {
      window.removeEventListener('scroll', check, { capture: true })
      window.removeEventListener('resize', check)
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    load()
      .then((r) => {
        if (!cancelled) setItems(r)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
    // load is stable per mount (shelves remount by key on filter change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  if (items && items.length === 0) return null
  const skeletonClass = visible ? 'mp-skeleton' : 'bg-surface-2'
  return (
    <div ref={hostRef} className="mp-rise">
      {items ? (
        <PosterShelf heading={heading} items={items} onPick={onPick} />
      ) : (
        <section aria-hidden>
          <p className="mb-1 flex min-h-11 items-center px-1 font-display text-[19px] font-semibold">
            {heading}
          </p>
          <div className="flex gap-3 overflow-hidden pb-3 pt-2">{[0, 1, 2, 3].map((i) => <div key={i} className="w-[104px] shrink-0"><div className={`${skeletonClass} h-[156px] rounded-xl`} /><div className={`${skeletonClass} mt-2 h-4 w-4/5 rounded-full`} /><div className={`${skeletonClass} mt-2 h-3 w-2/5 rounded-full`} /></div>)}</div>
        </section>
      )}
    </div>
  )
}

// Discover: one search box for films AND shows, filters (type, where to
// watch, genre, people, year), and a streaming-style shelf stack mixing both
// sides of TMDB. Where to watch narrows all three: search, the filtered grid
// and the shelves. Every result opens that title's detail page.
export function DiscoverScreen({ userId, onOpenTitle }: DiscoverScreenProps) {
  const [query, setQuery] = useState('')
  // The type filter persists: coming back lands where you were browsing.
  const [typeFilter, setTypeFilterState] = useState<TypeFilter>(() => {
    try {
      const v = localStorage.getItem(MEDIA_KEY)
      return v === 'movie' || v === 'tv' ? v : 'both'
    } catch {
      return 'both'
    }
  })
  const setTypeFilter = (t: TypeFilter) => {
    setTypeFilterState(t)
    try {
      localStorage.setItem(MEDIA_KEY, t)
    } catch {
      // ignore
    }
  }
  // Where to watch persists too (your services rarely change); each mode
  // keeps its own picks. streamingFilterOf decides what actually filters:
  // the stored picks while the region's list loads, the ones it lists once
  // it's in, and nothing when there is no list.
  const [streamingPrefs, setStreamingPrefsState] = useState<StreamingPrefs>(() => {
    try {
      return parseStreamingPrefs(localStorage.getItem(STREAMING_KEY))
    } catch {
      return NO_STREAMING
    }
  })
  const setStreamingPrefs = (next: StreamingPrefs) => {
    setStreamingPrefsState(next)
    try {
      localStorage.setItem(STREAMING_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }
  // The region's services: null until in, [] when tmdb-search has no list.
  const [services, setServices] = useState<StreamingService[] | null>(null)
  const [moreServices, setMoreServices] = useState(false)
  const streaming = streamingFilterOf(streamingPrefs, services)
  const streamKey = streamingKey(streaming)
  const picked = streamingPrefs[streamingPrefs.mode]
  const serviceChips = services ? servicesFor(services, streamingPrefs.mode, picked) : { main: [], more: [] }

  const { results, searching } = useTmdbSearch(query, typeFilter, true, streaming)

  // filters
  const [showFilters, setShowFilters] = useState(false)
  const [genres, setGenres] = useState<TmdbGenre[]>([])
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([])
  const [personQuery, setPersonQuery] = useState('')
  const [personResults, setPersonResults] = useState<TmdbPerson[]>([])
  const [selectedPerson, setSelectedPerson] = useState<TmdbPerson | null>(null)
  const [year, setYear] = useState('')

  const [discoverResults, setDiscoverResults] = useState<TaggedResult[]>([])
  const [discovering, setDiscovering] = useState(false)

  // "Because you rated {title}" seeds, one per side (your latest rating).
  const [recSeeds, setRecSeeds] = useState<
    { media: 'movie' | 'tv'; tmdbId: number; name: string }[]
  >([])

  const yearNum = /^\d{4}$/.test(year) ? Number(year) : undefined
  const genreKey = selectedGenreIds.join(',')
  const hasFilters = selectedGenreIds.length > 0 || selectedPerson !== null || yearNum !== undefined
  const textActive = query.trim().length >= 2

  // Load the genre catalog for the filter chips (merged across both sides
  // when the type filter is open — ids are shared where genres overlap).
  useEffect(() => {
    let cancelled = false
    const want: ('movie' | 'tv')[] = typeFilter === 'both' ? ['movie', 'tv'] : [typeFilter]
    Promise.all(want.map((m) => fetchGenres(m).catch(() => [] as TmdbGenre[])))
      .then((lists) => {
        if (cancelled) return
        const byId = new Map<number, TmdbGenre>()
        for (const list of lists) for (const genre of list) byId.set(genre.id, byId.get(genre.id) ?? genre)
        byId.set(ANIME_CHIP_ID, { id: ANIME_CHIP_ID, name: 'Anime' })
        setGenres([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)))
        // Keep the picks that still exist in the new catalog instead of
        // clearing them: switching All -> Films used to silently discard
        // every genre chip the user had selected.
        setSelectedGenreIds((prev) => prev.filter((id) => byId.has(id)))
      })
      .catch(() => !cancelled && setGenres([]))
    return () => {
      cancelled = true
    }
  }, [typeFilter])

  // The region's services, for the chips and the summary line. Without a list
  // (an older tmdb-search) the section stays hidden.
  useEffect(() => {
    let cancelled = false
    fetchStreamingServices()
      .then((list) => !cancelled && setServices(list))
      .catch(() => !cancelled && setServices([]))
    return () => {
      cancelled = true
    }
  }, [])

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
      const anime = selectedGenreIds.includes(ANIME_CHIP_ID)
      const realIds = selectedGenreIds.filter((id) => id > 0)
      const filters = {
        genreIds: anime && !realIds.includes(16) ? [...realIds, 16] : realIds,
        personId: selectedPerson?.id,
        year: yearNum,
        language: anime ? 'ja' : undefined,
        streaming: streaming ?? undefined,
      }
      const want: ('movie' | 'tv')[] = typeFilter === 'both' ? ['movie', 'tv'] : [typeFilter]
      Promise.all(
        want.map((m) =>
          fetchDiscover(filters, m)
            .then((rs) => rs.map((r) => ({ ...r, mediaType: m })))
            .catch(() => [] as TaggedResult[]),
        ),
      )
        .then((lists) => {
          if (stale) return
          // interleave films/shows so neither side buries the other
          const [a, b] = [lists[0] ?? [], lists[1] ?? []]
          const merged: TaggedResult[] = []
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) merged.push(a[i])
            if (b[i]) merged.push(b[i])
          }
          setDiscoverResults(merged)
        })
        .finally(() => !stale && setDiscovering(false))
    }, 300)
    return () => {
      stale = true
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreKey, selectedPerson, yearNum, typeFilter, textActive, hasFilters, streamKey])

  // Resolve the "Because you rated" seeds (latest rating on each side).
  useEffect(() => {
    let cancelled = false
    setRecSeeds([])
    if (userId === null) return
    Promise.all([
      fetchMyGlobalRatings(userId).catch(() => []),
      fetchMyReviewedTitles(userId).catch(() => []),
    ]).then(([solo, grouped]) => {
      if (cancelled) return
      const all = [...solo, ...grouped]
      const seeds: { media: 'movie' | 'tv'; tmdbId: number; name: string }[] = []
      for (const media of ['movie', 'tv'] as const) {
        const pick = all.find((t) => t.mediaType === media && typeof t.tmdbId === 'number')
        if (pick && typeof pick.tmdbId === 'number') {
          seeds.push({ media, tmdbId: pick.tmdbId, name: pick.name })
        }
      }
      setRecSeeds(seeds)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  function toggleGenre(id: number) {
    setSelectedGenreIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    )
  }

  function toggleService(id: number) {
    const list = streamingPrefs[streamingPrefs.mode]
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    setStreamingPrefs(
      streamingPrefs.mode === 'stream'
        ? { ...streamingPrefs, stream: next }
        : { ...streamingPrefs, rent_buy: next },
    )
  }

  function clearFilters() {
    setSelectedGenreIds([])
    setSelectedPerson(null)
    setPersonQuery('')
    setYear('')
    setTypeFilter('both')
    setStreamingPrefs({ ...NO_STREAMING, mode: streamingPrefs.mode })
  }

  const activeFilterCount =
    selectedGenreIds.length +
    (selectedPerson ? 1 : 0) +
    (yearNum !== undefined ? 1 : 0) +
    (typeFilter !== 'both' ? 1 : 0) +
    (streaming ? 1 : 0)

  const shelves = SHELVES.filter((s) => typeFilter === 'both' || s.media === typeFilter).flatMap(
    (s) => {
      if (!streaming) return [s]
      const row = onServices(s, streaming)
      return row ? [row] : []
    },
  )
  // TMDB's "more like this" takes no streaming filter, so those rows rest
  // while one is on.
  const visibleSeeds = streaming
    ? []
    : recSeeds.filter((s) => typeFilter === 'both' || s.media === typeFilter)

  return (
    <div className="flex flex-col gap-6">
      <section className="mp-rise">
        <h1 className="mb-4 font-display text-[30px] font-semibold leading-tight">Find your next watch.</h1>
        <input
          type="search"
          aria-label="Search films and shows"
          maxLength={200}
          placeholder="Search films and shows…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={fieldClass}
        />

        {/* filter toggle */}
        <div className="mt-2 flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-controls="discover-filters"
            className={`flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors ${showFilters || activeFilterCount > 0 ? 'border-teal/40 bg-teal/10 text-teal' : 'border-line text-muted hover:text-text'}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-teal/15 px-1 font-mono text-[10px] text-teal">{activeFilterCount}</span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-11 px-3 text-[13px] text-muted transition-colors hover:text-coral"
            >
              Clear
            </button>
          )}
        </div>
        {streaming && (
          <p className="mt-1 px-1 text-[12px] leading-snug text-muted">
            Only titles you can {streamingPhrase(streaming, services)}.
          </p>
        )}
        {searching && <p role="status" className="mt-2 px-1 text-[13px] text-muted">Finding matching titles…</p>}
        {textActive && hasFilters && (
          <p className="mt-1 px-1 text-[12px] leading-snug text-muted">
            Search skips the genre, people and year filters. Clear the search box to browse by them.
          </p>
        )}

        {/* filter panel */}
        {showFilters && (
          <div id="discover-filters" className="mp-card mp-view-enter mt-3 flex flex-col gap-4 rounded-2xl p-4">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                Type
              </p>
              <div className="flex gap-1.5">
                {(
                  [
                    ['both', 'All'],
                    ['movie', 'Films'],
                    ['tv', 'Shows'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTypeFilter(value)}
                    aria-pressed={typeFilter === value}
                    className={`min-h-11 rounded-full border px-4 py-1 text-[13px] font-semibold transition-colors ${
                      typeFilter === value
                        ? 'border-teal/40 bg-teal/10 text-teal'
                        : 'border-line text-muted hover:text-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {services && services.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                  Where to watch
                </p>
                <div className="flex gap-1.5">
                  {(
                    [
                      ['stream', 'Stream'],
                      ['rent_buy', 'Rent or buy'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStreamingPrefs({ ...streamingPrefs, mode: value })}
                      aria-pressed={streamingPrefs.mode === value}
                      className={`min-h-11 rounded-full border px-4 py-1 text-[13px] font-semibold transition-colors ${
                        streamingPrefs.mode === value
                          ? 'border-teal/40 bg-teal/10 text-teal'
                          : 'border-line text-muted hover:text-text'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 px-1 text-[12px] leading-snug text-muted">
                  {streamingPrefs.mode === 'stream'
                    ? 'Pick your services to see what’s included with them, or free.'
                    : 'Pick where you rent or buy to see what they sell.'}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...serviceChips.main, ...(moreServices ? serviceChips.more : [])].map((s) => {
                    const on = picked.includes(s.id)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleService(s.id)}
                        aria-pressed={on}
                        className={`flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1.5 pr-3 text-[12px] transition-colors ${
                          on
                            ? 'border-teal/40 bg-teal/10 text-teal'
                            : 'border-line text-muted hover:text-text'
                        }`}
                      >
                        <ProviderLogo provider={s} size={26} />
                        {s.name}
                      </button>
                    )
                  })}
                </div>
                {serviceChips.more.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMoreServices((open) => !open)}
                    aria-expanded={moreServices}
                    className="mt-1 min-h-11 px-1 text-[12px] font-semibold text-teal"
                  >
                    {moreServices ? 'Fewer services' : 'More services'}
                  </button>
                )}
                <JustWatchCredit className="mt-1 px-1" />
              </div>
            )}

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
                      aria-pressed={on}
                      className={`min-h-11 rounded-full border px-3 py-1 text-[12px] transition-colors ${
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
                    className="min-h-11 shrink-0 px-2 text-[12px] text-muted hover:text-coral"
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
                    aria-label="Filter by actor or director"
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
                aria-label="Filter by release year"
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
            <PosterResultGrid results={results} onOpenTitle={onOpenTitle} />
          ) : (
            !searching && (
              <div className="flex items-center gap-3 px-1">
                <Sticker name="skeptical" className="h-16" />
                <p className="text-[13px] text-muted">
                  No matches for “{query.trim()}”
                  {streaming && ` you can ${streamingPhrase(streaming, services)}`}.
                </p>
              </div>
            )
          )}
        </section>
      ) : hasFilters ? (
        <section className="mp-rise">
          {discovering ? (
            <p className="px-1 font-mono text-[10px] text-muted">finding titles…</p>
          ) : discoverResults.length > 0 ? (
            <PosterResultGrid results={discoverResults} onOpenTitle={onOpenTitle} />
          ) : (
            <p className="px-1 text-[13px] text-muted">No titles match those filters.</p>
          )}
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          {/* films and shows in one stack; the Type filter narrows it.
              Rows load as you scroll and empty rows collapse. */}
          {shelves.map((shelf, i) => (
            <div key={`${typeFilter}:${streamKey}:${shelf.key}`} className="contents">
              <LazyShelf
                heading={shelf.heading}
                eager={i < 3}
                load={() => loadShelf(shelf.spec, shelf.media)}
                onPick={(it) => onOpenTitle(it.tmdbId, shelf.media)}
              />
              {/* the personalized rows slot in right under the trending pair */}
              {i === (typeFilter === 'both' ? 1 : 0) &&
                visibleSeeds.map((seed) => (
                  <LazyShelf
                    key={`recs:${seed.media}:${seed.tmdbId}`}
                    heading={`Because you rated ${seed.name}`}
                    eager
                    load={() => fetchRecommendations(seed.tmdbId, seed.media)}
                    onPick={(it) => onOpenTitle(it.tmdbId, seed.media)}
                  />
                ))}
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
      {/* The notice TMDB's API terms require "prominently on your application". */}
      <p className="mt-1 px-2 text-center text-[11px] leading-snug text-muted/80">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  )
}
