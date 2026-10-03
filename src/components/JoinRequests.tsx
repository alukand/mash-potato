import { useCallback, useEffect, useState } from 'react'
import { blockUser, decideJoinRequest, fetchPendingJoinRequests } from '../lib/api'
import type { JoinRequest } from '../lib/api'
import { colorForUser } from '../lib/palette'
import { timeAgo } from '../lib/timeAgo'
import { Avatar } from './avatars'

/** "asked just now", "asked 3h ago", "asked on Oct 2". */
function askedWhen(iso: string): string {
  const ago = timeAgo(iso)
  if (ago === 'now') return 'asked just now'
  return /^\d+[mhd]$/.test(ago) ? `asked ${ago} ago` : `asked on ${ago}`
}

/**
 * The owner's queue for a group that reviews who joins (20261002120000).
 * Renders nothing while nobody is waiting, so it costs a quiet group nothing.
 * Each request shows the question as it was asked beside the answer: reading
 * that is the reason to ask one at all.
 */
export function JoinRequests({
  groupId,
  userId,
  onApproved,
}: {
  groupId: string
  userId: string
  /** Someone got in: the member list should refetch. */
  onApproved: () => void
}) {
  const [requests, setRequests] = useState<JoinRequest[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchPendingJoinRequests(groupId)
      .then(setRequests)
      .catch(() => setRequests([]))
  }, [groupId])

  useEffect(() => {
    setRequests(null)
    load()
  }, [load])

  async function decide(request: JoinRequest, approve: boolean, block = false) {
    if (busy) return
    setBusy(request.id)
    setError(null)
    try {
      await decideJoinRequest(request.id, approve)
      // Blocking also stops them asking again (request_to_join checks it).
      if (block) await blockUser(userId, request.userId)
      setRequests((prev) => prev?.filter((r) => r.id !== request.id) ?? prev)
      if (approve) onApproved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer that request')
      load()
    } finally {
      setBusy(null)
    }
  }

  if (!requests || requests.length === 0) return null

  return (
    <section className="mp-rise order-[-2] mb-6">
      <div className="mb-2.5 flex items-baseline justify-between px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Asking to join
        </p>
        <span className="font-mono text-[10px] text-muted">{requests.length} waiting</span>
      </div>
      {error && (
        <p role="alert" className="mb-2 px-1 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}
      <div className="space-y-3">
        {requests.map((r) => (
          <article key={r.id} className="mp-card rounded-[22px] p-4">
            <div className="flex items-center gap-3">
              <Avatar
                avatarKey={r.avatarKey}
                displayName={r.displayName}
                color={colorForUser(r.userId)}
                size={36}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{r.displayName}</p>
                <p className="font-mono text-[10px] text-muted">{askedWhen(r.createdAt)}</p>
              </div>
            </div>
            {r.question && (
              <div className="mt-3 rounded-2xl bg-surface-2 px-4 py-3">
                <p className="text-[12px] leading-snug text-muted">{r.question}</p>
                <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-snug">
                  {r.answer}
                </p>
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide(r, true)}
                className="min-h-11 flex-1 rounded-full bg-teal px-4 text-[13px] font-semibold text-bg transition-transform active:scale-[0.98] disabled:opacity-60"
              >
                {busy === r.id ? 'Saving…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void decide(r, false)}
                className="min-h-11 flex-1 rounded-full border border-line px-4 text-[13px] font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
              >
                Decline
              </button>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void decide(r, false, true)}
              className="mt-1 min-h-11 w-full text-[12px] font-semibold text-muted transition-colors hover:text-coral disabled:opacity-60"
            >
              Decline and block {r.displayName}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}
