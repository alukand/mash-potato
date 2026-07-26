import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acceptDiscussionTerms,
  blockUserRpc,
  deleteMessage,
  fetchGroupmates,
  fetchInbox,
  fetchLatestSession,
  fetchPeopleProfiles,
  fetchReadReceipts,
  fetchTermsAccepted,
  fetchThread,
  leaveChat,
  markConversationRead,
  onThreadChange,
  posterUrl,
  reportMessage,
  sendMessage,
  setConversationPrefs,
  toggleMessageReaction,
  typingChannel,
} from '../lib/api'
import type { InboxEntry, MessageEntry, MessageReactionKind } from '../lib/api'
import { colorForUser } from '../lib/palette'
import { Avatar } from '../components/avatars'
import { fieldClassSm } from '../components/ui'

interface ThreadScreenProps {
  conversationId: string
  userId: string
  onOpenTitle: (tmdbId: number, mediaType: 'movie' | 'tv') => void
  onBack: () => void
}

const REACTIONS: { kind: MessageReactionKind; glyph: string; label: string }[] = [
  { kind: 'like', glyph: '👍', label: 'Like' },
  { kind: 'funny', glyph: '😂', label: 'Funny' },
  { kind: 'fire', glyph: '🔥', label: 'Fire' },
  { kind: 'love', glyph: '❤️', label: 'Love' },
  { kind: 'sad', glyph: '😢', label: 'Sad' },
]

const dayKey = (iso: string) => new Date(iso).toDateString()

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()
  if (d.toDateString() === today) return 'Today'
  if (d.toDateString() === yesterday) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

// One conversation. Messages arrive newest-first from the API and are flipped
// for display, so the newest sits at the bottom like every other chat.
export function ThreadScreen({
  conversationId,
  userId,
  onOpenTitle,
  onBack,
}: ThreadScreenProps) {
  const [messages, setMessages] = useState<MessageEntry[] | undefined>(undefined)
  const [meta, setMeta] = useState<InboxEntry | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [receipts, setReceipts] = useState<{ userId: string; lastReadAt: string }[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blindRound, setBlindRound] = useState(false)
  /** Message the action sheet is open for. */
  const [actionFor, setActionFor] = useState<MessageEntry | null>(null)
  const [confirmKind, setConfirmKind] = useState<'delete' | 'report' | null>(null)
  const [replyTo, setReplyTo] = useState<MessageEntry | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  /** undefined = not checked yet; false = show the house rules first. */
  const [termsOk, setTermsOk] = useState<boolean | undefined>(undefined)
  const [confirmBlock, setConfirmBlock] = useState(false)
  /** Who is typing right now; entries expire on their own. */
  const [typers, setTypers] = useState<Set<string>>(new Set())
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const typingRef = useRef<{ ping: () => void; stop: () => void } | null>(null)
  const lastPingRef = useRef(0)

  const load = useCallback(async () => {
    try {
      const [page, inbox, mates, reads] = await Promise.all([
        fetchThread(conversationId, userId),
        fetchInbox(false).catch(() => [] as InboxEntry[]),
        fetchGroupmates().catch(() => []),
        fetchReadReceipts(conversationId).catch(() => []),
      ])
      setMessages(page)
      setReceipts(reads)
      const entry = inbox.find((e) => e.conversationId === conversationId) ?? null
      setMeta(entry)
      const roster = new Map(mates.map((m) => [m.userId, m.displayName]))
      // Same as the inbox: a stranger who messaged you is not a groupmate, so
      // the header would read "Someone" without this.
      if (entry?.kind === 'dm' && entry.otherUserId && !roster.has(entry.otherUserId)) {
        const extra = await fetchPeopleProfiles([entry.otherUserId])
        const p = extra.get(entry.otherUserId)
        if (p) roster.set(entry.otherUserId, p.displayName)
      }
      setNames(roster)
      setError(null)
      if (entry?.groupId) {
        const latest = await fetchLatestSession(entry.groupId).catch(() => null)
        setBlindRound(latest?.state === 'blind')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this conversation')
    }
  }, [conversationId, userId])

  useEffect(() => {
    void load()
    return onThreadChange(conversationId, () => void load())
  }, [load, conversationId])

  // Typing pings. Each arrival clears itself after ~4s, so a sender who goes
  // quiet (or drops off) never leaves a stuck "typing…".
  useEffect(() => {
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const chan = typingChannel(conversationId, userId, (from) => {
      setTypers((prev) => new Set(prev).add(from))
      clearTimeout(timers.get(from))
      timers.set(
        from,
        setTimeout(() => {
          setTypers((prev) => {
            const next = new Set(prev)
            next.delete(from)
            return next
          })
        }, 4000),
      )
    })
    typingRef.current = chan
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      chan.stop()
      typingRef.current = null
      setTypers(new Set())
    }
  }, [conversationId, userId])

  // Ask before you type, not after a rejected send.
  useEffect(() => {
    let cancelled = false
    fetchTermsAccepted(userId)
      .then((ok) => !cancelled && setTermsOk(ok))
      .catch(() => !cancelled && setTermsOk(true))
    return () => {
      cancelled = true
    }
  }, [userId])

  // Opening a thread reads it; so does every new message while you are here.
  useEffect(() => {
    if (messages === undefined) return
    void markConversationRead(conversationId).catch(() => {})
  }, [conversationId, messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : label)
    } finally {
      setBusy(false)
    }
  }

  async function handleSend() {
    const text = body.trim()
    if (text.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendMessage(conversationId, { body: text, replyToId: replyTo?.id ?? null })
      setBody('')
      setReplyTo(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that')
    } finally {
      setBusy(false)
    }
  }

  function closeSheet() {
    setActionFor(null)
    setConfirmKind(null)
  }

  const title =
    meta === null
      ? 'Conversation'
      : meta.kind === 'dm'
        ? (meta.otherUserId ? (names.get(meta.otherUserId) ?? 'Someone') : 'Someone')
        : (meta.title ?? 'Chat')
  const isGroupish = meta !== null && meta.kind !== 'dm'
  const ordered = [...(messages ?? [])].reverse()
  const pending = meta?.requestState === 'pending'
  const iRequested = pending && meta?.requestedBy === userId

  // "Seen" sits under my newest message, if anyone else has read past it.
  const myLast = [...ordered].reverse().find((m) => m.senderId === userId && !m.deleted)
  const seenBy = myLast
    ? receipts.filter(
        (r) => r.userId !== userId && new Date(r.lastReadAt) >= new Date(myLast.createdAt),
      )
    : []

  return (
    <div className="flex min-h-[100dvh] flex-col px-5 pt-safe">
      <header className="mp-rise mb-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/60 text-text transition-colors hover:text-teal active:bg-surface-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-[18px] font-semibold leading-tight">
          {title}
        </h1>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Conversation options"
          aria-expanded={menuOpen}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/60 text-muted transition-colors hover:text-text active:bg-surface-2"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
      </header>

      {menuOpen && meta && (
        <div className="mp-rise mb-3 overflow-hidden rounded-2xl border border-line bg-surface-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false)
              void run('Could not change that', () =>
                setConversationPrefs(conversationId, { muted: !meta.muted }),
              )
            }}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-medium transition-colors active:bg-surface disabled:opacity-50"
          >
            {meta.muted ? 'Unmute this chat' : 'Mute this chat'}
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
              {meta.muted ? 'muted' : 'notifications on'}
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMenuOpen(false)
              void run('Could not archive that', async () => {
                await setConversationPrefs(conversationId, { archived: true })
                onBack()
              })
            }}
            className="flex w-full items-center px-4 py-3 text-left text-[13px] font-medium transition-colors active:bg-surface disabled:opacity-50"
          >
            Archive
          </button>
          {meta.kind === 'custom' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMenuOpen(false)
                void run('Could not leave that chat', async () => {
                  await leaveChat(conversationId)
                  onBack()
                })
              }}
              className="flex w-full items-center px-4 py-3 text-left text-[13px] font-medium text-coral transition-colors active:bg-surface disabled:opacity-50"
            >
              Leave this chat
            </button>
          )}
          {meta.kind === 'dm' && meta.otherUserId && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMenuOpen(false)
                setConfirmBlock(true)
              }}
              className="flex w-full items-center px-4 py-3 text-left text-[13px] font-medium text-coral transition-colors active:bg-surface disabled:opacity-50"
            >
              Block {title}
            </button>
          )}
        </div>
      )}

      {confirmBlock && meta?.otherUserId && (
        <div className="mp-rise mb-3 rounded-2xl border border-coral/30 bg-coral/5 p-4">
          <p className="text-[13px] font-semibold leading-snug text-coral">
            Block {title}?
          </p>
          {/* Precise on purpose: a block STOPS a DM, but in a group chat it
              can only hide, because you are both legitimately in the room. */}
          <p className="mt-1.5 text-[12px] leading-snug text-muted">
            They will not be able to message you, and you will not see each
            other here. In any group chat you share, their messages are hidden
            from you rather than stopped. You can undo this in Profile.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmBlock(false)}
              className="flex-1 rounded-full border border-line py-2 text-[12px] font-semibold text-muted transition-colors hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const other = meta.otherUserId
                setConfirmBlock(false)
                if (!other) return
                void run('Could not block them', async () => {
                  await blockUserRpc(other)
                  onBack()
                })
              }}
              className="flex-1 rounded-full bg-coral/90 py-2 text-[12px] font-bold text-bg disabled:opacity-50"
            >
              Block
            </button>
          </div>
        </div>
      )}

      {/* Etiquette, not enforcement: RLS already stops anyone SEEING a score
          early, and people can text outside the app anyway. */}
      {blindRound && (
        <p className="mp-rise mb-3 rounded-2xl border border-gold/30 bg-gold/5 px-4 py-2.5 text-[12px] leading-snug text-muted">
          A blind round is running. No spoilers until everyone has locked in.
        </p>
      )}

      {iRequested && (
        <p className="mp-rise mb-3 rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-[12px] leading-snug text-muted">
          Waiting for them to accept. You can send one message until they do.
        </p>
      )}

      {error && (
        <p role="alert" className="mp-rise mb-2 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}

      {/* ---- the messages ---- */}
      <div className="min-h-0 flex-1 pb-3">
        {messages === undefined ? (
          <p className="py-10 text-center text-[13px] text-muted">Loading…</p>
        ) : ordered.length === 0 ? (
          <p className="py-10 text-center text-[13px] leading-snug text-muted">
            Nothing here yet. Say the first thing.
          </p>
        ) : (
          ordered.map((m, i) => {
            const prev = ordered[i - 1]
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
            const mine = m.senderId === userId
            const startsRun =
              newDay || !prev || prev.senderId !== m.senderId || prev.kind === 'system'
            const reacted = REACTIONS.filter((r) => m.reactions[r.kind] > 0)

            if (m.kind === 'system') {
              return (
                <div key={m.id}>
                  {newDay && <DaySeparator iso={m.createdAt} />}
                  <p className="py-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    {m.body}
                  </p>
                </div>
              )
            }

            return (
              <div key={m.id}>
                {newDay && <DaySeparator iso={m.createdAt} />}
                <div
                  className={`flex items-end gap-2 ${startsRun ? 'mt-3' : 'mt-1'} ${
                    mine ? 'flex-row-reverse' : ''
                  }`}
                >
                  {isGroupish && !mine ? (
                    startsRun ? (
                      <Avatar
                        avatarKey={m.senderAvatarKey}
                        displayName={m.senderName}
                        color={colorForUser(m.senderId)}
                        size={26}
                      />
                    ) : (
                      <span aria-hidden className="w-[26px] shrink-0" />
                    )
                  ) : null}
                  <div className="max-w-[78%]">
                    {isGroupish && !mine && startsRun && (
                      <p className="mb-0.5 px-1 font-mono text-[10px] text-muted">
                        {m.senderName}
                      </p>
                    )}
                    {m.replyTo && (
                      <p className="mb-1 truncate rounded-lg border-l-2 border-teal/50 bg-surface-2 px-2 py-1 text-[11px] leading-snug text-muted">
                        {m.replyTo.deleted ? 'Message deleted' : m.replyTo.preview}
                      </p>
                    )}
                    {/* The whole bubble opens the actions: reactions, reply,
                        delete, report. Long-press is not reachable in a
                        webview, so a plain tap it is. */}
                    <button
                      type="button"
                      onClick={() => !m.deleted && setActionFor(m)}
                      disabled={m.deleted}
                      className="block w-full text-left disabled:cursor-default"
                    >
                      {m.deleted ? (
                        <span className="block rounded-2xl border border-line px-3.5 py-2 text-[13px] italic text-muted">
                          Message deleted
                        </span>
                      ) : m.shareTitle ? (
                        <span
                          className={`flex w-full items-center gap-3 rounded-2xl border p-2 transition-colors active:brightness-110 ${
                            mine ? 'border-teal/40 bg-teal/10' : 'border-line bg-surface-2'
                          }`}
                        >
                          {m.shareTitle.posterPath ? (
                            <img
                              src={posterUrl(m.shareTitle.posterPath, 'w92')}
                              alt=""
                              loading="lazy"
                              className="h-14 w-9 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="grid h-14 w-9 shrink-0 place-items-center rounded-md bg-line font-display text-sm font-semibold text-bg"
                            >
                              {m.shareTitle.name.charAt(0)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold">
                              {m.shareTitle.name}
                            </span>
                            <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">
                              {m.shareTitle.mediaType === 'movie' ? 'Film' : 'TV'}
                            </span>
                            {/* the "say something with it" note rides the card */}
                            {m.body && (
                              <span className="mt-1 block whitespace-pre-wrap break-words text-[13px] leading-snug text-text">
                                {m.body}
                              </span>
                            )}
                          </span>
                        </span>
                      ) : m.sharePlaylist ? (
                        <span
                          className={`block rounded-2xl border px-3.5 py-2 text-[13px] ${
                            mine ? 'border-teal/40 bg-teal/10' : 'border-line bg-surface-2'
                          }`}
                        >
                          <span className="block font-mono text-[10px] uppercase tracking-wide text-muted">
                            Playlist
                          </span>
                          <span className="font-semibold">{m.sharePlaylist.name}</span>
                          {m.body && (
                            <span className="mt-1 block whitespace-pre-wrap break-words leading-snug">
                              {m.body}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span
                          className={`block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-snug transition-colors active:brightness-110 ${
                            mine
                              ? 'bg-teal/15 text-text'
                              : 'border border-line bg-surface-2 text-text'
                          }`}
                        >
                          {m.body}
                        </span>
                      )}
                    </button>
                    {reacted.length > 0 && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
                        {reacted.map((r) => (
                          <button
                            key={r.kind}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void run('Could not react', () =>
                                toggleMessageReaction(m.id, r.kind),
                              )
                            }
                            aria-label={`${r.label}, ${m.reactions[r.kind]}`}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50 ${
                              m.myReaction === r.kind
                                ? 'border-teal/50 bg-teal/10'
                                : 'border-line bg-surface-2'
                            }`}
                          >
                            <span aria-hidden>{r.glyph}</span>
                            <span className="tabular font-mono text-[10px] text-muted">
                              {m.reactions[r.kind]}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p
                      className={`mt-0.5 px-1 font-mono text-[9px] text-muted ${
                        mine ? 'text-right' : ''
                      }`}
                    >
                      {timeLabel(m.createdAt)}
                      {m.shareTitle && m.shareTitle.tmdbId !== null && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={() =>
                              m.shareTitle?.tmdbId != null &&
                              onOpenTitle(m.shareTitle.tmdbId, m.shareTitle.mediaType)
                            }
                            className="underline decoration-dotted underline-offset-2 hover:text-teal"
                          >
                            open
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )
          })
        )}
        {seenBy.length > 0 && typers.size === 0 && (
          <p className="mt-1 pr-1 text-right font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
            Seen{isGroupish ? ` by ${seenBy.length}` : ''}
          </p>
        )}
        {typers.size > 0 && (
          <p className="mt-2 flex items-center gap-1.5 px-1 text-[12px] italic text-muted">
            <span aria-hidden className="flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-muted" />
              <span className="h-1 w-1 rounded-full bg-muted" />
              <span className="h-1 w-1 rounded-full bg-muted" />
            </span>
            {typers.size === 1
              ? `${names.get([...typers][0]) ?? 'Someone'} is typing…`
              : `${typers.size} people are typing…`}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ---- composer ---- */}
      <div className="sticky bottom-0 -mx-5 border-t border-line/50 bg-bg/90 px-5 pb-safe pt-3 backdrop-blur-md">
        {termsOk === false ? (
          // The house rules, shown BEFORE the first message rather than as a
          // rejected send (App Review 1.2: zero-tolerance agreement).
          <div className="rounded-2xl border border-line bg-surface-2 p-4">
            <p className="text-[13px] font-semibold leading-snug">House rules</p>
            <p className="mt-1.5 text-[12px] leading-snug text-muted">
              No harassment, hate, or objectionable content, in public or in a
              private chat. Accounts that post it are removed. You can report
              any message and block anyone.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run('Could not save that', async () => {
                  await acceptDiscussionTerms()
                  setTermsOk(true)
                })
              }
              className="mt-3 w-full rounded-full border border-teal/40 bg-teal/10 py-2.5 text-[13px] font-semibold text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
            >
              Agree and start messaging
            </button>
          </div>
        ) : (
        <>
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border-l-2 border-teal/50 bg-surface-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[11px] leading-snug text-muted">
              Replying to{' '}
              <span className="font-semibold">
                {replyTo.senderId === userId ? 'yourself' : replyTo.senderName}
              </span>
              : {replyTo.body || replyTo.shareTitle?.name || replyTo.sharePlaylist?.name}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancel reply"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted hover:text-text"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <textarea
            rows={1}
            maxLength={4000}
            value={body}
            disabled={busy}
            aria-label="Write a message"
            placeholder="Message…"
            onChange={(e) => {
              setBody(e.target.value)
              // Throttled to one ping a second: this fires per keystroke.
              const now = Date.now()
              if (e.target.value.length > 0 && now - lastPingRef.current > 1000) {
                lastPingRef.current = now
                typingRef.current?.ping()
              }
            }}
            className={`max-h-28 flex-1 resize-none ${fieldClassSm}`}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={busy || body.trim().length === 0}
            className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-4 py-2 text-[12px] font-semibold text-teal transition-colors hover:bg-teal/20 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
        </>
        )}
      </div>

      {/* ---- message actions ---- */}
      {actionFor && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm"
          onClick={closeSheet}
        >
          <div
            role="dialog"
            aria-label="Message options"
            className="mp-card w-full max-w-[480px] rounded-t-[26px] px-5 pb-safe pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap justify-center gap-2">
              {REACTIONS.map((r) => (
                <button
                  key={r.kind}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const id = actionFor.id
                    closeSheet()
                    void run('Could not react', () => toggleMessageReaction(id, r.kind))
                  }}
                  aria-label={r.label}
                  className={`grid h-11 w-11 place-items-center rounded-full border text-[20px] transition-colors disabled:opacity-50 ${
                    actionFor.myReaction === r.kind
                      ? 'border-teal/50 bg-teal/10'
                      : 'border-line bg-surface-2'
                  }`}
                >
                  <span aria-hidden>{r.glyph}</span>
                </button>
              ))}
            </div>

            {confirmKind ? (
              <div className="mt-4 rounded-2xl border border-coral/30 bg-coral/5 p-4">
                <p className="text-[13px] leading-snug text-muted">
                  {confirmKind === 'delete'
                    ? 'Delete your message? The words go; a reply to it keeps its place.'
                    : 'Report this message? It goes to review, and in a one-to-one chat it is hidden from you straight away.'}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmKind(null)}
                    className="flex-1 rounded-full border border-line py-2 text-[12px] font-semibold text-muted"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const id = actionFor.id
                      const kind = confirmKind
                      closeSheet()
                      void run(
                        kind === 'delete' ? 'Could not delete that' : 'Could not report that',
                        () => (kind === 'delete' ? deleteMessage(id) : reportMessage(id, null)),
                      )
                    }}
                    className="flex-1 rounded-full bg-coral/90 py-2 text-[12px] font-bold text-bg disabled:opacity-50"
                  >
                    {confirmKind === 'delete' ? 'Delete' : 'Report'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-line/50">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(actionFor)
                    closeSheet()
                  }}
                  className="w-full py-3 text-left text-[14px] font-medium transition-colors active:text-teal"
                >
                  Reply
                </button>
                {actionFor.senderId === userId ? (
                  <button
                    type="button"
                    onClick={() => setConfirmKind('delete')}
                    className="w-full py-3 text-left text-[14px] font-medium text-coral"
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmKind('report')}
                    className="w-full py-3 text-left text-[14px] font-medium text-coral"
                  >
                    Report
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeSheet}
                  className="w-full py-3 text-left text-[14px] font-medium text-muted"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span aria-hidden className="h-px flex-1 bg-line/60" />
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {dayLabel(iso)}
      </span>
      <span aria-hidden className="h-px flex-1 bg-line/60" />
    </div>
  )
}
