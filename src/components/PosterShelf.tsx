import { posterUrl } from '../lib/api'
import type { TmdbResult } from '../lib/api'

interface PosterShelfProps {
  heading: string
  items: TmdbResult[]
  onPick: (item: TmdbResult) => void
}

// A horizontally-scrolling row of poster tiles for the Discover shelves.
export function PosterShelf({ heading, items, onPick }: PosterShelfProps) {
  if (items.length === 0) return null
  return (
    <section>
      <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        {heading}
      </p>
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <button
            key={`${item.tmdbId}`}
            type="button"
            onClick={() => onPick(item)}
            className="group w-[104px] shrink-0 text-left"
          >
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-line/60 bg-surface-2">
              {item.posterPath ? (
                <img
                  src={posterUrl(item.posterPath, 'w342')}
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
                  {item.name.charAt(0)}
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate text-[12px] font-medium leading-tight">{item.name}</p>
            <p className="font-mono text-[10px] text-muted">{item.year ?? '—'}</p>
          </button>
        ))}
      </div>
    </section>
  )
}
