import { useEffect, useState } from 'react'
import { fetchJoinSettings, setGroupDiscoverable, setJoinPolicy } from '../lib/api'
import type { JoinSettings } from '../lib/api'
import { fieldClass } from './ui'

// Who can find this group, and once found, how they get in: at once, or by
// asking (with an optional question the owner reads). 20261002120000.
export function GroupDiscoverySettings({ groupId }: { groupId: string }) {
  const [settings, setSettings] = useState<JoinSettings | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [question, setQuestion] = useState('')
  const [savedNote, setSavedNote] = useState<string | null>(null)
  useEffect(() => {
    let stale = false
    setSettings(null)
    setConfirm(false)
    setError(null)
    fetchJoinSettings(groupId)
      .then((s) => {
        if (stale) return
        setSettings(s)
        setQuestion(s.joinQuestion ?? '')
      })
      .catch(() => !stale && setError('Could not load group discovery settings.'))
    return () => { stale = true }
  }, [groupId, retry])

  const enabled = settings?.searchable ?? null
  async function change() {
    if (busy || !settings) return
    setBusy(true); setError(null)
    try { await setGroupDiscoverable(groupId, !settings.searchable); setSettings({ ...settings, searchable: !settings.searchable }); setConfirm(false) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update group discovery.') }
    finally { setBusy(false) }
  }

  async function savePolicy(policy: 'open' | 'approval', q: string) {
    if (busy || !settings) return
    setBusy(true); setError(null); setSavedNote(null)
    try {
      await setJoinPolicy(groupId, policy, policy === 'approval' ? q : null)
      const kept = policy === 'approval' ? q.trim() || null : null
      setSettings({ ...settings, joinPolicy: policy, joinQuestion: kept })
      setQuestion(kept ?? '')
      setSavedNote(policy === 'open' ? 'Anyone can join now.' : kept ? 'Saved. People who ask will answer it.' : 'Saved. You approve each request.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update who can join.') }
    finally { setBusy(false) }
  }

  const summary = enabled === null
    ? 'Checking who can find this group…'
    : !enabled
      ? 'Invite only: you choose who to add. This group does not appear in search.'
      : settings?.joinPolicy === 'approval'
        ? 'Searchable: people can find this group and ask to join. You approve each one.'
        : 'Searchable: anyone with an account can join. Your group name and member count appear in search.'
  const questionChanged = (settings?.joinQuestion ?? '') !== question.trim()

  return <section className="mp-rise mt-5">
    <h2 className="text-[15px] font-semibold">Who can find and join this group?</h2>
    <p className="mt-2 text-[13px] leading-snug text-muted">{summary}</p>
    {error && <div role="alert" className="mt-2 text-[13px] text-coral">{error}{enabled === null && <button type="button" onClick={() => { setError(null); setRetry((n) => n + 1) }} className="min-h-11 px-3 underline">Try again</button>}</div>}
    {confirm ? <div className="mp-rise mt-3 rounded-2xl border border-gold/30 p-4"><p className="text-[13px]">Make this group searchable? New members can read group chat and watchlists. Reveals still require their own locked scorecard.</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => setConfirm(false)} className="min-h-11 flex-1 text-[13px] text-muted">Keep invite only</button><button type="button" disabled={busy} onClick={() => void change()} className="min-h-11 flex-1 text-[13px] font-semibold text-teal">{busy ? 'Saving…' : 'Make searchable'}</button></div></div> : <button type="button" disabled={busy || enabled === null} onClick={() => enabled ? void change() : setConfirm(true)} className="mt-3 min-h-11 w-full rounded-full border border-line px-4 text-[13px] font-semibold text-teal disabled:opacity-50">{busy ? 'Saving…' : enabled === null ? 'Loading…' : enabled ? 'Make invite only' : 'Make group searchable'}</button>}

    {enabled && settings && <div className="mp-rise mt-4 rounded-2xl border border-line/70 p-4">
      <p className="text-[13px] font-semibold">When someone finds it</p>
      <div role="radiogroup" aria-label="How people join" className="mt-2.5 flex gap-2">
        {(['open', 'approval'] as const).map((policy) => {
          const on = settings.joinPolicy === policy
          return <button key={policy} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => !on && void savePolicy(policy, question)} className={`min-h-11 flex-1 rounded-full border px-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${on ? 'border-teal/50 bg-teal/10 text-teal' : 'border-line text-muted hover:text-text'}`}>{policy === 'open' ? 'Anyone can join' : 'I approve each one'}</button>
        })}
      </div>
      {settings.joinPolicy === 'approval' && <div className="mt-4">
        <label className="block text-[13px] font-semibold" htmlFor={`join-question-${groupId}`}>A question for people who ask <span className="font-normal text-muted">(optional)</span></label>
        <p className="mt-1 text-[12px] leading-snug text-muted">Everyone who asks answers it, and you read the answer before you decide. Anyone browsing can see the question.</p>
        <input id={`join-question-${groupId}`} type="text" maxLength={200} value={question} onChange={(e) => { setQuestion(e.target.value); setSavedNote(null) }} placeholder="e.g. What’s a film you would defend to anyone?" className={`mt-2 ${fieldClass}`} />
        <button type="button" disabled={busy || !questionChanged} onClick={() => void savePolicy('approval', question)} className="mt-2 min-h-11 w-full rounded-full border border-teal/40 px-4 text-[13px] font-semibold text-teal disabled:opacity-50">{busy ? 'Saving…' : question.trim() ? 'Save the question' : 'Remove the question'}</button>
      </div>}
      {savedNote && <p role="status" className="mt-2 text-center text-[12px] text-teal">{savedNote}</p>}
      {settings.pendingCount > 0 && <p className="mt-2 text-[12px] text-muted">{settings.pendingCount} {settings.pendingCount === 1 ? 'person is' : 'people are'} waiting: their requests are at the top of the group.</p>}
    </div>}
  </section>
}
