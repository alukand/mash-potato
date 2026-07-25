import { posterUrl } from '../lib/api'
import { VisibilityChip } from './ui'

interface PlaylistCardProps {
  name: string
  itemCount: number
  /** Up to three poster paths for the cover collage. */
  posters: string[]
  description?: string | null
  /** Shows the visibility chip (own lists only; public profiles omit it). */
  visibility?: 'public' | 'private'
  onOpen: () => void
}

// One playlist as a row card: cover collage, name + count, optional
// visibility chip. Used on your own profile and on public profiles.
export function PlaylistCard({
  name,
  itemCount,
  posters,
  description,
  visibility,
  onOpen,
}: PlaylistCardProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2"
    >
      <div className="flex shrink-0 -space-x-4">
        {posters.length > 0 ? (
          posters.slice(0, 3).map((p, i) => (
            <img
              key={`${p}-${i}`}
              src={posterUrl(p, 'w92')}
              alt=""
              loading="lazy"
              className="h-14 w-9 rounded-md border border-line/60 object-cover transition-transform group-active:scale-95"
              style={{ zIndex: 3 - i }}
            />
          ))
        ) : (
          <span
            aria-hidden
            className="grid h-14 w-9 place-items-center rounded-md bg-surface-2 text-muted"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 9h18M8 5v14" />
            </svg>
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold leading-tight transition-colors group-hover:text-teal">
          {name}
          <span className="tabular ml-2 font-mono text-[11px] font-normal text-muted">
            {itemCount}
          </span>
        </p>
        {description && (
          <p className="mt-0.5 truncate text-[13px] leading-snug text-muted">{description}</p>
        )}
      </div>
      {/* Static span variant: this whole card is already a button. */}
      {visibility && <VisibilityChip isPublic={visibility === 'public'} />}
    </button>
  )
}
