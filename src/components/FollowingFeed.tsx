import type { FeedRating } from '../lib/api'
import { posterUrl } from '../lib/api'
import { colorForUser } from '../lib/palette'
import { scoreColor } from '../lib/scoreColor'
import { formatScore } from '../lib/scoring'
import { timeAgo } from '../lib/timeAgo'
import type { OpenTitle } from '../lib/urlState'
import { Avatar } from './avatars'

/**
 * Solo ratings shared by people you follow (20261002140000). Their number is
 * theirs, on their own rubric, so it takes the score ramp rather than gold
 * (gold means YOUR number) or teal (a group's Mashed).
 */
export function FeedList({
  items,
  onOpenTitle,
  showWho = true,
}: {
  items: FeedRating[]
  onOpenTitle: OpenTitle
  /** Off on a person's own page, where every row is theirs. */
  showWho?: boolean
}) {
  return (
    <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
      {items.map((it) => (
        <button
          key={`${it.userId}:${it.titleId}`}
          type="button"
          disabled={it.tmdbId === null}
          onClick={() => it.tmdbId !== null && onOpenTitle(it.tmdbId, it.mediaType, { part: it.part })}
          className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2 disabled:cursor-default"
        >
          <div className="h-[54px] w-9 shrink-0 overflow-hidden rounded-md border border-line/60 bg-surface-2">
            {it.posterPath && (
              <img src={posterUrl(it.posterPath, 'w92')} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold transition-colors group-hover:text-teal">
              {it.titleName}
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
              {showWho && (
                <Avatar
                  avatarKey={it.avatarKey}
                  displayName={it.displayName}
                  color={colorForUser(it.userId)}
                  size={18}
                />
              )}
              <span className="truncate">
                {showWho ? `${it.displayName}, ` : ''}
                {timeAgo(it.ratedAt) === 'now' ? 'just now' : timeAgo(it.ratedAt)}
              </span>
            </p>
          </div>
          {it.score !== null && (
            <span
              className="tabular shrink-0 font-display text-[24px] font-semibold leading-none"
              style={{ color: scoreColor(it.score) }}
            >
              {formatScore(it.score)}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
