import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchTitleDetail, posterUrl } from '../lib/api'
import type { GroupInfo, NewTitle } from '../lib/api'
import { useTmdbSearch } from '../hooks/useTmdbSearch'
import type { TaggedResult } from '../hooks/useTmdbSearch'
import { CtaButton, WhereToWatchLine, fieldClass } from './ui'
import { GroupInviteSheet } from './GroupInviteSheet'

interface StartRoundProps {
  group: GroupInfo
  groups: GroupInfo[]
  userId: string
  /** A round started in THIS group; refresh the panel. */
  onStarted: () => void
  /** A round started in a DIFFERENT group; the caller switches to it. */
  onStartedInGroup: (groupId: string) => void
}

type TypeFilter = 'both' | 'movie' | 'tv'

// Pick a film or show and invite a group to score it blind. One search box
// covers both sides of TMDB; the chips narrow it when you already know.
export function StartRound({
  group,
  groups,
  userId,
  onStarted,
  onStartedInGroup,
}: StartRoundProps) {
  const [titleName, setTitleName] = useState('')
  const [titleYear, setTitleYear] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('both')
  // Manual entries (no TMDB match) still need a side to live on.
  const [manualType, setManualType] = useState<'movie' | 'tv'>('movie')
  const [picked, setPicked] = useState<TaggedResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitePayload, setInvitePayload] = useState<{
    title: NewTitle
    genreIds: number[]
  } | null>(null)
  const [pickedGenres, setPickedGenres] = useState<number[] | null>(null)

  const { results, searching } = useTmdbSearch(titleName, typeFilter, !picked)

  // Fetch the picked title's genres so the invite sheet can resolve add-ons.
  useEffect(() => {
    if (!picked) {
      setPickedGenres(null)
      return
    }
    let cancelled = false
    fetchTitleDetail(picked.tmdbId, picked.mediaType)
      .then((d) => !cancelled && setPickedGenres(d?.genreIds ?? []))
      .catch(() => !cancelled && setPickedGenres([]))
    return () => {
      cancelled = true
    }
  }, [picked])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // Genre add-ons (Humor for a comedy, Fear Factor for a horror, …) come
      // from the title's TMDB genres; manual entries have none. Usually
      // already loaded; fall back to fetching here.
      let genreIds: number[] = pickedGenres ?? []
      if (picked && pickedGenres === null) {
        try {
          genreIds = (await fetchTitleDetail(picked.tmdbId, picked.mediaType))?.genreIds ?? []
        } catch {
          // non-fatal: the round just starts without genre categories
        }
      }
      const manualMedia = typeFilter === 'both' ? manualType : typeFilter
      setInvitePayload({
        title: picked
          ? {
              name: picked.name,
              year: picked.year,
              mediaType: picked.mediaType,
              tmdbId: picked.tmdbId,
              posterPath: picked.posterPath,
            }
          : {
              name: titleName.trim(),
              year: titleYear ? Number(titleYear) : null,
              mediaType: manualMedia,
              tmdbId: null,
              posterPath: null,
            },
        genreIds: picked ? genreIds : [],
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mp-rise">
      <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        New round
      </p>
      <form onSubmit={handleCreate} className="mp-card rounded-[26px] p-6">
        {picked ? (
          <div className="flex items-center gap-3 rounded-2xl border border-teal/30 bg-teal/5 p-3">
            {picked.posterPath ? (
              <img
                src={posterUrl(picked.posterPath, 'w92')}
                alt=""
                className="h-[60px] w-10 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="grid h-[60px] w-10 shrink-0 place-items-center rounded-lg font-display text-lg font-semibold text-bg"
                style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
              >
                {picked.name.charAt(0)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{picked.name}</p>
              <p className="font-mono text-[11px] text-muted">
                {picked.mediaType === 'movie' ? 'Film' : 'TV'}
                {picked.year ? ` ${picked.year}` : ''}
              </p>
              {/* The last screen before a round starts is the last useful
                  moment to learn nobody can actually play this tonight. */}
              <WhereToWatchLine
                tmdbId={picked.tmdbId}
                mediaType={picked.mediaType}
                className="mt-1.5"
              />
            </div>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted transition-colors hover:text-text"
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              maxLength={200}
              placeholder="Search films and shows…"
              value={titleName}
              onChange={(e) => setTitleName(e.target.value)}
              className={fieldClass}
            />
            <div className="mt-2 flex items-center gap-1.5">
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
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                    typeFilter === value
                      ? 'border-teal/40 bg-teal/10 text-teal'
                      : 'border-line text-muted hover:text-text'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {searching && (
              <p className="mt-2 px-1 font-mono text-[10px] text-muted">searching…</p>
            )}
            {results.length > 0 && (
              <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-surface-2">
                {results.map((r, i) => (
                  <li key={`${r.mediaType}:${r.tmdbId}`}>
                    <button
                      type="button"
                      onClick={() => setPicked(r)}
                      className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-surface-2 ${
                        i > 0 ? 'border-t border-line/50' : ''
                      }`}
                    >
                      {r.posterPath ? (
                        <img
                          src={posterUrl(r.posterPath, 'w92')}
                          alt=""
                          className="h-12 w-8 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-12 w-8 shrink-0 place-items-center rounded-md bg-line font-display text-sm font-semibold text-bg"
                        >
                          {r.name.charAt(0)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium transition-colors group-hover:text-teal">
                        {r.name}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted">
                        {r.mediaType === 'movie' ? 'Film' : 'TV'}
                      </span>
                      <span className="tabular shrink-0 font-mono text-[11px] text-muted">
                        {r.year ?? '—'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {titleName.trim().length >= 2 && !searching && (
              <div className="mt-3 flex flex-col gap-3">
                <input
                  type="number"
                  min={1870}
                  max={2200}
                  placeholder="Year (only if using it as typed)"
                  value={titleYear}
                  onChange={(e) => setTitleYear(e.target.value)}
                  className={fieldClass}
                />
                {typeFilter === 'both' && (
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      As typed, it's a
                    </span>
                    {(
                      [
                        ['movie', 'Film'],
                        ['tv', 'Show'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setManualType(value)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                          manualType === value
                            ? 'border-teal/40 bg-teal/10 text-teal'
                            : 'border-line text-muted hover:text-text'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {results.length === 0 && (
                  <p className="px-1 text-[12px] text-muted">
                    No matches. Starting will use "{titleName.trim()}" as typed.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[13px] leading-snug text-coral">
            {error}
          </p>
        )}
        <CtaButton
          type="submit"
          disabled={busy || (!picked && titleName.trim().length === 0)}
          className="mt-4 w-full py-3.5 text-[14px]"
        >
          {busy ? 'One sec…' : 'Invite a group to score it blind'}
        </CtaButton>
      </form>
      {invitePayload && (
        <GroupInviteSheet
          groups={groups}
          userId={userId}
          title={invitePayload.title}
          genreIds={invitePayload.genreIds}
          onStarted={(groupId) => {
            setInvitePayload(null)
            setTitleName('')
            setTitleYear('')
            setPicked(null)
            if (groupId === group.id) onStarted()
            else onStartedInGroup(groupId)
          }}
          onClose={() => setInvitePayload(null)}
        />
      )}
      <p className="mt-3 px-2 text-[13px] leading-snug text-muted">
        Search powered by{' '}
        <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-teal">
          TMDB
        </a>
        .
      </p>
    </section>
  )
}
