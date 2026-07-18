import { useMemo, useState } from 'react'
import {
  createSession,
  fetchGroupRubrics,
  fetchLatestSession,
  hasGroupRatedTitle,
} from '../lib/api'
import type { GroupInfo, NewTitle } from '../lib/api'
import type { MemberRubric } from '../lib/rubricCatalog'
import {
  configuredCategoryKeys,
  defaultRubricRows,
  mashRubrics,
  resolveSessionRubric,
  resolveSessionRubricTagged,
} from '../lib/rubricCatalog'
import { readRecentGroupIds, touchRecentGroup } from '../lib/activeGroup'
import { CtaButton, GroupMark, fieldClassSm } from './ui'
import { RubricReceipt } from './RubricReceipt'

interface GroupInviteSheetProps {
  groups: GroupInfo[]
  userId: string
  title: NewTitle
  /** TMDB genre ids for the rubric's genre add-ons ([] for manual entries). */
  genreIds: number[]
  /** A round was created for this group; the caller navigates to it. */
  onStarted: (groupId: string) => void
  onClose: () => void
}

// "Invite" always asks WHICH group: recently engaged groups float to the top,
// the list is searchable, and picking one shows that group's rubric receipt
// (with genre opt-outs) before the round starts. No screen assumes the
// last-active group anymore.
export function GroupInviteSheet({
  groups,
  userId,
  title,
  genreIds,
  onStarted,
  onClose,
}: GroupInviteSheetProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<GroupInfo | null>(null)
  // null = the selected group's rubric + round state are still loading.
  const [rubrics, setRubrics] = useState<MemberRubric[] | null>(null)
  const [blindLive, setBlindLive] = useState(false)
  // This group already revealed a round on this title: the CTA becomes
  // "Rate it again" and the copy promises the old night survives.
  const [ratedBefore, setRatedBefore] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recents = useMemo(() => readRecentGroupIds(), [])
  const ordered = useMemo(() => {
    const rank = new Map(recents.map((id, i) => [id, i]))
    return [...groups].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }, [groups, recents])
  const q = query.trim().toLowerCase()
  const shown = q ? ordered.filter((g) => g.name.toLowerCase().includes(q)) : ordered
  const recentSet = useMemo(() => new Set(recents.slice(0, 3)), [recents])

  async function selectGroup(g: GroupInfo) {
    setSelected(g)
    setRubrics(null)
    setBlindLive(false)
    setRatedBefore(false)
    setError(null)
    const [rows, latest, rated] = await Promise.all([
      fetchGroupRubrics(g.id).catch(() => []),
      fetchLatestSession(g.id).catch(() => null),
      hasGroupRatedTitle(g.id, title.tmdbId ?? null, title.mediaType).catch(() => false),
    ])
    setRubrics(rows)
    setBlindLive(latest?.state === 'blind')
    setRatedBefore(rated)
  }

  async function handleStart() {
    if (!selected || rubrics === null || starting) return
    setStarting(true)
    setError(null)
    try {
      const mashed = mashRubrics(rubrics)
      const rows = mashed.length > 0 ? mashed : defaultRubricRows()
      // The full resolved rubric ships in the snapshot; whether to rate a
      // genre add-on is each member's own call at scoring time.
      const rubric = resolveSessionRubric(rows, genreIds, configuredCategoryKeys(rubrics))
      await createSession(selected.id, userId, title, rubric)
      touchRecentGroup(selected.id)
      onStarted(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session')
      setStarting(false)
    }
  }

  const receiptEntries =
    selected && rubrics !== null
      ? resolveSessionRubricTagged(
          mashRubrics(rubrics).length > 0 ? mashRubrics(rubrics) : defaultRubricRows(),
          genreIds,
          configuredCategoryKeys(rubrics),
        )
      : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Invite a group"
        className="mp-card max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[26px] px-5 pb-safe pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] font-semibold leading-tight">
              {selected ? `Invite ${selected.name}` : 'Invite a group'}
            </h2>
            <p className="mt-0.5 truncate text-[13px] leading-snug text-muted">
              {title.name}
              {title.year ? ` (${title.year})` : ''}, scored blind until the Reveal
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-text"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {!selected ? (
          <>
            {groups.length > 4 && (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your groups…"
                aria-label="Search your groups"
                className={`mt-4 w-full ${fieldClassSm}`}
              />
            )}
            <ul className="mt-3 divide-y divide-line/50">
              {shown.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => void selectGroup(g)}
                    className="group flex w-full items-center gap-3 py-3 text-left"
                  >
                    <GroupMark
                      groupId={g.id}
                      name={g.name}
                      size={34}
                      className="transition-transform group-active:scale-95"
                    />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold transition-colors group-hover:text-teal">
                      {g.name}
                    </span>
                    {recentSet.has(g.id) && (
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                        Recent
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {shown.length === 0 && (
                <li className="py-4 text-[13px] leading-snug text-muted">
                  No group by that name.
                </li>
              )}
            </ul>
          </>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m15 5-7 7 7 7" />
              </svg>
              All groups
            </button>
            {rubrics === null ? (
              <p className="py-6 text-center text-[13px] text-muted">Loading the rubric…</p>
            ) : (
              <>
                <RubricReceipt className="mt-4" entries={receiptEntries} />
                <CtaButton
                  onClick={() => void handleStart()}
                  disabled={starting || blindLive}
                  className="mt-4 w-full py-3.5 text-[14px] disabled:opacity-50"
                >
                  {starting
                    ? 'Starting…'
                    : ratedBefore
                      ? `Rate it again with ${selected.name}`
                      : `Invite ${selected.name} to score it blind`}
                </CtaButton>
                {blindLive ? (
                  <p className="mt-2 text-center font-mono text-[10px] text-muted">
                    Finish {selected.name}'s current blind round first.
                  </p>
                ) : ratedBefore ? (
                  <p className="mt-2 text-center font-mono text-[10px] text-muted">
                    {selected.name} has mashed this one before. A fresh blind
                    round starts; the old night stays in the log.
                  </p>
                ) : null}
              </>
            )}
            {error && (
              <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
