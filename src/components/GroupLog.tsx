import { useState } from 'react'
import { formatScore } from '../lib/scoring'
import { scoreColor } from '../lib/scoreColor'
import { posterUrl } from '../lib/api'
import type { GroupLogEntry } from '../lib/api'

interface GroupLogProps {
  entries: GroupLogEntry[]
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  /** mp-rise stagger, e.g. '240ms'. */
  animationDelay?: string
}

// The group's full reveal history, with quick text + media filters and a
// one-line memory strip (average Mashed + the group's best round) once
// there's enough history to mean something.
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

  const scored = entries.filter((e) => e.mashed !== null)
  const avg =
    scored.length > 0
      ? scored.reduce((sum, e) => sum + (e.mashed ?? 0), 0) / scored.length
      : null
  const best = scored.reduce<GroupLogEntry | null>(
    (top, e) => (top === null || (e.mashed ?? 0) > (top.mashed ?? 0) ? e : top),
    null,
  )
  const showStats = scored.length >= 3 && avg !== null && best !== null

  return (
    <section className="mp-rise" style={{ animationDelay }}>
      <div className="mb-3 flex items-baseline justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Group log <span className="tabular ml-1 font-mono text-[10px]">{entries.length}</span>
        </p>
      </div>

      {/* the group's memory, in one quiet line */}
      {showStats && (
        <div className="mb-3 flex items-center gap-3 px-1 font-mono text-[10px] text-muted">
          <span>
            avg <span className="tabular text-teal">{formatScore(avg)}</span>
          </span>
          <span aria-hidden className="h-3 w-px bg-line" />
          <span className="min-w-0 truncate">
            best{' '}
            <span className="tabular" style={{ color: scoreColor(best.mashed ?? 0) }}>
              {formatScore(best.mashed)}
            </span>{' '}
            {best.titleName}
          </span>
        </div>
      )}

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
              className="group flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
            >
              {e.posterPath ? (
                <img
                  src={posterUrl(e.posterPath, 'w92')}
                  alt=""
                  loading="lazy"
                  className="h-14 w-9 shrink-0 rounded-md object-cover transition-transform group-active:scale-95"
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
                <p className="truncate text-[14px] font-medium leading-tight transition-colors group-hover:text-teal">
                  {e.titleName}
                </p>
                <p className="mt-0.5 font-mono text-[10px] text-muted">
                  {e.mediaType === 'movie' ? 'Film' : 'TV'}
                  {e.titleYear ? ` ${e.titleYear}` : ''}
                  {e.revealedAt
                    ? `, ${new Date(e.revealedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}`
                    : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {e.mashed === null ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-muted" aria-hidden>
                      <rect x="4" y="10" width="16" height="11" rx="2.5" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                    <p className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-muted">
                      Sealed
                    </p>
                  </>
                ) : (
                  <>
                    <span className="tabular font-display text-[22px] font-semibold leading-none text-teal">
                      {formatScore(e.mashed)}
                    </span>
                    <p className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-teal">
                      Mashed
                    </p>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
