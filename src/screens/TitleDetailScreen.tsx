import { useEffect, useRef, useState } from 'react'
import {
  addTitleToPlaylist,
  backdropUrl,
  createPlaylist,
  deleteGlobalRating,
  fetchModeHistogram,
  fetchModeScores,
  fetchMyGlobalRating,
  fetchMyTasteMode,
  fetchAddablePlaylists,
  fetchMyPlaylistsContaining,
  fetchSavedTitleId,
  fetchSeasonDetail,
  fetchTitleDetail,
  fetchTitleHistory,
  fetchWatchProviders,
  posterUrl,
  ensureTitleRow,
  removeTitleFromPlaylist,
  saveGlobalRating,
  saveTitle,
  stillUrl,
  unsaveTitle,
} from '../lib/api'
import type {
  GroupInfo,
  ModeScores,
  NewTitle,
  PlaylistSummary,
  SeasonDetail,
  TitleDetail,
  TitleHistoryEntry,
  TitlePart,
  WatchProviders,
} from '../lib/api'
import { partLabel } from '../lib/titleParts'
import type { CategoryScores } from '../lib/scoring'
import { mashedScore, memberWeightedScore, formatScore } from '../lib/scoring'
import { weightsFromRubric } from '../lib/mapping'
import { soloRubricEntriesFor, soloWeightsFor, TASTE_MODES } from '../lib/rubricCatalog'
import type { TasteMode } from '../lib/rubricCatalog'
import { CategoryLegend } from '../components/CategoryLegend'
import { CommunityHistogram } from '../components/CommunityHistogram'
import { DiscussionSection } from '../components/DiscussionSection'
import { GroupInviteSheet } from '../components/GroupInviteSheet'
import { ShareToChatSheet } from '../components/ShareToChatSheet'
import { LoadingCards } from '../components/Moments'
import { CtaButton, GroupMark, ScoreSliderRow, WhereToWatch, fieldClassSm } from '../components/ui'
import { refreshRewards } from '../lib/rewardsStore'

// Solo ratings follow YOUR taste mode: Normies score the enjoyment-heavy
// three, Cinephiles the base-seven craft rubric. The community section shows
// both crowds' numbers side by side.

interface TitleDetailScreenProps {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  /**
   * A season or an episode of the show (lib/titleParts.ts). It is a title of
   * its own: rated, scored in rounds and discussed apart from the show.
   */
  part?: TitlePart | null
  /** Open a season or episode of this show; null opens the show itself. */
  onOpenPart?: (part: TitlePart | null) => void
  groups: GroupInfo[]
  /** null = signed out: only the public TMDB surface loads (guideline 5.1.1(v)). */
  userId: string | null
  /** Signed out, account actions become one sign-in invitation. */
  onSignIn?: () => void
  /** Reopen a past night's Reveal from the group verdicts list. */
  onOpenSession?: (groupId: string, sessionId: string) => void
  /** Deep link: open the discussion on this group's thread. */
  discussGroupId?: string | null
  /** Deep link: composer placeholder (the reveal's clash headline). */
  discussSeed?: string | null
  onBack: () => void
  /** A round started for this group; the caller navigates to it. */
  onStartedSession: (groupId: string) => void
}

function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatRevealed(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * TMDB's "2025-01-17" is a calendar date, not an instant: parsed with
 * new Date(string) it is UTC midnight, which is the day before anywhere west
 * of Greenwich. Built from its parts it stays the date TMDB meant.
 */
function formatAirDate(date: string | null): string | null {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Full TMDB detail page for one title. Lives on the App view-stack (opened from
// Discover, Profile, or a saved list) with its own back button.
export function TitleDetailScreen({
  tmdbId,
  mediaType,
  part = null,
  onOpenPart,
  groups,
  userId,
  onSignIn,
  onOpenSession,
  discussGroupId = null,
  discussSeed = null,
  onBack,
  onStartedSession,
}: TitleDetailScreenProps) {
  const [detail, setDetail] = useState<TitleDetail | null | undefined>(undefined)
  // A season page, or an episode page (its season carries the episodes).
  // Films and shows never load one. Null: TMDB has no such season.
  const [season, setSeason] = useState<SeasonDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [savedTitleId, setSavedTitleId] = useState<string | null>(null)
  const [celebrateSave, setCelebrateSave] = useState(false)
  // The invite flow always picks its group (recents + search) in this sheet.
  const [inviteOpen, setInviteOpen] = useState(false)
  /** "Send to a chat": pick a conversation and share this title as a card. */
  const [shareOpen, setShareOpen] = useState(false)
  // bumped when a rating changes (it gates the public discussion)
  const [discussionRefresh, setDiscussionRefresh] = useState(0)
  const [history, setHistory] = useState<TitleHistoryEntry[]>([])
  const [watch, setWatch] = useState<WatchProviders | null>(null)
  const [modeScores, setModeScores] = useState<ModeScores | null>(null)
  const [communityBins, setCommunityBins] = useState<number[]>([])
  const [histFilter, setHistFilter] = useState<TasteMode | 'all'>('all')
  const [myMode, setMyMode] = useState<TasteMode | null>(null)
  const [myScores, setMyScores] = useState<CategoryScores | null>(null)
  const [rating, setRating] = useState(false)
  const [soloScores, setSoloScores] = useState<CategoryScores>({})
  const [savingRating, setSavingRating] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const communityRef = useRef<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ---- add to playlist (lazy: loads when the disclosure opens) ----
  const [listsOpen, setListsOpen] = useState(false)
  const [myLists, setMyLists] = useState<PlaylistSummary[] | null>(null)
  const [containing, setContaining] = useState<Map<string, string>>(new Map())
  const [listBusyId, setListBusyId] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  // Where the new list lives: personal (null) or one of your groups.
  const [newListGroupId, setNewListGroupId] = useState<string | null>(null)

  // The episode, when this page is one (its season carries them all).
  const episode =
    part && part.episode !== null
      ? (season?.episodes.find((e) => e.episodeNumber === part.episode) ?? null)
      : null
  // Effect dependency for the part: its numbers, not the object's identity.
  const partKey = part ? `${part.season}:${part.episode ?? ''}` : ''

  /**
   * What this page IS, as a title to write: the film or show, or one of the
   * show's parts. Every write below goes through it, so a season or episode
   * can never be rated, scored or discussed as its show by accident.
   */
  function titleInput(d: TitleDetail): NewTitle {
    if (!part) {
      return { name: d.name, year: d.year, mediaType: d.mediaType, tmdbId: d.tmdbId, posterPath: d.posterPath }
    }
    return {
      name: d.name,
      year: episode?.year ?? season?.year ?? d.year,
      mediaType: d.mediaType,
      tmdbId: d.tmdbId,
      posterPath: season?.posterPath ?? d.posterPath,
      part: {
        season: part.season,
        episode: part.episode,
        partName: part.episode === null ? (season?.name ?? null) : (episode?.name ?? null),
      },
    }
  }

  // Every handler below writes on your behalf, so each is unreachable signed
  // out (the controls that call them are gated). The guards make that a fact
  // the compiler checks rather than an assumption.
  async function refreshLists() {
    if (userId === null) return
    const [lists, holds] = await Promise.all([
      // personal playlists + every group's shared watchlists
      fetchAddablePlaylists(userId),
      fetchMyPlaylistsContaining(userId, tmdbId, mediaType),
    ])
    setMyLists(lists)
    setContaining(holds)
  }

  function toggleListsOpen() {
    const next = !listsOpen
    setListsOpen(next)
    if (next && myLists === null) void refreshLists().catch(() => setMyLists([]))
  }

  async function handleToggleList(playlistId: string) {
    if (!detail) return
    setListBusyId(playlistId)
    setError(null)
    try {
      // Patch local state instead of refetching everything: this sheet only
      // renders names, counts, and membership, all derivable from the toggle.
      const titleId = containing.get(playlistId)
      if (titleId) {
        await removeTitleFromPlaylist(playlistId, titleId)
        setContaining((prev) => {
          const next = new Map(prev)
          next.delete(playlistId)
          return next
        })
        setMyLists((prev) =>
          prev?.map((l) =>
            l.id === playlistId ? { ...l, itemCount: Math.max(0, l.itemCount - 1) } : l,
          ) ?? prev,
        )
      } else {
        const addedId = await addTitleToPlaylist(playlistId, titleInput(detail))
        setContaining((prev) => new Map(prev).set(playlistId, addedId))
        setMyLists((prev) =>
          prev?.map((l) => (l.id === playlistId ? { ...l, itemCount: l.itemCount + 1 } : l)) ??
          prev,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that playlist')
    } finally {
      setListBusyId(null)
    }
  }

  async function handleCreateListWithTitle() {
    // Enter in the name field lands here too; the busy check is the guard
    // the disabled button can't provide.
    if (!detail || userId === null || listBusyId !== null) return
    const name = newListName.trim()
    if (name.length === 0) return
    setListBusyId('new')
    setError(null)
    try {
      const id = await createPlaylist(userId, name, newListGroupId)
      await addTitleToPlaylist(id, titleInput(detail))
      setNewListName('')
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the playlist')
    } finally {
      setListBusyId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    setDetail(undefined)
    setNotFound(false)
    setRating(false)
    setInviteOpen(false)
    setListsOpen(false)
    setMyLists(null)
    setHistFilter('all')
    setSeason(null)
    // A season or episode page reads its season too. A failure there leaves
    // the page on the show's own details rather than failing the whole load.
    const seasonLoad = part
      ? fetchSeasonDetail(tmdbId, part.season).catch(() => null)
      : Promise.resolve(null)
    // Signed out, every account-scoped read would 401 and reject the whole
    // Promise.all — so browsing loads ONLY the public TMDB surface.
    if (userId === null) {
      Promise.all([
        fetchTitleDetail(tmdbId, mediaType),
        fetchWatchProviders(tmdbId, mediaType).catch(() => null),
        seasonLoad,
      ])
        .then(([d, providers, s]) => {
          if (cancelled) return
          setDetail(d)
          setSeason(s)
          setNotFound(d === null)
          setWatch(providers)
        })
        .catch((err) => {
          if (!cancelled) {
            setDetail(null)
            setError(err instanceof Error ? err.message : 'Could not load this title')
          }
        })
      return () => {
        cancelled = true
      }
    }

    Promise.all([
      fetchTitleDetail(tmdbId, mediaType),
      fetchSavedTitleId(userId, tmdbId, mediaType, part),
      fetchTitleHistory(tmdbId, mediaType, part),
      fetchModeScores(tmdbId, mediaType, part),
      fetchMyGlobalRating(userId, tmdbId, mediaType, part),
      fetchModeHistogram(tmdbId, mediaType, null, part),
      fetchMyTasteMode(userId),
      // playlists hold films and shows only
      part
        ? Promise.resolve(new Map<string, string>())
        : fetchMyPlaylistsContaining(userId, tmdbId, mediaType).catch(
            () => new Map<string, string>(),
          ),
      fetchWatchProviders(tmdbId, mediaType).catch(() => null),
      seasonLoad,
    ])
      .then(([d, savedId, hist, comm, mine, histogram, mode, holds, providers, s]) => {
        if (cancelled) return
        setDetail(d)
        setSeason(s)
        setNotFound(d === null)
        setSavedTitleId(savedId)
        setHistory(hist)
        setModeScores(comm)
        setMyScores(mine)
        setCommunityBins(histogram)
        setMyMode(mode)
        setContaining(holds)
        setWatch(providers)
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null)
          setError(err instanceof Error ? err.message : 'Could not load this title')
        }
      })
    return () => {
      cancelled = true
    }
    // `part` is read through partKey: its numbers, not the object's identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, mediaType, userId, partKey])

  async function toggleSave() {
    if (!detail || userId === null) return
    setSaving(true)
    setCelebrateSave(false)
    setError(null)
    try {
      if (savedTitleId) {
        await unsaveTitle(userId, savedTitleId)
        setSavedTitleId(null)
      } else {
        const id = await saveTitle(userId, titleInput(detail))
        setSavedTitleId(id)
        setCelebrateSave(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your list')
    } finally {
      setSaving(false)
    }
  }

  // Your mode's card: what the solo sliders show and what your number weighs.
  const soloRubric = soloRubricEntriesFor(myMode ?? 'buff')
  const soloWeights = soloWeightsFor(myMode ?? 'buff')
  const soloWeightTotal = soloRubric.reduce((sum, e) => sum + e.weight, 0)

  // The histogram's mean marker follows the active filter; Everyone is the
  // count-weighted blend of the two crowds.
  const histogramMashed = (() => {
    if (!modeScores) return null
    if (histFilter !== 'all') return modeScores[histFilter].mashed
    const parts = [modeScores.casual, modeScores.buff].filter(
      (p): p is { count: number; mashed: number } => p.mashed !== null && p.count > 0,
    )
    const n = parts.reduce((sum, p) => sum + p.count, 0)
    if (n === 0) return null
    return parts.reduce((sum, p) => sum + p.mashed * p.count, 0) / n
  })()

  function openRating() {
    setSoloScores(
      Object.fromEntries(soloRubric.map((e) => [e.key, myScores?.[e.key] ?? 5])),
    )
    setRating(true)
  }

  async function switchHistFilter(next: TasteMode | 'all') {
    setHistFilter(next)
    try {
      setCommunityBins(
        await fetchModeHistogram(tmdbId, mediaType, next === 'all' ? null : next, part),
      )
    } catch {
      // leave the previous bins; the chips stay usable
    }
  }

  // From the action row: open the solo sliders and bring them into view.
  function rateFromActions() {
    openRating()
    setTimeout(() => {
      communityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  async function handleSaveRating() {
    if (!detail || userId === null) return
    setSavingRating(true)
    setError(null)
    try {
      await saveGlobalRating(userId, titleInput(detail), soloScores)
      setMyScores({ ...soloScores })
      const [comm, histogram] = await Promise.all([
        fetchModeScores(tmdbId, mediaType, part),
        fetchModeHistogram(tmdbId, mediaType, histFilter === 'all' ? null : histFilter, part),
      ])
      setModeScores(comm)
      setCommunityBins(histogram)
      setRating(false)
      // the rating gates public discussion; let the section re-check
      setDiscussionRefresh((n) => n + 1)
      // a first solo rating of a film can earn a token
      void refreshRewards(userId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rating')
    } finally {
      setSavingRating(false)
    }
  }

  async function handleRemoveRating() {
    if (userId === null) return
    setSavingRating(true)
    setError(null)
    try {
      await deleteGlobalRating(userId, tmdbId, mediaType, part)
      setMyScores(null)
      setConfirmRemove(false)
      setRating(false)
      const [comm, histogram] = await Promise.all([
        fetchModeScores(tmdbId, mediaType, part),
        fetchModeHistogram(tmdbId, mediaType, histFilter === 'all' ? null : histFilter, part),
      ])
      setModeScores(comm)
      setCommunityBins(histogram)
      setDiscussionRefresh((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your rating')
    } finally {
      setSavingRating(false)
    }
  }

  const BackButton = (
    <button
      type="button"
      onClick={onBack}
      className="grid h-11 w-11 place-items-center rounded-full border border-line/60 bg-bg/60 text-text backdrop-blur-md transition-colors hover:text-teal"
      aria-label="Back"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 5-7 7 7 7" />
      </svg>
    </button>
  )

  if (detail === undefined) {
    return (
      <div className="px-5 pt-safe">
        <div className="mb-6">{BackButton}</div>
        <LoadingCards label="Finding the details…" />
      </div>
    )
  }

  if (notFound || !detail) {
    return (
      <div className="px-5 pt-safe">
        <div className="mb-6">{BackButton}</div>
        <p className="mp-rise py-10 text-center text-[13px] text-coral">
          {error ?? 'TMDB has no record of this title.'}
        </p>
      </div>
    )
  }

  // A season or episode page shows ITS details over its show's backdrop, and
  // falls back to the show's where TMDB has nothing for the part.
  const heading = !part
    ? detail.name
    : part.episode === null
      ? (season?.name ?? partLabel(part))
      : (episode?.name ?? partLabel(part))
  const posterPath = part ? (season?.posterPath ?? detail.posterPath) : detail.posterPath
  const year = part ? (episode?.year ?? season?.year ?? null) : detail.year
  const overview = !part
    ? detail.overview
    : ((part.episode === null ? season?.overview : episode?.overview) ?? '')
  const tmdbRating = part ? (episode?.tmdbRating ?? null) : detail.tmdbRating
  const runtime = formatRuntime(part ? (episode?.runtimeMinutes ?? null) : detail.runtimeMinutes)
  const seasons =
    !part && detail.seasons ? `${detail.seasons} season${detail.seasons === 1 ? '' : 's'}` : null
  const episodeCount =
    part && part.episode === null && season
      ? `${season.episodes.length} episode${season.episodes.length === 1 ? '' : 's'}`
      : null
  const meta = [
    detail.mediaType === 'movie' ? 'Film' : 'TV',
    // a season's heading already names it; an episode's is its title
    part && part.episode !== null ? partLabel(part) : null,
    year ? String(year) : null,
    runtime,
    seasons,
    episodeCount,
  ].filter(Boolean)

  // An episode page steps to its neighbours in the season.
  const episodeIndex =
    episode && season ? season.episodes.findIndex((e) => e.episodeNumber === episode.episodeNumber) : -1
  const prevEpisode = season && episodeIndex > 0 ? season.episodes[episodeIndex - 1] : null
  const nextEpisode =
    season && episodeIndex >= 0 && episodeIndex < season.episodes.length - 1
      ? season.episodes[episodeIndex + 1]
      : null

  return (
    <div className="pb-4">
      {/* ---- backdrop hero ---- */}
      <div className="relative h-[200px] w-full overflow-hidden">
        {detail.backdropPath ? (
          <img
            src={backdropUrl(detail.backdropPath)}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(21,18,27,0.15), var(--color-bg))' }}
        />
        <div
          className="absolute left-4"
          style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
        >
          {BackButton}
        </div>
      </div>

      {/* ---- poster + title, pulled up over the hero fade ---- */}
      <div className="-mt-16 px-5">
        <div className="flex items-end gap-4">
          <div className="relative h-[132px] w-[88px] shrink-0 overflow-hidden rounded-xl border border-line/60 bg-surface-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]">
            {posterPath ? (
              <img src={posterUrl(posterPath, 'w342')} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                aria-hidden
                className="grid h-full w-full place-items-center font-display text-3xl font-semibold text-bg"
                style={{ backgroundImage: 'linear-gradient(160deg, #51C5BE, #3E7CB8)' }}
              >
                {detail.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            {tmdbRating !== null && tmdbRating > 0 && (
              <div className="mb-1.5 flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="text-gold" aria-hidden>
                  <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
                </svg>
                <span className="font-mono text-[12px] font-bold text-gold">
                  {tmdbRating.toFixed(1)}
                </span>
                <span className="font-mono text-[10px] text-muted">TMDB</span>
              </div>
            )}
            {/* a part names its show, which is one tap away */}
            {part && (
              <button
                type="button"
                onClick={() => onOpenPart?.(null)}
                className="mb-1 block max-w-full truncate text-left font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-teal"
              >
                {detail.name}
              </button>
            )}
            <h1 className="font-display text-[26px] font-semibold leading-[1.05]">{heading}</h1>
          </div>
        </div>

        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {meta.join(', ')}
        </p>
        {detail.genres.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {detail.genres.map((g) => (
              <span
                key={g}
                className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-muted"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-[13px] leading-snug text-coral">{error}</p>}

        {/* ---- signed out: one honest invitation, no dead controls ---- */}
        {userId === null && (
          <div className="mt-4">
            <CtaButton onClick={onSignIn} className="w-full py-3.5 text-[14px]">
              Sign in to rate it
            </CtaButton>
            <p className="mt-2.5 text-center text-[13px] leading-snug text-muted">
              Rating, saving, and scoring a title with your group need an account. Browsing
              does not.
            </p>
          </div>
        )}

        {/* ---- actions first: inviting the group never hides below the fold ---- */}
        {userId !== null && (
        <div className="mt-4 flex flex-col gap-3">
          <CtaButton
            onClick={() => setInviteOpen(true)}
            disabled={groups.length === 0}
            className="w-full py-3.5 text-[14px] disabled:opacity-50"
          >
            Invite a group to rate it
          </CtaButton>
          {groups.length === 0 && (
            <p className="text-center font-mono text-[10px] text-muted">
              Group rounds need a group first: create one on the Group tab.
            </p>
          )}
          {inviteOpen && (
            <GroupInviteSheet
              groups={groups}
              userId={userId}
              title={titleInput(detail)}
              genreIds={detail.genreIds}
              onStarted={(groupId) => {
                setInviteOpen(false)
                onStartedSession(groupId)
              }}
              onClose={() => setInviteOpen(false)}
            />
          )}

          {/* consolidated secondary actions: solo rate + save, one cluster */}
          <div className="flex items-stretch gap-3">
            <button
              type="button"
              onClick={rateFromActions}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full border py-3 text-[13px] font-semibold transition-colors ${
                myScores
                  ? 'border-gold/40 bg-gold/10 text-gold'
                  : 'border-line text-muted hover:border-teal/50 hover:text-text'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={myScores ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
              </svg>
              {myScores
                ? `Solo ${formatScore(memberWeightedScore(myScores, soloWeights))}, edit`
                : 'Rate it solo'}
            </button>
            {/* lists, playlists and chat cards hold films and shows, not their parts */}
            {!part && (
            <button
              type="button"
              onClick={() => void toggleSave()}
              disabled={saving}
              aria-pressed={savedTitleId !== null}
              aria-busy={saving}
              className={`flex flex-1 items-center justify-center gap-2 rounded-full border py-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${celebrateSave ? 'mp-save-confirm' : ''} ${
                savedTitleId
                  ? 'border-teal/40 bg-teal/10 text-teal'
                  : 'border-line text-muted hover:border-teal/50 hover:text-text'
              }`}
            >
              <svg className={celebrateSave ? 'mp-score-feedback' : ''} width="15" height="15" viewBox="0 0 24 24" fill={savedTitleId ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 21 12 16.5 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
              </svg>
              {saving ? 'Saving…' : savedTitleId ? 'Saved' : 'Save'}
            </button>
            )}
          </div>

          {!part && (
          <>
          {/* ---- add to a playlist ---- */}
          <button
            type="button"
            onClick={toggleListsOpen}
            aria-expanded={listsOpen}
            className={`flex w-full items-center justify-center gap-1.5 rounded-full border py-2.5 text-[13px] font-semibold transition-colors ${
              containing.size > 0
                ? 'border-teal/40 bg-teal/10 text-teal'
                : 'border-line text-muted hover:border-teal/50 hover:text-text'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 9h18M8 5v14" />
            </svg>
            {containing.size > 0
              ? `In ${containing.size} playlist${containing.size === 1 ? '' : 's'}`
              : 'Add to a playlist'}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${listsOpen ? 'rotate-180' : ''}`} aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {/* ---- send it to someone ---- */}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-[13px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text active:bg-surface-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m3.5 7 8.5 6 8.5-6" />
            </svg>
            Send to a chat
          </button>
          {shareOpen && detail && (
            <ShareToChatSheet
              label={`${detail.name}${detail.year ? ` (${detail.year})` : ''}`}
              // Resolved on send, so browsing the sheet never writes a row.
              resolveShare={async () => ({
                shareTitleId: await ensureTitleRow(titleInput(detail)),
              })}
              onClose={() => setShareOpen(false)}
              onSent={() => setShareOpen(false)}
            />
          )}
          {listsOpen && (
            <div className="mp-card rounded-2xl p-3">
              {myLists === null ? (
                <p className="px-1 py-1 text-[12px] text-muted">Loading…</p>
              ) : (
                <>
                  {myLists.map((p) => {
                    const held = containing.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={listBusyId !== null}
                        onClick={() => void handleToggleList(p.id)}
                        className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors active:bg-surface-2 disabled:opacity-60"
                      >
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${
                            held ? 'border-teal bg-teal text-bg' : 'border-line text-transparent'
                          }`}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="m4.5 12.5 5 5 10-11" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium transition-colors group-hover:text-teal">
                          {p.name}
                          <span className="tabular ml-2 font-mono text-[10px] font-normal text-muted">
                            {p.itemCount}
                          </span>
                        </span>
                        {p.groupId && (
                          <GroupMark
                            groupId={p.groupId}
                            name={groups.find((g) => g.id === p.groupId)?.name ?? 'G'}
                            size={18}
                          />
                        )}
                        {listBusyId === p.id && (
                          <span className="font-mono text-[9px] uppercase text-muted">…</span>
                        )}
                      </button>
                    )
                  })}
                  {/* new list destination: yours, or a group watchlist */}
                  {groups.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/50 pt-2.5">
                      <button
                        type="button"
                        onClick={() => setNewListGroupId(null)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          newListGroupId === null
                            ? 'border-teal/50 bg-teal/10 text-teal'
                            : 'border-line text-muted hover:text-text'
                        }`}
                      >
                        Personal
                      </button>
                      {groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setNewListGroupId(g.id)}
                          className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] font-semibold transition-colors ${
                            newListGroupId === g.id
                              ? 'border-teal/50 bg-teal/10 text-teal'
                              : 'border-line text-muted hover:text-text'
                          }`}
                        >
                          <GroupMark groupId={g.id} name={g.name} size={16} />
                          {g.name}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <input
                      type="text"
                      maxLength={80}
                      placeholder={
                        newListGroupId === null ? 'New playlist…' : 'New group watchlist…'
                      }
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void handleCreateListWithTitle()}
                      className={`${fieldClassSm} flex-1`}
                    />
                    <button
                      type="button"
                      disabled={listBusyId !== null || newListName.trim().length === 0}
                      onClick={() => void handleCreateListWithTitle()}
                      className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
                    >
                      {listBusyId === 'new' ? 'Adding…' : 'Create'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          </>
          )}
        </div>
        )}

        {overview && <p className="mt-5 text-[13px] leading-relaxed text-text/90">{overview}</p>}

        {/* ---- an episode steps to its neighbours ---- */}
        {part && part.episode !== null && onOpenPart && (prevEpisode || nextEpisode) && (
          <div className="mt-5 flex items-center justify-between gap-3">
            {prevEpisode ? (
              <button
                type="button"
                onClick={() => onOpenPart({ season: part.season, episode: prevEpisode.episodeNumber })}
                className="min-h-11 min-w-0 truncate rounded-full border border-line px-4 text-[12px] font-semibold text-muted transition-colors hover:border-teal/50 hover:text-text"
              >
                ← Episode {prevEpisode.episodeNumber}
              </button>
            ) : (
              <span />
            )}
            {nextEpisode && (
              <button
                type="button"
                onClick={() => onOpenPart({ season: part.season, episode: nextEpisode.episodeNumber })}
                className="min-h-11 min-w-0 truncate rounded-full border border-teal/40 bg-teal/10 px-4 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20"
              >
                Episode {nextEpisode.episodeNumber} →
              </button>
            )}
          </div>
        )}

        {/* ---- a show's seasons, each rated as a title of its own ---- */}
        {!part && onOpenPart && detail.seasonList && detail.seasonList.length > 0 && (
          <section className="mt-7">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Seasons
            </p>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {detail.seasonList.map((s) => (
                <button
                  key={s.seasonNumber}
                  type="button"
                  onClick={() => onOpenPart({ season: s.seasonNumber, episode: null })}
                  className="group w-[88px] shrink-0 text-left"
                >
                  <div className="h-[132px] w-[88px] overflow-hidden rounded-xl border border-line/60 bg-surface-2">
                    {s.posterPath ? (
                      <img
                        src={posterUrl(s.posterPath, 'w185')}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center font-display text-2xl font-semibold text-muted">
                        {s.seasonNumber === 0 ? 'SP' : s.seasonNumber}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-[12px] font-semibold transition-colors group-hover:text-teal">
                    {s.name}
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted">
                    {s.episodeCount} episode{s.episodeCount === 1 ? '' : 's'}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---- a season's episodes ---- */}
        {part && part.episode === null && onOpenPart && season && season.episodes.length > 0 && (
          <section className="mt-7">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Episodes
            </p>
            <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
              {season.episodes.map((e) => (
                <button
                  key={e.episodeNumber}
                  type="button"
                  onClick={() => onOpenPart({ season: part.season, episode: e.episodeNumber })}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="h-[45px] w-[80px] shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {e.stillPath && (
                      <img
                        src={stillUrl(e.stillPath, 'w185')}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold transition-colors group-hover:text-teal">
                      {e.episodeNumber}. {e.name}
                    </p>
                    <p className="font-mono text-[10px] text-muted">
                      {[formatAirDate(e.airDate), formatRuntime(e.runtimeMinutes)]
                        .filter(Boolean)
                        .join(', ') || 'Not aired yet'}
                    </p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---- where to watch (JustWatch data via TMDB) ---- */}
        {watch && (watch.stream.length > 0 || watch.rent.length > 0 || watch.buy.length > 0) && (
          <section className="mt-7">
            <div className="mb-2.5 flex items-baseline justify-between px-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                Where to watch
              </p>
              {watch.link && (
                <a
                  href={watch.link}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-teal"
                >
                  All options
                </a>
              )}
            </div>
            <WhereToWatch providers={watch} />
          </section>
        )}

        {/* ---- community rating (both crowds, each on their own rubric) ---- */}
        {userId !== null && (
        <section ref={communityRef} className="mt-7 scroll-mt-4">
          <div className="mb-2.5 flex items-baseline justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Community rating
            </p>
            <p className="font-mono text-[10px] text-muted">two crowds, two rubrics</p>
          </div>
          <div className="mp-card rounded-[22px] p-5">
            <div className="grid grid-cols-2 gap-4">
              {(['casual', 'buff'] as const).map((m, i) => {
                const crowd = modeScores?.[m]
                return (
                  <div key={m} className={i > 0 ? 'border-l border-line/50 pl-4' : ''}>
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-teal">
                      {TASTE_MODES[m].plural}
                      {myMode === m && (
                        <span className="rounded-full bg-gold/15 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-gold">
                          you
                        </span>
                      )}
                    </p>
                    <span className="tabular mt-1 block font-display text-[34px] font-semibold leading-none text-teal">
                      {formatScore(crowd?.mashed ?? null)}
                    </span>
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      {crowd && crowd.count > 0
                        ? `${crowd.count} ${crowd.count === 1 ? 'rating' : 'ratings'}`
                        : 'No ratings yet'}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex items-center gap-1.5">
              {(['all', 'casual', 'buff'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => void switchHistFilter(f)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    histFilter === f
                      ? 'border-teal/50 bg-teal/10 text-teal'
                      : 'border-line text-muted hover:text-text'
                  }`}
                >
                  {f === 'all' ? 'Everyone' : TASTE_MODES[f].plural}
                </button>
              ))}
            </div>

            <CommunityHistogram bins={communityBins} mashed={histogramMashed} />

            {!rating && (
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line/60 pt-4">
                {myScores ? (
                  <p className="text-[13px] text-muted">
                    You rated it{' '}
                    <span className="font-semibold text-gold">
                      {formatScore(memberWeightedScore(myScores, soloWeights))}
                    </span>
                  </p>
                ) : (
                  <p className="text-[13px] leading-snug text-muted">
                    Rate it yourself. It counts toward the community score.
                  </p>
                )}
                <div className="flex shrink-0 items-center gap-2">
                  {myScores && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(true)}
                      className="rounded-full border border-line px-3 py-2 text-[12px] font-semibold text-muted transition-colors hover:border-coral/50 hover:text-coral"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openRating}
                    className="rounded-full border border-teal/40 bg-teal/10 px-4 py-2 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20"
                  >
                    {myScores ? 'Edit rating' : 'Rate it'}
                  </button>
                </div>
              </div>
            )}

            {confirmRemove && myScores && !rating && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-coral/30 bg-coral/5 px-4 py-3">
                <p className="text-[13px] leading-snug text-muted">
                  Remove your rating? It drops out of the community score.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(false)}
                    className="rounded-full px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRemoveRating()}
                    disabled={savingRating}
                    className="rounded-full bg-coral/90 px-3.5 py-1.5 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {savingRating ? 'Removing…' : 'Remove'}
                  </button>
                </div>
              </div>
            )}

            {rating && (
              <div className="mt-4 border-t border-line/60 pt-2">
                <p className="pt-1.5 text-[13px] leading-snug text-muted">
                  Score each part for what it's trying to be.
                </p>
                <CategoryLegend entries={soloRubric} className="mt-2" />
                {soloRubric.map((entry, i) => (
                  <ScoreSliderRow
                    key={entry.key}
                    className={`py-3 ${i > 0 ? 'border-t border-line/40' : ''}`}
                    label={entry.label}
                    sub={
                      <p className="mt-0.5 font-mono text-[10px] text-muted">
                        weight {Math.round((entry.weight / soloWeightTotal) * 100)}%
                      </p>
                    }
                    value={soloScores[entry.key] ?? 5}
                    onChange={(v) => setSoloScores((prev) => ({ ...prev, [entry.key]: v }))}
                  />
                ))}
                <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    Your score{' '}
                    <span className="tabular text-gold">
                      {formatScore(memberWeightedScore(soloScores, soloWeights))}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRating(false)}
                      className="rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                    <CtaButton
                      tone="teal"
                      onClick={() => void handleSaveRating()}
                      disabled={savingRating}
                      className="px-4 py-2 text-[12px]"
                    >
                      {savingRating ? 'Saving…' : 'Save rating'}
                    </CtaButton>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        )}

        {/* ---- cast (the show's, so not repeated on its seasons and episodes) ---- */}
        {!part && detail.cast.length > 0 && (
          <section className="mt-7">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
              Cast
            </p>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {detail.cast.map((c, i) => (
                <div key={`${c.name}-${i}`} className="w-16 shrink-0 text-center">
                  <div className="h-16 w-16 overflow-hidden rounded-full border border-line/60 bg-surface-2">
                    {c.profilePath ? (
                      <img src={posterUrl(c.profilePath, 'w185')} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center font-display text-lg text-muted">
                        {c.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[10px] font-medium leading-tight">{c.name}</p>
                  {c.character && (
                    <p className="truncate font-mono text-[9px] text-muted">{c.character}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ---- cross-group Mashed history ---- */}
        {userId !== null && (
        <section className="mt-7">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Your groups’ verdicts
          </p>
          {history.length > 0 ? (
            <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
              {(() => {
                // Combined verdict: the mean of the LATEST Mashed per group you
                // can see (re-rated nights count once — history is newest-first,
                // so the first entry per group is its current verdict; sealed
                // rounds stay out until you score them). Only worth a row once
                // two or more groups have weighed in.
                const seen = new Set<string>()
                const visible = history
                  .filter((entry) => {
                    if (seen.has(entry.groupId)) return false
                    seen.add(entry.groupId)
                    return true
                  })
                  .map((entry) => mashedScore(entry.scorecards, weightsFromRubric(entry.rubric)))
                  .filter((m): m is number => m !== null)
                if (visible.length < 2) return null
                const combined = visible.reduce((sum, m) => sum + m, 0) / visible.length
                return (
                  <div className="flex items-center justify-between bg-teal/5 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">All your groups</p>
                      <p className="font-mono text-[10px] text-muted">
                        {visible.length} groups combined
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="tabular font-display text-[26px] font-semibold leading-none text-teal">
                        {formatScore(combined)}
                      </span>
                      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-teal">
                        Combined
                      </p>
                    </div>
                  </div>
                )
              })()}
              {history.map((entry, i) => {
                const mashed = mashedScore(entry.scorecards, weightsFromRubric(entry.rubric))
                // A newer reveal from the same group above this one means the
                // group re-rated: this row is history, not the current verdict.
                const rerated = history
                  .slice(0, i)
                  .some((h) => h.groupId === entry.groupId)
                return (
                  <button
                    key={entry.sessionId}
                    type="button"
                    onClick={() => onOpenSession?.(entry.groupId, entry.sessionId)}
                    // A verdict is a night that happened: tapping it reopens
                    // THAT Reveal, the same door GroupLog rows open.
                    className="group flex w-full items-center justify-between px-5 py-3.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold transition-colors group-hover:text-teal">
                        {entry.groupName}
                      </p>
                      <p className="font-mono text-[10px] text-muted">
                        {formatRevealed(entry.revealedAt)}
                        {rerated ? ' · an earlier round' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {mashed === null ? (
                        // Sealed for you: lock, never a bare dash (DESIGN.md).
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-muted" aria-hidden>
                            <rect x="4" y="10" width="16" height="11" rx="2.5" />
                            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                          </svg>
                          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted">
                            Sealed
                          </p>
                        </>
                      ) : (
                        <>
                          <span className="tabular font-display text-[26px] font-semibold leading-none text-teal">
                            {formatScore(mashed)}
                          </span>
                          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-teal">
                            Mashed
                          </p>
                        </>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="px-1 text-[13px] leading-snug text-muted">
              None of your groups has mashed this yet.
            </p>
          )}
        </section>
        )}

        {/* ---- discussion: group debriefs + everyone's takes ---- */}
        {userId !== null && (
          <DiscussionSection
            title={titleInput(detail)}
            groups={groups}
            userId={userId}
            initialGroupId={discussGroupId}
            composerSeed={discussSeed}
            refreshKey={discussionRefresh}
          />
        )}
      </div>
    </div>
  )
}
