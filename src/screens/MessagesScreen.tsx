import { useCallback, useEffect, useState } from 'react'
import {
  acceptDmRequest,
  declineDmRequest,
  fetchGroupmates,
  fetchInbox,
  onInboxChange,
  startDm,
} from '../lib/api'
import type { GroupmateInfo, InboxEntry } from '../lib/api'
import { colorForUser, colorForGroup } from '../lib/palette'
import { Avatar } from '../components/avatars'
import { GroupMark, UnreadBadge } from '../components/ui'

interface MessagesScreenProps {
  userId: string
  /** Display names for the people in your DMs (groupmates, mostly). */
  onOpenThread: (conversationId: string) => void
  onBack: () => void
}

/** "9:41" today, "Tue" this week, else "12 Jul". */
function whenLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const days = (now.getTime() - d.getTime()) / 86400000
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// The message centre: pending requests first (they need an answer), then every
// conversation by recent activity. A DM's name comes from the groupmate
// roster; a group chat or custom chat carries its own title.
export function MessagesScreen({ userId, onOpenThread, onBack }: MessagesScreenProps) {
  const [entries, setEntries] = useState<InboxEntry[] | undefined>(undefined)
  const [people, setPeople] = useState<Map<string, GroupmateInfo>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const load = useCallback(async () => {
    try {
      const [inbox, mates] = await Promise.all([fetchInbox(false), fetchGroupmates()])
      setEntries(inbox)
      setPeople(new Map(mates.map((m) => [m.userId, m])))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your messages')
    }
  }, [])

  useEffect(() => {
    void load()
    return onInboxChange(() => void load())
  }, [load])

  function nameFor(e: InboxEntry): string {
    if (e.kind === 'dm') {
      return e.otherUserId ? (people.get(e.otherUserId)?.displayName ?? 'Someone') : 'Someone'
    }
    return e.title ?? 'Chat'
  }

  async function answer(e: InboxEntry, accept: boolean) {
    setBusyId(e.conversationId)
    setError(null)
    try {
      if (accept) {
        await acceptDmRequest(e.conversationId)
        onOpenThread(e.conversationId)
      } else {
        await declineDmRequest(e.conversationId)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer that request')
    } finally {
      setBusyId(null)
    }
  }

  async function openDm(other: GroupmateInfo) {
    setBusyId(other.userId)
    setError(null)
    try {
      const id = await startDm(other.userId)
      setComposing(false)
      onOpenThread(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that chat')
    } finally {
      setBusyId(null)
    }
  }

  // Requests need an answer, so they sit above the ordinary list. Only ones
  // sent TO you: your own unanswered request is just a quiet thread.
  const requests = (entries ?? []).filter(
    (e) => e.requestState === 'pending' && e.requestedBy !== userId,
  )
  const threads = (entries ?? []).filter(
    (e) => !(e.requestState === 'pending' && e.requestedBy !== userId),
  )

  return (
    <div className="px-5 pt-safe">
      <header className="mp-rise mb-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-9 w-9 place-items-center rounded-full border border-line/60 text-text transition-colors hover:text-teal active:bg-surface-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Messages
        </p>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          aria-expanded={composing}
          className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
            composing
              ? 'border-teal/40 bg-teal/10 text-teal'
              : 'border-line bg-surface-2 text-muted hover:border-teal/50 hover:text-text'
          }`}
        >
          {composing ? 'Close' : 'New'}
        </button>
      </header>

      {error && (
        <p role="alert" className="mp-rise mb-3 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}

      {/* ---- start something new ---- */}
      {composing && (
        <section className="mp-rise mb-6">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Message someone
          </p>
          {people.size === 0 ? (
            <p className="px-1 text-[13px] leading-snug text-muted">
              Nobody to message yet. People you share a group with show up here.
            </p>
          ) : (
            <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
              {[...people.values()].map((p) => (
                <button
                  key={p.userId}
                  type="button"
                  disabled={busyId === p.userId}
                  onClick={() => void openDm(p)}
                  className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2 disabled:opacity-50"
                >
                  <Avatar
                    avatarKey={p.avatarKey}
                    displayName={p.displayName}
                    color={colorForUser(p.userId)}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">
                      {p.displayName}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted">
                      {p.sharedGroups.join(', ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---- requests: someone you do not share a group with ---- */}
      {requests.length > 0 && (
        <section className="mp-rise mb-6">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Requests <span className="tabular ml-1 font-mono text-[10px]">{requests.length}</span>
          </p>
          <div className="mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
            {requests.map((e) => (
              <div key={e.conversationId} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    avatarKey={null}
                    displayName={nameFor(e)}
                    color={colorForUser(e.otherUserId ?? e.conversationId)}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{nameFor(e)}</p>
                    <p className="truncate text-[13px] leading-snug text-muted">
                      {e.lastMessagePreview || 'wants to message you'}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === e.conversationId}
                    onClick={() => void answer(e, false)}
                    className="flex-1 rounded-full border border-line py-2 text-[12px] font-semibold text-muted transition-colors hover:text-text disabled:opacity-50"
                  >
                    Ignore
                  </button>
                  <button
                    type="button"
                    disabled={busyId === e.conversationId}
                    onClick={() => void answer(e, true)}
                    className="flex-1 rounded-full border border-teal/40 bg-teal/10 py-2 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
                  >
                    Accept
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* Honest about what Ignore does: it is silent on their end. */}
          <p className="mt-2 px-2 text-[12px] leading-snug text-muted">
            Ignoring is quiet. They are not told, and they cannot message you again.
          </p>
        </section>
      )}

      {/* ---- the conversations ---- */}
      {entries === undefined ? (
        <p className="mp-rise py-10 text-center text-[13px] text-muted">Loading…</p>
      ) : threads.length === 0 ? (
        <div className="mp-rise py-10 text-center">
          <p className="text-[13px] leading-snug text-muted">
            No messages yet. Every group you are in has a chat, and you can
            message anyone you share a group with.
          </p>
        </div>
      ) : (
        <div className="mp-rise mp-card divide-y divide-line/50 overflow-hidden rounded-[22px]">
          {threads.map((e) => {
            const name = nameFor(e)
            const mine = e.lastSenderId === userId
            return (
              <button
                key={e.conversationId}
                type="button"
                onClick={() => onOpenThread(e.conversationId)}
                className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2"
              >
                {e.kind === 'group' && e.groupId ? (
                  <GroupMark groupId={e.groupId} name={name} size={36} />
                ) : e.kind === 'custom' ? (
                  <span
                    aria-hidden
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-semibold text-bg"
                    style={{ backgroundColor: colorForGroup(e.conversationId) }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <Avatar
                    avatarKey={e.otherUserId ? (people.get(e.otherUserId)?.avatarKey ?? null) : null}
                    displayName={name}
                    color={colorForUser(e.otherUserId ?? e.conversationId)}
                    size={36}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] font-medium">{name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {whenLabel(e.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span
                      className={`min-w-0 truncate text-[13px] leading-snug ${
                        e.unreadCount > 0 ? 'text-text' : 'text-muted'
                      }`}
                    >
                      {e.lastMessageKind === 'title'
                        ? `${mine ? 'You shared' : 'Shared'} ${e.lastMessagePreview}`
                        : e.lastMessageKind === 'playlist'
                          ? `${mine ? 'You shared' : 'Shared'} ${e.lastMessagePreview}`
                          : e.lastMessagePreview || 'No messages yet'}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {e.muted && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-muted" aria-label="Muted">
                          <path d="M3 3l18 18M18 8a6 6 0 0 0-9-5M6 9v3l-2 3h11" />
                        </svg>
                      )}
                      <UnreadBadge count={e.unreadCount} />
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
