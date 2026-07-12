import { useState } from 'react'
import { formatScore } from '../lib/scoring'
import { posterUrl } from '../lib/api'
import type { GroupLogEntry } from '../lib/api'

interface GroupLogProps {
  entries: GroupLogEntry[]
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  /** mp-rise stagger, e.g. '240ms'. */
  animationDelay?: string
}

// The group's full reveal history, with quick text + media filters.
// Each entry's Mashed score comes from its own rubric snapshot.
export function GroupLog({ entries, onOpenTitle, animationDelay }: GroupLogProps) {
  const [query, setQuery] = useState('')
  const [media, setMedia] = useState<'all' | 'movie' | 'tv'>('all')

  if (entries.length === 0) return null

  const q = query.trim().toLowerCase()
  const filtered = entries.filter(
    (e) =>
      (media === 'all' || e.mediaType === media) &&
      (q.length === 0 || e.titleName.toLowerCase().includes(q)),
  )

  return (
    <section className="mp-rise" style={{ animationDelay }}>
      <div className="mb-3 flex items-baseline justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Group log
        </p>
        <p className="tabular font-mono text-[10px] text-muted">
          {entries.length} rated
        </p>
      </div>

      {entries.length > 3 && (
        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            maxLength={100}
            placeholder="Search the log…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[13px] text-text placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60"
          />
          {(['all', 'movie', 'tv'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMedia(m)}
              className={`shrink-0 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                media === m ? 'border-teal/40 bg-teal/10 text-teal' : 'border-line text-muted'
              }`}
            >
              {m === 'all' ? 'All' : m === 'movie' ? 'Film' : 'TV'}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="px-1 text-[13px] text-muted">Nothing in the log matches.</p>
      ) : (
        <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
          {filtered.map((e) => (
            <button
              key={e.sessionId}
              type="button"
              disabled={e.tmdbId === null}
              onClick={() => e.tmdbId !== null && onOpenTitle(e.tmdbId, e.mediaType)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface disabled:cursor-default"
            >
              {e.posterPath ? (
                <img
                  src={posterUrl(e.posterPath, 'w92')}
                  alt=""
                  loading="lazy"
                  className="h-14 w-9 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-14 w-9 shrink-0 place-items-center rounded-md bg-line font-display text-sm font-semibold text-bg"
                >
                  {e.titleName.charAt(0)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium leading-tight">{e.titleName}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted">
                  {e.mediaType === 'movie' ? 'Film' : 'TV'}
                  {e.titleYear ? ` · ${e.titleYear}` : ''}
                  {e.revealedAt
                    ? ` · ${new Date(e.revealedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}`
                    : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="tabular font-display text-[22px] font-semibold leading-none text-teal">
                  {formatScore(e.mashed)}
                </span>
                <p className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-teal">
                  Mashed
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
