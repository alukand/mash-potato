import { useEffect, useId, useRef, useState } from 'react'
import { browseOpenGroups, joinOpenGroup, requestToJoin, withdrawJoinRequest } from '../lib/api'
import type { OpenGroup } from '../lib/api'
import { TASTE_MODES } from '../lib/rubricCatalog'
import { CtaButton, GroupMark, fieldClass } from './ui'

export function OpenGroups({ userId, suggestedOnly = false, joinedIds = [], onJoined, onSignIn, onChoose }: {
  userId: string | null
  suggestedOnly?: boolean
  joinedIds?: string[]
  onJoined?: (id: string) => Promise<void>
  onSignIn?: () => void
  onChoose?: (group: OpenGroup) => Promise<void>
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [groups, setGroups] = useState<OpenGroup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [joined, setJoined] = useState<string[]>([])
  // Approval groups: which card has its question open, and what changed here
  // since the list loaded (asked / withdrew), so the buttons agree at once.
  const [asking, setAsking] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [asked, setAsked] = useState<string[]>([])
  const [withdrawn, setWithdrawn] = useState<string[]>([])
  const inFlight = useRef(false)
  useEffect(() => {
    let stale = false
    setGroups(null)
    setError(null)
    const timer = setTimeout(() => {
      browseOpenGroups(query, suggestedOnly).then((g) => !stale && setGroups(g)).catch((err) => !stale && setError(err.message))
    }, query ? 300 : 0)
    return () => { stale = true; clearTimeout(timer) }
  }, [query, suggestedOnly, retry])

  async function act(g: OpenGroup, work: () => Promise<void>) {
    if (!userId) { onSignIn?.(); return }
    if (inFlight.current) return
    inFlight.current = true
    setBusy(g.id)
    setError(null)
    try { await work() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not reach this group. Try again.') }
    finally { inFlight.current = false; setBusy(null) }
  }

  const join = (g: OpenGroup) => act(g, async () => {
    if (onChoose) await onChoose(g)
    else {
      await joinOpenGroup(g.id)
      await onJoined?.(g.id)
      setJoined((ids) => [...ids, g.id])
    }
  })
  const ask = (g: OpenGroup, text: string) => act(g, async () => {
    await requestToJoin(g.id, text)
    setAsked((ids) => [...ids, g.id])
    setWithdrawn((ids) => ids.filter((id) => id !== g.id))
    setAsking(null)
    setAnswer('')
  })
  const withdraw = (g: OpenGroup) => act(g, async () => {
    await withdrawJoinRequest(g.id)
    setWithdrawn((ids) => [...ids, g.id])
    setAsked((ids) => ids.filter((id) => id !== g.id))
  })

  return <div>
    {!suggestedOnly && <label htmlFor={searchId} className="mb-4 block text-[13px] font-semibold">Find a group<input id={searchId} type="search" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} placeholder="Search open groups by name" className={`mt-2 ${fieldClass}`} /></label>}
    {error && <div role="alert" className="mb-3 text-[13px] text-coral">{error}<button type="button" onClick={() => setRetry((n) => n + 1)} className="min-h-11 px-3 underline">Try again</button></div>}
    {groups === null ? !error && <p role="status" className="text-[13px] text-muted">Finding groups…</p> : groups.length === 0 ? <p className="text-[14px] text-muted">{suggestedOnly ? 'The suggested group is not available yet. You can explore now and find a group on Profile later.' : 'No open groups match. Try another name, or ask a group owner to make their group searchable.'}</p> : <div className="space-y-4">{groups.map((g) => {
      const isJoined = joinedIds.includes(g.id) || joined.includes(g.id) || g.myStatus === 'member'
      const isPending = !isJoined && (asked.includes(g.id) || (g.myStatus === 'pending' && !withdrawn.includes(g.id)))
      const approval = g.joinPolicy === 'approval' && !onChoose
      return <article key={g.id} className="mp-card rounded-[22px] p-5">
        <div className="flex items-center gap-3"><GroupMark groupId={g.id} name={g.name} size={40} /><div className="min-w-0"><h3 className="break-words font-display text-[22px] font-semibold">{g.name}</h3><p className="mt-1 text-[12px] text-muted">{g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}, {TASTE_MODES[g.tasteMode].plural}</p></div></div>
        <p className="mt-3 text-[13px] leading-snug text-muted">{g.tasteMode === 'buff' ? 'Bring your rubric, score together, and see where your opinions meet.' : 'Three simple categories for scoring together.'}</p>
        <p className="mt-2 text-[12px] leading-snug text-muted">Joining gives you access to group chat and watchlists. Scores stay hidden until the Reveal and you’ve locked your own card.</p>
        {approval && !isJoined && <p className="mt-2 text-[12px] font-semibold leading-snug text-gold">The owner approves each new member.</p>}

        {approval && asking === g.id && !isPending && !isJoined ? <form className="mp-rise mt-4" onSubmit={(e) => { e.preventDefault(); void ask(g, answer) }}>
          <label htmlFor={`answer-${g.id}`} className="block text-[13px] font-semibold leading-snug">{g.joinQuestion}</label>
          <textarea id={`answer-${g.id}`} value={answer} maxLength={500} rows={3} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer, for the owner" className={`mt-2 resize-none ${fieldClass}`} />
          <p className="mt-1 text-[11px] text-muted">Only the owner reads it.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { setAsking(null); setAnswer('') }} className="min-h-11 flex-1 rounded-full border border-line text-[13px] font-semibold text-muted">Cancel</button>
            <CtaButton tone="teal" type="submit" disabled={busy !== null || answer.trim().length === 0} className="min-h-11 flex-1 px-4 text-[14px]">{busy === g.id ? 'Sending…' : 'Send request'}</CtaButton>
          </div>
        </form> : approval && isPending ? <div className="mt-4">
          <div className="grid min-h-11 place-items-center rounded-full border border-teal/40 bg-teal/10 px-4 text-[14px] font-semibold text-teal">Requested: the owner will decide</div>
          <button type="button" disabled={busy !== null} onClick={() => void withdraw(g)} className="mt-1 min-h-11 w-full text-[12px] font-semibold text-muted hover:text-text disabled:opacity-60">{busy === g.id ? 'Withdrawing…' : 'Withdraw my request'}</button>
        </div> : <CtaButton tone="teal" disabled={busy !== null || (isJoined && !onChoose)} onClick={() => {
          if (!userId) { onSignIn?.(); return }
          if (!approval || isJoined) { void join(g); return }
          if (g.joinQuestion) { setAsking(g.id); setAnswer('') } else void ask(g, '')
        }} className="mt-4 min-h-11 w-full px-4 text-[14px]">{busy === g.id ? (approval ? 'Sending…' : 'Joining…') : !userId ? (approval ? 'Sign in to ask to join' : 'Sign in to join') : isJoined ? (onChoose ? 'Continue with this group' : 'Joined ✓') : approval ? 'Ask to join' : `Join ${g.name}`}</CtaButton>}
      </article>
    })}</div>}
  </div>
}
