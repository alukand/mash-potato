import { useEffect, useState } from 'react'
import { fetchGroupmates, fetchInbox, sendMessage } from '../lib/api'
import type { GroupmateInfo, InboxEntry } from '../lib/api'
import { colorForGroup, colorForUser } from '../lib/palette'
import { Avatar } from './avatars'
import { GroupMark } from './ui'

interface ShareToChatSheetProps {
  /** What is being sent, for the sheet's header. */
  label: string
  /**
   * Resolved only when a conversation is picked, so browsing the sheet never
   * writes a titles row for something you decide not to share.
   */
  resolveShare: () => Promise<{ shareTitleId?: string; sharePlaylistId?: string }>
  onClose: () => void
  /** Sent; the caller usually opens the thread. */
  onSent: (conversationId: string) => void
}

// Send a film, show, or playlist into a conversation as a card. Reuses the
// inbox, so the destinations are exactly the chats you already have.
export function ShareToChatSheet({
  label,
  resolveShare,
  onClose,
  onSent,
}: ShareToChatSheetProps) {
  const [entries, setEntries] = useState<InboxEntry[] | undefined>(undefined)
  const [people, setPeople] = useState<Map<string, GroupmateInfo>>(new Map())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchInbox(false), fetchGroupmates().catch(() => [])])
      .then(([inbox, mates]) => {
        if (cancelled) return
        // A pending request you received is not a place to share into.
        setEntries(inbox.filter((e) => e.requestState === 'accepted'))
        setPeople(new Map(mates.map((m) => [m.userId, m])))
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load your chats')
          setEntries([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function nameFor(e: InboxEntry): string {
    if (e.kind === 'dm') {
      return e.otherUserId ? (people.get(e.otherUserId)?.displayName ?? 'Someone') : 'Someone'
    }
    return e.title ?? 'Chat'
  }

  async function share(e: InboxEntry) {
    setBusyId(e.conversationId)
    setError(null)
    try {
      const target = await resolveShare()
      await sendMessage(e.conversationId, { ...target, body: note.trim() })
      onSent(e.conversationId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that')
      setBusyId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Send to a chat"
        className="mp-card max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[26px] px-5 pb-safe pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[20px] font-semibold leading-tight">
              Send to a chat
            </h2>
            <p className="mt-0.5 truncate text-[13px] leading-snug text-muted">{label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-text active:bg-surface-2"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <input
          type="text"
          value={note}
          maxLength={280}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Say something with it"
          placeholder="Say something with it (optional)"
          className="mt-4 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] text-text placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60"
        />

        {error && (
          <p role="alert" className="mt-3 text-[13px] leading-snug text-coral">
            {error}
          </p>
        )}

        {entries === undefined ? (
          <p className="py-6 text-center text-[13px] text-muted">Loading your chats…</p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-[13px] leading-snug text-muted">
            No chats yet. Every group you are in has one, and you can message
            anyone you share a group with.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line/50">
            {entries.map((e) => {
              const name = nameFor(e)
              return (
                <li key={e.conversationId}>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void share(e)}
                    className="group flex w-full items-center gap-3 py-3 text-left transition-colors active:bg-surface-2 disabled:opacity-50"
                  >
                    {e.kind === 'group' && e.groupId ? (
                      <GroupMark groupId={e.groupId} name={name} size={34} />
                    ) : e.kind === 'custom' ? (
                      <span
                        aria-hidden
                        className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full font-display text-[14px] font-semibold text-bg"
                        style={{ backgroundColor: colorForGroup(e.conversationId) }}
                      >
                        {name.charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      <Avatar
                        avatarKey={
                          e.otherUserId ? (people.get(e.otherUserId)?.avatarKey ?? null) : null
                        }
                        displayName={name}
                        color={colorForUser(e.otherUserId ?? e.conversationId)}
                        size={34}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                      {name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-teal">
                      {busyId === e.conversationId ? 'Sending…' : 'Send'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
