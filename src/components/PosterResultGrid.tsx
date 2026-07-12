import { posterUrl } from '../lib/api'
import type { TmdbResult } from '../lib/api'

interface PosterResultGridProps {
  results: TmdbResult[]
  mediaType: 'movie' | 'tv'
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
}

// Poster-forward search / discover results — a 3-up grid of poster tiles
// (Letterboxd-style), the poster itself the tap target. Shares the tile look
// with PosterShelf so browse and search feel like one system.
export function PosterResultGrid({ results, mediaType, onOpenTitle }: PosterResultGridProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {results.map((r) => (
        <button
          key={`${r.tmdbId}`}
          type="button"
          onClick={() => onOpenTitle(r.tmdbId, mediaType)}
          className="group text-left"
        >
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-line/60 bg-surface-2">
            {r.posterPath ? (
              <img
                src={posterUrl(r.posterPath, 'w342')}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-active:scale-95"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-full w-full place-items-center px-1 text-center font-display text-lg font-semibold leading-tight text-bg"
                style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
              >
                {r.name.charAt(0)}
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate text-[12px] font-medium leading-tight">{r.name}</p>
          <p className="font-mono text-[10px] text-muted">{r.year ?? '—'}</p>
        </button>
      ))}
    </div>
  )
}
