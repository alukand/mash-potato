import { useEffect, useState } from 'react'
import {
  deletePlaylist,
  fetchPlaylist,
  removeTitleFromPlaylist,
  updatePlaylist,
} from '../lib/api'
import type { PlaylistDetail } from '../lib/api'
import { PosterGrid } from '../components/PosterGrid'
import { GroupMark, VisibilityChip, fieldClassSm } from '../components/ui'

interface PlaylistScreenProps {
  playlistId: string
  userId: string
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  /** Open the owner's public profile (shown on lists that aren't yours). */
  onOpenUser: (userId: string) => void
  onBack: () => void
  /** The playlist was deleted; pop this view. */
  onDeleted: () => void
}

// One playlist: your own (rename, visibility, manage items, delete) or
// someone's public one (browse only). Lives on the App view-stack.
export function PlaylistScreen({
  playlistId,
  userId,
  onOpenTitle,
  onOpenUser,
  onBack,
  onDeleted,
}: PlaylistScreenProps) {
  const [detail, setDetail] = useState<PlaylistDetail | null | undefined>(undefined)
  const [manage, setManage] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(undefined)
    setManage(false)
    setRenaming(false)
    setConfirmDelete(false)
    fetchPlaylist(playlistId)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        setNameDraft(d?.name ?? '')
      })
      .catch((err) => {
        if (cancelled) return
        setDetail(null)
        setError(err instanceof Error ? err.message : 'Could not load this playlist')
      })
    return () => {
      cancelled = true
    }
  }, [playlistId])

  const mine = detail != null && detail.ownerId === userId
  // Group watchlists: seeing one means being in the group (RLS), and every
  // member curates the titles. Rename/visibility/delete stay with the creator.
  const canCurate = mine || (detail != null && detail.groupId !== null)

  async function handleRename() {
    if (!detail) return
    const name = nameDraft.trim()
    if (name.length === 0 || name === detail.name) {
      setRenaming(false)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updatePlaylist(detail.id, { name })
      setDetail({ ...detail, name })
      setRenaming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the playlist')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleVisibility() {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      await updatePlaylist(detail.id, { isPublic: !detail.isPublic })
      setDetail({ ...detail, isPublic: !detail.isPublic })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change visibility')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(titleId: string) {
    if (!detail) return
    setError(null)
    try {
      await removeTitleFromPlaylist(detail.id, titleId)
      setDetail({ ...detail, items: detail.items.filter((i) => i.titleId !== titleId) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that title')
    }
  }

  async function handleDelete() {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      await deletePlaylist(detail.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the playlist')
      setBusy(false)
    }
  }

  return (
    <div className="px-5 pt-safe">
      <header className="mp-rise mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 place-items-center rounded-full border border-line/60 text-text transition-colors hover:text-teal"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        {canCurate && (
          <button
            type="button"
            onClick={() => {
              setManage((m) => !m)
              setConfirmDelete(false)
            }}
            className={`font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              manage ? 'text-teal' : 'text-muted hover:text-text'
            }`}
          >
            {manage ? 'Done' : 'Manage'}
          </button>
        )}
      </header>

      {detail === undefined && (
        <p className="mp-rise py-10 text-center text-[13px] text-muted">Loading…</p>
      )}
      {detail === null && (
        <p className="mp-rise py-10 text-center text-[13px] text-coral">
          {error ?? 'This playlist is private or gone.'}
        </p>
      )}

      {detail && (
        <>
          <section className="mp-rise">
            {renaming ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  maxLength={80}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleRename()}
                  aria-label="Playlist name"
                  className={`flex-1 ${fieldClassSm}`}
                />
                <button
                  type="button"
                  disabled={busy || nameDraft.trim().length === 0}
                  onClick={() => void handleRename()}
                  className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="min-w-0 truncate font-display text-[26px] font-semibold leading-tight">
                  {detail.name}
                </h1>
                {mine && (
                  <button
                    type="button"
                    onClick={() => setRenaming(true)}
                    aria-label="Rename this playlist"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line/60 text-muted transition-colors hover:border-teal/50 hover:text-teal"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            <div className="mt-2 flex items-center gap-2.5">
              <p className="tabular font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                {detail.items.length} title{detail.items.length === 1 ? '' : 's'}
              </p>
              {detail.groupId ? (
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  <GroupMark groupId={detail.groupId} name={detail.groupName ?? 'G'} size={16} />
                  {detail.groupName ?? 'Group'} watchlist
                </span>
              ) : mine ? (
                <VisibilityChip
                  isPublic={detail.isPublic}
                  disabled={busy}
                  onToggle={() => void handleToggleVisibility()}
                  ariaLabel={detail.isPublic ? 'Make this playlist private' : 'Make this playlist public'}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenUser(detail.ownerId)}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-teal"
                >
                  by {detail.ownerName}
                </button>
              )}
            </div>
            {detail.groupId ? (
              <p className="mt-1.5 text-[12px] leading-snug text-muted">
                Everyone in the group can add and remove titles. It never leaves the group.
              </p>
            ) : (
              mine && (
                <p className="mt-1.5 text-[12px] leading-snug text-muted">
                  {detail.isPublic
                    ? 'Anyone who opens your profile can browse this playlist.'
                    : 'Only you can see this playlist. Tap the chip to share it.'}
                </p>
              )
            )}
          </section>

          {error && (
            <p role="alert" className="mp-rise mt-3 text-[13px] leading-snug text-coral">
              {error}
            </p>
          )}

          <section className="mp-rise mt-6" style={{ animationDelay: '80ms' }}>
            {detail.items.length === 0 ? (
              <p className="px-1 text-[13px] leading-snug text-muted">
                {canCurate
                  ? 'Nothing in here yet. Open any title and add it to this playlist.'
                  : 'Nothing in here yet.'}
              </p>
            ) : (
              <PosterGrid
                items={detail.items}
                onOpenTitle={onOpenTitle}
                onRemove={canCurate && manage ? (titleId) => void handleRemove(titleId) : undefined}
              />
            )}
          </section>

          {mine && manage && (
            <section className="mp-rise mt-8">
              {!confirmDelete ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-coral/50 hover:text-coral disabled:opacity-50"
                >
                  Delete this playlist
                </button>
              ) : (
                <div className="rounded-2xl border border-coral/30 bg-coral/5 p-4">
                  <p className="text-[13px] font-semibold leading-snug">
                    Delete {detail.name}?
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-muted">
                    The titles stay in the app; only this list goes away.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="flex-1 rounded-full border border-line py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text"
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete()}
                      className="flex-1 rounded-full bg-coral/90 py-2.5 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
                    >
                      {busy ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
