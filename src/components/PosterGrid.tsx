import { posterUrl } from '../lib/api'

export interface PosterGridItem {
  titleId: string
  tmdbId: number | null
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterPath: string | null
}

interface PosterGridProps {
  items: PosterGridItem[]
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  /** Optional corner label on each tile (e.g. "Solo"). */
  badge?: string
  /** When set, tiles grow a remove control (manage mode). */
  onRemove?: (titleId: string) => void
}

// The 3-column poster grid shared by profile sections and playlists.
export function PosterGrid({ items, onOpenTitle, badge, onRemove }: PosterGridProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((it) => (
        <div key={it.titleId} className="relative">
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(it.titleId)}
              aria-label={`Remove ${it.name}`}
              className="absolute -right-1.5 -top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-coral text-bg shadow-[0_6px_16px_-6px_rgba(0,0,0,0.8)] transition-transform active:scale-90"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          )}
          <button
            type="button"
            disabled={it.tmdbId === null}
            onClick={() => it.tmdbId !== null && onOpenTitle(it.tmdbId, it.mediaType)}
            className="group w-full text-left disabled:opacity-70"
          >
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-line/60 bg-surface-2">
              {badge && (
                <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-bg/70 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-teal backdrop-blur-sm">
                  {badge}
                </span>
              )}
              {it.posterPath ? (
                <img
                  src={posterUrl(it.posterPath, 'w342')}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-active:scale-95"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-full w-full place-items-center font-display text-2xl font-semibold text-bg"
                  style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
                >
                  {it.name.charAt(0)}
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate text-[12px] font-medium leading-tight">{it.name}</p>
            <p className="font-mono text-[10px] text-muted">{it.year ?? '—'}</p>
          </button>
        </div>
      ))}
    </div>
  )
}
