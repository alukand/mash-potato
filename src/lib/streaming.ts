// Discover's "Where to watch" filter (JustWatch data via TMDB). Pure, so the
// choices it makes are tested in streaming.test.ts; the TMDB side is the
// tmdb-search function's streaming filter.

/** Stream: included with a subscription, or free. Rent or buy: pay per title. */
export type StreamMode = 'stream' | 'rent_buy'

/** What a query asks for: titles on ANY of these services, the mode's way. */
export interface StreamingFilter {
  providerIds: number[]
  monetization: StreamMode
}

/** One service in the viewer's region, as tmdb-search lists it. */
export interface StreamingService {
  id: number
  name: string
  logoPath: string | null
}

/**
 * What Discover remembers (`mp.discoverStreaming`): the services you picked
 * for each mode, and the mode you're in. Switching modes keeps both sets.
 */
export interface StreamingPrefs {
  mode: StreamMode
  stream: number[]
  rent_buy: number[]
}

export const NO_STREAMING: StreamingPrefs = { mode: 'stream', stream: [], rent_buy: [] }

/**
 * The services people look for first, in that order, and how each one sells.
 * TMDB's own order buries some (HBO Max ranks 119th in the US) and never says
 * which providers are stores. TMDB also applies "rent or buy" to the title,
 * not to the service ("Netflix" + "rent" finds Netflix titles someone else
 * rents), so the services you pick are what carry the meaning: each mode
 * offers only its own kind. The order only matters between services one
 * region has, so each region's majors sit after the global ones. Ids are
 * TMDB's, checked against its lists for the US, UK, Canada, Australia,
 * Germany, France, Spain, Italy, the Netherlands, India, Brazil, Mexico and
 * Japan.
 */
export const KNOWN_SERVICES: readonly (readonly [number, StreamMode])[] = [
  // the global majors
  [8, 'stream'], // Netflix
  [9, 'stream'], // Amazon Prime Video (US, UK, Germany, Japan)
  [119, 'stream'], // Amazon Prime Video (most other regions)
  [337, 'stream'], // Disney Plus
  [1899, 'stream'], // HBO Max
  [15, 'stream'], // Hulu
  [350, 'stream'], // Apple TV (the subscription)
  [386, 'stream'], // Peacock Premium
  [2303, 'stream'], // Paramount Plus Premium
  [2616, 'stream'], // Paramount Plus Essential
  [531, 'stream'], // Paramount Plus
  // each region's majors
  [38, 'stream'], // BBC iPlayer
  [41, 'stream'], // ITVX
  [103, 'stream'], // Channel 4
  [29, 'stream'], // Sky Go
  [39, 'stream'], // Now TV
  [230, 'stream'], // Crave
  [314, 'stream'], // CBC Gem
  [21, 'stream'], // Stan
  [385, 'stream'], // BINGE
  [134, 'stream'], // Foxtel Now
  [135, 'stream'], // ABC iview
  [132, 'stream'], // SBS On Demand
  [304, 'stream'], // Joyn
  [2750, 'stream'], // RTL+
  [30, 'stream'], // WOW
  [178, 'stream'], // MagentaTV
  [381, 'stream'], // Canal+
  [1754, 'stream'], // TF1+
  [147, 'stream'], // M6+
  [2241, 'stream'], // Movistar Plus+
  [63, 'stream'], // Filmin
  [62, 'stream'], // Atres Player
  [109, 'stream'], // Timvision
  [359, 'stream'], // Mediaset Infinity
  [222, 'stream'], // Rai Play
  [72, 'stream'], // Videoland
  [76, 'stream'], // Viaplay
  [1773, 'stream'], // SkyShowtime
  [360, 'stream'], // NPO Start
  [2336, 'stream'], // JioHotstar
  [232, 'stream'], // Zee5
  [237, 'stream'], // Sony Liv
  [307, 'stream'], // Globoplay
  [84, 'stream'], // U-NEXT
  [1884, 'stream'], // ABEMA
  // more subscriptions, and the free services
  [283, 'stream'], // Crunchyroll
  [43, 'stream'], // Starz
  [73, 'stream'], // Tubi
  [300, 'stream'], // Pluto TV
  // after the free ones: Mexico's major, but the US lists it too
  [457, 'stream'], // ViX
  [207, 'stream'], // The Roku Channel
  [526, 'stream'], // AMC+
  [34, 'stream'], // MGM Plus
  [387, 'stream'], // Peacock Premium Plus
  [99, 'stream'], // Shudder
  [258, 'stream'], // Criterion Channel
  [11, 'stream'], // MUBI
  [151, 'stream'], // BritBox
  [87, 'stream'], // Acorn TV
  [191, 'stream'], // Kanopy
  [212, 'stream'], // Hoopla
  [538, 'stream'], // Plex
  [223, 'stream'], // Hayu
  [524, 'stream'], // Discovery+
  [510, 'stream'], // Discovery+ (India)
  // live TV, channel apps and the like: subscriptions, never stores
  [257, 'stream'], // fuboTV
  [2383, 'stream'], // Philo
  [299, 'stream'], // Sling TV Orange and Blue
  [2528, 'stream'], // YouTube TV
  [188, 'stream'], // YouTube Premium
  [332, 'stream'], // Fandango at Home Free
  [2285, 'stream'], // JustWatch TV
  [190, 'stream'], // Curiosity Stream
  [175, 'stream'], // Netflix Kids
  [209, 'stream'], // PBS
  [83, 'stream'], // The CW
  [123, 'stream'], // FXNow
  [80, 'stream'], // AMC
  [79, 'stream'], // NBC
  [211, 'stream'], // Freeform
  [156, 'stream'], // A&E
  [157, 'stream'], // Lifetime
  [143, 'stream'], // Sundance Now
  // the stores
  [10, 'rent_buy'], // Amazon Video
  [2, 'rent_buy'], // Apple TV Store
  [3, 'rent_buy'], // Google Play Movies
  [192, 'rent_buy'], // YouTube
  [7, 'rent_buy'], // Fandango At Home
  [68, 'rent_buy'], // Microsoft Store
  [35, 'rent_buy'], // Rakuten TV
  [130, 'rent_buy'], // Sky Store
  [40, 'rent_buy'], // CHILI
  [71, 'rent_buy'], // Pathé Thuis
  [2601, 'rent_buy'], // Pathé Home
  [20, 'rent_buy'], // maxdome Store
  [133, 'rent_buy'], // Videobuster
  [61, 'rent_buy'], // Orange VOD
  [58, 'rent_buy'], // Canal VOD
]

const KIND = new Map<number, StreamMode>(KNOWN_SERVICES.map(([id, kind]) => [id, kind]))

/** How many chips show before "More services". */
export const SERVICES_SHOWN = 12

/** How many more it opens to: a region lists ~175, most of them niche. */
export const MORE_SERVICES = 28

/**
 * Fewer known services than this (a region we know little about): Stream
 * tops its chips up from the region's own list. Rent or buy never does,
 * because a service we can't place may well be a subscription.
 */
const KNOWN_ENOUGH = 8

const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0

/** Prefs from storage; anything malformed is no filter. */
export function parseStreamingPrefs(raw: string | null): StreamingPrefs {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<Record<keyof StreamingPrefs, unknown>> | null
    if (!v || typeof v !== 'object') return NO_STREAMING
    const ids = (list: unknown) => (Array.isArray(list) ? [...new Set(list.filter(isId))] : [])
    return {
      mode: v.mode === 'rent_buy' ? 'rent_buy' : 'stream',
      stream: ids(v.stream),
      rent_buy: ids(v.rent_buy),
    }
  } catch {
    return NO_STREAMING
  }
}

/**
 * The filter the prefs ask for, or null when the mode has nothing picked.
 * `services` is the region's list: null while it loads (the picks apply, so
 * Discover doesn't fetch twice), empty when there is none (an older
 * tmdb-search, or it failed: the section is hidden, so nothing may filter
 * unseen). A pick the region doesn't list (you travelled) drops out rather
 * than quietly emptying every shelf.
 */
export function streamingFilterOf(
  prefs: StreamingPrefs,
  services: StreamingService[] | null,
): StreamingFilter | null {
  if (services !== null && services.length === 0) return null
  const listed = services ? new Set(services.map((s) => s.id)) : null
  const ids = prefs[prefs.mode].filter((id) => !listed || listed.has(id))
  return ids.length > 0 ? { providerIds: ids, monetization: prefs.mode } : null
}

/** A stable key for a filter (effect deps, shelf keys); '' for none. */
export function streamingKey(filter: StreamingFilter | null): string {
  return filter ? `${filter.monetization}:${[...filter.providerIds].sort((a, b) => a - b).join(',')}` : ''
}

/**
 * The chips for a mode. `main` shows; `more` waits behind "More services".
 * The mode's known services lead in our order, then the services we can't
 * place in the region's own order. The other mode's known services never
 * show, and a picked service is always in `main`.
 */
export function servicesFor(
  services: StreamingService[],
  mode: StreamMode,
  picked: number[],
): { main: StreamingService[]; more: StreamingService[] } {
  const byId = new Map(services.map((s) => [s.id, s]))
  const known = KNOWN_SERVICES.filter(([id, kind]) => kind === mode && byId.has(id)).map(
    ([id]) => byId.get(id) as StreamingService,
  )
  const unplaced = services.filter((s) => !KIND.has(s.id))
  const ordered = [...known, ...unplaced]
  const mainCount =
    mode === 'stream' && known.length < KNOWN_ENOUGH ? SERVICES_SHOWN : Math.min(known.length, SERVICES_SHOWN)
  const isPicked = new Set(picked)
  const main = ordered.filter((s, i) => i < mainCount || isPicked.has(s.id))
  const shown = new Set(main.map((s) => s.id))
  return { main, more: ordered.filter((s) => !shown.has(s.id)).slice(0, MORE_SERVICES) }
}

/** "Netflix, HBO Max or Hulu": the summary line's list. */
export function serviceNames(ids: number[], services: StreamingService[] | null): string {
  const names = ids
    .map((id) => services?.find((s) => s.id === id)?.name)
    .filter((n): n is string => typeof n === 'string')
  if (names.length < ids.length || names.length === 0) {
    return ids.length === 1 ? 'your service' : `${ids.length} services`
  }
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`
}

/** "stream on Netflix or Max" / "rent or buy on Apple TV Store". */
export function streamingPhrase(filter: StreamingFilter, services: StreamingService[] | null): string {
  const verb = filter.monetization === 'stream' ? 'stream' : 'rent or buy'
  return `${verb} on ${serviceNames(filter.providerIds, services)}`
}
