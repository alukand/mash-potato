import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acceptDiscussionTerms,
  blockUser,
  clearReaction,
  deleteComment,
  ensureTitleRow,
  fetchDiscussion,
  fetchDiscussionGate,
  fetchGroupCred,
  fetchTitleRowId,
  onDiscussionChange,
  postComment,
  reportComment,
  setReaction,
} from '../lib/api'
import type {
  DiscussionComment,
  DiscussionGate,
  GroupInfo,
  NewTitle,
  ReactionKind,
} from '../lib/api'
import { colorForUser } from '../lib/palette'
import { Avatar } from './avatars'
import { credFlair } from '../lib/cred'
import { CtaButton, GroupMark, fieldClassSm } from './ui'

interface DiscussionSectionProps {
  /** The title as shown (used to create the titles row on first post). */
  title: NewTitle
  groups: GroupInfo[]
  userId: string
  /** Open on this group's thread (deep link from the reveal panel). */
  initialGroupId?: string | null
  /** Composer placeholder seed (e.g. the reveal's clash headline). */
  composerSeed?: string | null
  /** Bump when something outside changed the gate (e.g. a rating saved). */
  refreshKey?: number
}

const REACTIONS: { kind: ReactionKind; glyph: string; label: string }[] = [
  { kind: 'like', glyph: '\u{1F44D}', label: 'Like' },
  { kind: 'funny', glyph: '\u{1F602}', label: 'Funny' },
  { kind: 'fire', glyph: '\u{1F525}', label: 'Hot take' },
]

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Per-title discussion: private group threads (sealed with the blind rule)
// and the public takes (posting gated on having rated). Reactions are
// positive-only; the reward loop is peer-given and group-scoped (DESIGN.md
// "Reward loop law").
export function DiscussionSection({
  title,
  groups,
  userId,
  initialGroupId = null,
  composerSeed = null,
  refreshKey = 0,
}: DiscussionSectionProps) {
  // null scope = Everyone (the public takes)
  const [scope, setScope] = useState<string | null>(
    initialGroupId ?? (groups.length === 1 ? groups[0].id : null),
  )
  const [titleRowId, setTitleRowId] = useState<string | null | undefined>(undefined)
  const [comments, setComments] = useState<DiscussionComment[] | undefined>(undefined)
  const [gate, setGate] = useState<DiscussionGate | null>(null)
  const [cred, setCred] = useState<Map<string, number>>(new Map())
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [busy, setBusy] = useState(false)
  /** Comment id whose reactions are mid-flight (disables that row's chips). */
  const [reactBusyId, setReactBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [termsOpen, setTermsOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<
    { kind: 'report' | 'block' | 'delete'; comment: DiscussionComment } | null
  >(null)
  const sectionRef = useRef<HTMLElement | null>(null)

  // Resolve the titles row (it exists once anyone rated, saved, or discussed).
  useEffect(() => {
    let cancelled = false
    setTitleRowId(undefined)
    if (title.tmdbId === null) {
      setTitleRowId(null)
      return
    }
    fetchTitleRowId(title.tmdbId, title.mediaType)
      .then((id) => !cancelled && setTitleRowId(id))
      .catch(() => !cancelled && setTitleRowId(null))
    return () => {
      cancelled = true
    }
  }, [title.tmdbId, title.mediaType, refreshKey])

  const load = useCallback(async () => {
    if (titleRowId === undefined) return
    if (titleRowId === null) {
      // nobody has touched this title yet: an empty, open thread
      setComments([])
      setGate({ openForMe: true, rated: false, termsAccepted: true })
      setCred(new Map())
      return
    }
    try {
      const [list, g, credMap] = await Promise.all([
        fetchDiscussion(titleRowId, scope, userId),
        fetchDiscussionGate(titleRowId, scope),
        scope ? fetchGroupCred(scope).catch(() => new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
      ])
      setComments(list)
      setGate(g)
      setCred(credMap)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the discussion')
    }
  }, [titleRowId, scope, userId])

  useEffect(() => {
    setComments(undefined)
    setError(null)
    setReplyTo(null)
    setMenuFor(null)
    setConfirmAction(null)
    void load()
  }, [load])

  // Live thread while it's on screen (RLS trims events per subscriber).
  useEffect(() => {
    if (!titleRowId) return
    return onDiscussionChange(titleRowId, () => void load())
  }, [titleRowId, load])

  // Deep-linked from the reveal: bring the debrief into view once the thread
  // has actually loaded (the page above it lays out asynchronously).
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (!initialGroupId || scrolledRef.current || comments === undefined) return
    scrolledRef.current = true
    requestAnimationFrame(() =>
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }, [initialGroupId, comments])

  async function submit(parentId: string | null, text: string) {
    const trimmed = text.trim()
    if (trimmed.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const rowId = titleRowId ?? (await ensureTitleRow(title))
      if (titleRowId === null) setTitleRowId(rowId)
      await postComment(rowId, scope, parentId, trimmed)
      if (parentId) {
        setReplyBody('')
        setReplyTo(null)
      } else {
        setBody('')
      }
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not post that'
      if (message.includes('accept the community terms')) {
        setTermsOpen(true)
      } else {
        setError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  async function agreeToTerms() {
    setBusy(true)
    try {
      await acceptDiscussionTerms()
      setTermsOpen(false)
      // re-send whichever composer was in flight
      await submit(replyTo, replyTo ? replyBody : body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that')
    } finally {
      setBusy(false)
    }
  }

  // Guarded: this awaits a write AND a full reload, so without a busy flag a
  // tap looked like nothing happened and a second tap silently undid it.
  async function toggleReaction(comment: DiscussionComment, kind: ReactionKind) {
    if (reactBusyId) return
    setError(null)
    setReactBusyId(comment.id)
    try {
      if (comment.myReaction === kind) await clearReaction(comment.id, userId)
      else await setReaction(comment.id, userId, kind)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not react')
    } finally {
      setReactBusyId(null)
    }
  }

  async function runConfirmedAction() {
    if (!confirmAction) return
    setBusy(true)
    setError(null)
    try {
      if (confirmAction.kind === 'report') {
        await reportComment(confirmAction.comment.id, userId, null)
      } else if (confirmAction.kind === 'block') {
        await blockUser(userId, confirmAction.comment.authorId)
      } else {
        await deleteComment(confirmAction.comment.id)
      }
      setConfirmAction(null)
      setMenuFor(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not do that')
    } finally {
      setBusy(false)
    }
  }

  const topLevel = (comments ?? []).filter((c) => c.parentId === null)
  const repliesFor = (id: string) => (comments ?? []).filter((c) => c.parentId === id)
  const reactionTotal = (c: DiscussionComment) =>
    c.reactions.like + c.reactions.funny + c.reactions.fire
  // Top take: the most-reacted top-level comment, two reactions minimum.
  // Ephemeral by design: it recomputes live and never accumulates anywhere.
  const topTakeId = topLevel.reduce<{ id: string | null; n: number }>(
    (best, c) => {
      const n = reactionTotal(c)
      return n >= 2 && n > best.n ? { id: c.id, n } : best
    },
    { id: null, n: 1 },
  ).id

  const sealed = scope !== null && gate !== null && !gate.openForMe
  const publicUnrated = scope === null && gate !== null && !gate.rated
  const composerPlaceholder =
    scope === null
      ? 'Your take, for everyone who rated it…'
      : (composerSeed ?? 'Take a victory lap or defend your score…')

  function renderComment(c: DiscussionComment, isReply: boolean) {
    const flair = scope && !isReply ? credFlair(cred.get(c.authorId) ?? 0) : scope ? credFlair(cred.get(c.authorId) ?? 0) : null
    return (
      <div key={c.id} className={isReply ? 'mt-3 pl-10' : 'border-t border-line/40 py-3.5 first:border-t-0'}>
        <div className="flex items-start gap-2.5">
          <Avatar
            avatarKey={c.authorAvatarKey}
            displayName={c.authorName}
            color={colorForUser(c.authorId)}
            size={32}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[13px] font-semibold">{c.authorName}</span>
              {flair && (
                <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-gold">
                  {flair}
                </span>
              )}
              {c.id === topTakeId && (
                <span className="rounded-full border border-teal/30 bg-teal/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-teal">
                  Top take
                </span>
              )}
              <span className="font-mono text-[10px] text-muted">{timeAgo(c.createdAt)}</span>
            </div>
            {c.deleted ? (
              <p className="mt-0.5 text-[13px] leading-snug text-muted">Comment removed.</p>
            ) : (
              <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-snug">{c.body}</p>
            )}

            {!c.deleted && (
              <div className="mt-1.5 flex items-center gap-1.5">
                {REACTIONS.map((r) => {
                  const count = c.reactions[r.kind]
                  const mine = c.myReaction === r.kind
                  return (
                    <button
                      key={r.kind}
                      type="button"
                      onClick={() => void toggleReaction(c, r.kind)}
                      aria-label={r.label}
                      aria-pressed={mine}
                      disabled={reactBusyId === c.id}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[12px] transition-colors disabled:opacity-60 ${
                        mine
                          ? 'border-teal/50 bg-teal/10'
                          : 'border-line bg-surface-2 hover:border-teal/40 active:border-teal/40'
                      }`}
                    >
                      <span aria-hidden>{r.glyph}</span>
                      {count > 0 && (
                        <span className="tabular font-mono text-[10px] text-muted">{count}</span>
                      )}
                    </button>
                  )
                })}
                {!isReply && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTo((prev) => (prev === c.id ? null : c.id))
                      setReplyBody('')
                    }}
                    className="ml-1 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:text-text active:text-text"
                  >
                    Reply
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuFor((prev) => (prev === c.id ? null : c.id))
                    setConfirmAction(null)
                  }}
                  aria-label="More"
                  className="-my-2 ml-auto grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:text-text active:text-text"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </button>
              </div>
            )}

            {menuFor === c.id && !confirmAction && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.authorId === userId ? (
                  <button
                    type="button"
                    onClick={() => setConfirmAction({ kind: 'delete', comment: c })}
                    className="rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-muted transition-colors hover:border-coral/50 hover:text-coral"
                  >
                    Delete
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ kind: 'report', comment: c })}
                      className="rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-muted transition-colors hover:border-coral/50 hover:text-coral"
                    >
                      Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ kind: 'block', comment: c })}
                      className="rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-muted transition-colors hover:border-coral/50 hover:text-coral"
                    >
                      Block {c.authorName}
                    </button>
                  </>
                )}
              </div>
            )}

            {confirmAction && menuFor === c.id && (
              <div className="mt-2 rounded-2xl border border-coral/30 bg-coral/5 px-3.5 py-2.5">
                <p className="text-[13px] leading-snug text-muted">
                  {confirmAction.kind === 'report' &&
                    'Report this comment? It goes to review; three reports hide it.'}
                  {confirmAction.kind === 'block' &&
                    `Block ${c.authorName}? You will not see each other's comments anywhere.`}
                  {confirmAction.kind === 'delete' &&
                    'Delete your comment? The words go; replies stay.'}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmAction(null)}
                    className="flex-1 rounded-full border border-line py-1.5 text-[12px] font-semibold text-muted hover:text-text"
                  >
                    Never mind
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runConfirmedAction()}
                    className="flex-1 rounded-full bg-coral/90 py-1.5 text-[12px] font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
                  >
                    {confirmAction.kind === 'report'
                      ? 'Report'
                      : confirmAction.kind === 'block'
                        ? 'Block'
                        : 'Delete'}
                  </button>
                </div>
              </div>
            )}

            {replyTo === c.id && (
              <div className="mt-2 flex items-start gap-1.5">
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder={`Reply to ${c.authorName}…`}
                  aria-label={`Reply to ${c.authorName}`}
                  className={`flex-1 resize-none ${fieldClassSm}`}
                />
                <button
                  type="button"
                  disabled={busy || replyBody.trim().length === 0}
                  onClick={() => void submit(c.id, replyBody)}
                  className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
                >
                  {busy ? 'Posting…' : 'Reply'}
                </button>
              </div>
            )}

            {repliesFor(c.id).map((r) => renderComment(r, true))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <section ref={sectionRef} className="mt-7 scroll-mt-4">
      <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        Discussion
      </p>

      {/* scope: your groups' private threads, then everyone's takes */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setScope(g.id)}
            className={`flex shrink-0 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-[12px] font-semibold transition-colors ${
              scope === g.id
                ? 'border-teal/50 bg-teal/10 text-teal'
                : 'border-line bg-surface-2 text-muted hover:text-text'
            }`}
          >
            <GroupMark groupId={g.id} name={g.name} size={22} />
            {g.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setScope(null)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
            scope === null
              ? 'border-teal/50 bg-teal/10 text-teal'
              : 'border-line bg-surface-2 text-muted hover:text-text'
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
          </svg>
          Everyone
        </button>
      </div>

      <div className="mp-card rounded-[26px] px-5 py-4">
        {sealed ? (
          <div className="py-4 text-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-muted" aria-hidden>
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <p className="mt-2 text-[13px] leading-snug text-muted">
              Sealed while the round is live. Lock in your scores and the debrief opens.
            </p>
          </div>
        ) : comments === undefined ? (
          <p className="py-4 text-center text-[13px] text-muted">Loading…</p>
        ) : (
          <>
            {topLevel.length === 0 && (
              <p className="py-2 text-[13px] leading-snug text-muted">
                {scope === null
                  ? 'No takes yet. Rate it and drop the first one.'
                  : 'Nothing yet. Say the thing you said out loud during the credits.'}
              </p>
            )}
            {topLevel.map((c) => renderComment(c, false))}

            {publicUnrated ? (
              <p className="mt-3 border-t border-line/40 pt-3 text-[13px] leading-snug text-muted">
                Takes here come from people who rated it. Rate it solo or mash it with a
                group to join in.
              </p>
            ) : (
              <div className="mt-3 flex items-start gap-1.5 border-t border-line/40 pt-3">
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={composerPlaceholder}
                  aria-label="Add a comment"
                  className={`flex-1 resize-none ${fieldClassSm}`}
                />
                <button
                  type="button"
                  disabled={busy || body.trim().length === 0}
                  onClick={() => void submit(null, body)}
                  className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-3.5 py-2 text-[12px] font-semibold text-teal disabled:opacity-50"
                >
                  {busy ? 'Posting…' : 'Post'}
                </button>
              </div>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
            {error}
          </p>
        )}
      </div>

      {/* first-post house rules (guideline 1.2: zero-tolerance agreement) */}
      {termsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm"
          onClick={() => setTermsOpen(false)}
        >
          <div
            role="dialog"
            aria-label="House rules"
            className="mp-card w-full max-w-[480px] rounded-t-[26px] px-6 pb-safe pt-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-[22px] font-semibold leading-tight">House rules</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Talk movies, not people. There is zero tolerance for objectionable content or
              abusive behavior here: hateful, harassing, or explicit comments get removed,
              and accounts that post them get ejected. You can report any comment and block
              any user.
            </p>
            <CtaButton
              tone="teal"
              disabled={busy}
              onClick={() => void agreeToTerms()}
              className="mt-5 w-full py-3 text-[14px]"
            >
              {busy ? 'One sec…' : 'Agree and post'}
            </CtaButton>
            <button
              type="button"
              onClick={() => setTermsOpen(false)}
              className="mt-3 w-full rounded-full border border-line py-2.5 text-[13px] font-semibold text-muted transition-colors hover:text-text"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
