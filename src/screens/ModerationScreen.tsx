import { useCallback, useEffect, useState } from 'react'
import {
  fetchAmModerator,
  fetchModerationLog,
  fetchModerationQueue,
  resolveReport,
  setUserBanned,
} from '../lib/api'
import type { ModerationAction, ModerationItem } from '../lib/api'

/**
 * The report queue.
 *
 * App Store guideline 1.2 asks you to attest that reported content is acted on
 * within 24 hours. Reporting, blocking and the wordlist have shipped since
 * 2026-07-14, but nothing could ACT on a report — triage meant hand-writing
 * UPDATEs, which is not a promise anyone can keep on a Sunday.
 *
 * The gate is NOT this screen. Every RPC behind it checks `is_moderator()`
 * server-side; hiding the door is a courtesy, and typing /moderation gets a
 * non-moderator nothing but a polite refusal.
 */

const HOUR = 60 * 60 * 1000
const SLA_HOURS = 24

/** How long this has been waiting, and whether the 24-hour clock has run out. */
function age(firstReported: string): { label: string; overdue: boolean } {
  const ms = Date.now() - new Date(firstReported).getTime()
  const hours = Math.floor(ms / HOUR)
  if (hours < 1) return { label: 'just now', overdue: false }
  if (hours < SLA_HOURS) return { label: `${hours}h ago`, overdue: false }
  const days = Math.floor(hours / SLA_HOURS)
  return { label: days >= 1 ? `${days}d ago` : `${hours}h ago`, overdue: true }
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'muted' | 'coral' | 'gold' }) {
  const tint =
    tone === 'coral'
      ? 'border-coral/40 bg-coral/10 text-coral'
      : tone === 'gold'
        ? 'border-gold/40 bg-gold/10 text-gold'
        : 'border-line/60 bg-surface-2/60 text-muted'
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] ${tint}`}>
      {children}
    </span>
  )
}

/** One piece of reported content, with everything needed to judge it. */
function QueueCard({
  item,
  busy,
  onResolve,
}: {
  item: ModerationItem
  busy: boolean
  onResolve: (action: 'dismiss' | 'remove' | 'ban', note: string) => void
}) {
  const [note, setNote] = useState('')
  // Banning is the one action that reaches past this content to the person,
  // so it asks twice. The other two are reversible enough not to.
  const [confirmingBan, setConfirmingBan] = useState(false)
  const { label, overdue } = age(item.firstReported)

  return (
    <li className="rounded-2xl border border-line/60 bg-surface/60 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Pill tone="muted">{item.kind === 'comment' ? 'Comment' : 'Message'}</Pill>
        <Pill tone={item.reportCount > 2 ? 'gold' : 'muted'}>
          {item.reportCount} {item.reportCount === 1 ? 'report' : 'reports'}
        </Pill>
        {item.alreadyHidden && <Pill tone="gold">Auto-hidden</Pill>}
        {item.authorBanned && <Pill tone="coral">Author banned</Pill>}
        <span className={`ml-auto font-mono text-[10px] ${overdue ? 'text-coral' : 'text-muted'}`}>
          {overdue ? `overdue · ${label}` : label}
        </span>
      </div>

      <p className="mb-1 text-[12px] text-muted">
        by <span className="text-text">{item.authorName}</span>
      </p>

      {/* The reported words, verbatim and unstyled — a judgement call needs the
          thing itself, not a summary of it. */}
      <blockquote className="mb-3 whitespace-pre-wrap break-words rounded-xl border border-line/40 bg-surface-2/40 px-3 py-2.5 text-[14px] leading-snug">
        {item.body || <span className="text-muted">(empty)</span>}
      </blockquote>

      {item.reasons.length > 0 && (
        <p className="mb-3 text-[12px] text-muted">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em]">Reported for</span>{' '}
          {item.reasons.join(' · ')}
        </p>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        placeholder="Note for the record (optional)"
        className="mb-2.5 w-full rounded-xl border border-line/60 bg-surface-2/40 px-3 py-2 text-[13px] outline-none placeholder:text-muted focus:border-teal/60"
      />

      {confirmingBan ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="w-full text-[12px] text-coral">
            Ban {item.authorName}? This removes the content and stops them posting anywhere.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve('ban', note)}
            className="rounded-full bg-coral px-4 py-2 text-[13px] font-semibold text-bg disabled:opacity-50"
          >
            Yes, ban
          </button>
          <button
            type="button"
            onClick={() => setConfirmingBan(false)}
            className="rounded-full border border-line/60 px-4 py-2 text-[13px]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve('dismiss', note)}
            className="rounded-full border border-line/60 px-4 py-2 text-[13px] transition-colors hover:border-teal/60 hover:text-teal disabled:opacity-50"
          >
            {/* Three reports auto-hide a comment, so dismissing has to put it
                back — otherwise brigading is a permanent mute. */}
            {item.alreadyHidden ? 'Dismiss & restore' : 'Dismiss'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve('remove', note)}
            className="rounded-full border border-gold/50 px-4 py-2 text-[13px] text-gold disabled:opacity-50"
          >
            Remove
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingBan(true)}
            className="rounded-full border border-coral/50 px-4 py-2 text-[13px] text-coral disabled:opacity-50"
          >
            Ban author
          </button>
        </div>
      )}
    </li>
  )
}

function LogRow({ entry, onUnban }: { entry: ModerationAction; onUnban: () => void }) {
  const verb =
    entry.action === 'dismiss'
      ? 'dismissed a report on'
      : entry.action === 'remove'
        ? 'removed a'
        : entry.action === 'ban'
          ? 'banned'
          : 'unbanned'
  const object =
    entry.action === 'dismiss'
      ? `${entry.targetKind} by ${entry.targetName ?? 'someone'}`
      : entry.action === 'remove'
        ? `${entry.targetKind} by ${entry.targetName ?? 'someone'}`
        : (entry.targetName ?? 'someone')

  return (
    <li className="border-b border-line/40 py-2.5 last:border-0">
      <p className="text-[13px] leading-snug">
        <span className="text-muted">{entry.moderatorName}</span> {verb}{' '}
        <span className="text-text">{object}</span>
      </p>
      {entry.note && <p className="mt-0.5 text-[12px] italic text-muted">“{entry.note}”</p>}
      <div className="mt-1 flex items-center gap-3">
        <span className="font-mono text-[10px] text-muted">
          {new Date(entry.createdAt).toLocaleString()}
        </span>
        {/* A ban with no visible way back is a ban nobody reviews. */}
        {entry.action === 'ban' && entry.targetKind === 'user' && (
          <button type="button" onClick={onUnban} className="text-[12px] text-teal">
            Lift ban
          </button>
        )}
      </div>
    </li>
  )
}

export default function ModerationScreen({ onBack }: { onBack: () => void }) {
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined)
  const [queue, setQueue] = useState<ModerationItem[] | undefined>(undefined)
  const [log, setLog] = useState<ModerationAction[]>([])
  const [pane, setPane] = useState<'queue' | 'log'>('queue')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const mod = await fetchAmModerator()
      setAllowed(mod)
      if (!mod) return
      const [q, l] = await Promise.all([fetchModerationQueue(), fetchModerationLog()])
      setQueue(q)
      setLog(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the queue.')
      setAllowed(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(item: ModerationItem, action: 'dismiss' | 'remove' | 'ban', note: string) {
    setBusyId(item.contentId)
    setError(null)
    try {
      await resolveReport(item.kind, item.contentId, action, note)
      // Refetch rather than splice: resolving closes every report row for that
      // content, and a ban changes rows this one never touched.
      const [q, l] = await Promise.all([fetchModerationQueue(), fetchModerationLog()])
      setQueue(q)
      setLog(l)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.')
    } finally {
      setBusyId(null)
    }
  }

  async function unban(userId: string) {
    setError(null)
    try {
      await setUserBanned(userId, false, 'lifted from the log')
      setLog(await fetchModerationLog())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.')
    }
  }

  const overdue = (queue ?? []).filter((i) => age(i.firstReported).overdue).length

  return (
    <div className="px-5 pt-safe pb-10">
      <header className="mp-rise mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/60 text-text transition-colors hover:text-teal"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">House rules</p>
          <h1 className="truncate font-display text-[22px] font-semibold leading-tight">Reports</h1>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-2xl border border-coral/30 bg-coral/5 px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      {allowed === undefined && <p className="px-1 font-mono text-[11px] text-muted">checking…</p>}

      {allowed === false && (
        <p className="rounded-2xl border border-line/60 bg-surface/60 px-4 py-6 text-center text-[14px] text-muted">
          This queue is for moderators.
        </p>
      )}

      {allowed && (
        <>
          <div className="mb-4 flex gap-2">
            {(['queue', 'log'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPane(p)}
                className={`rounded-full px-4 py-1.5 text-[13px] transition-colors ${
                  pane === p
                    ? 'bg-teal text-bg font-semibold'
                    : 'border border-line/60 text-muted'
                }`}
              >
                {p === 'queue' ? `Open${queue?.length ? ` (${queue.length})` : ''}` : 'Recent actions'}
              </button>
            ))}
          </div>

          {pane === 'queue' && (
            <>
              {/* The SLA is the whole reason this screen exists, so it is stated
                  rather than left to be inferred from timestamps. */}
              {overdue > 0 && (
                <p className="mb-3 rounded-2xl border border-coral/30 bg-coral/5 px-4 py-2.5 text-[13px] text-coral">
                  {overdue} {overdue === 1 ? 'report has' : 'reports have'} been waiting more than 24
                  hours.
                </p>
              )}
              {queue === undefined && (
                <p className="px-1 font-mono text-[11px] text-muted">reading the queue…</p>
              )}
              {queue?.length === 0 && (
                <p className="rounded-2xl border border-line/60 bg-surface/60 px-4 py-6 text-center text-[14px] text-muted">
                  Nothing waiting. Reported comments and messages land here.
                </p>
              )}
              <ul className="space-y-3">
                {(queue ?? []).map((item) => (
                  <QueueCard
                    key={`${item.kind}:${item.contentId}`}
                    item={item}
                    busy={busyId === item.contentId}
                    onResolve={(action, note) => void act(item, action, note)}
                  />
                ))}
              </ul>
            </>
          )}

          {pane === 'log' && (
            <>
              {log.length === 0 ? (
                <p className="rounded-2xl border border-line/60 bg-surface/60 px-4 py-6 text-center text-[14px] text-muted">
                  No actions yet.
                </p>
              ) : (
                <ul className="rounded-2xl border border-line/60 bg-surface/60 px-4 py-1">
                  {log.map((entry, i) => (
                    <LogRow
                      key={`${entry.createdAt}:${i}`}
                      entry={entry}
                      onUnban={() => void unban(entry.targetId)}
                    />
                  ))}
                </ul>
              )}
              <p className="mt-3 px-1 text-[12px] text-muted">
                Every action is recorded and cannot be edited or deleted, including by the moderator
                who took it.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}
