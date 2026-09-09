import { useEffect, useState } from 'react'
import { fetchGroupDiscoverable, setGroupDiscoverable } from '../lib/api'

export function GroupDiscoverySettings({ groupId }: { groupId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let stale = false
    setEnabled(null)
    setConfirm(false)
    setError(null)
    fetchGroupDiscoverable(groupId).then((v) => !stale && setEnabled(v)).catch(() => !stale && setError('Could not load group discovery settings.'))
    return () => { stale = true }
  }, [groupId, retry])
  async function change() {
    if (busy || enabled === null) return
    setBusy(true); setError(null)
    try { await setGroupDiscoverable(groupId, !enabled); setEnabled(!enabled); setConfirm(false) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update group discovery.') }
    finally { setBusy(false) }
  }
  return <section className="mp-rise mt-5">
    <h2 className="text-[15px] font-semibold">Who can find and join this group?</h2>
    <p className="mt-2 text-[13px] leading-snug text-muted">{enabled === null ? 'Checking who can find this group…' : enabled ? 'Searchable: anyone with an account can join. Your group name and member count appear in search.' : 'Invite only: you choose who to add. This group does not appear in search.'}</p>
    {error && <div role="alert" className="mt-2 text-[13px] text-coral">{error}{enabled === null && <button type="button" onClick={() => { setError(null); setRetry((n) => n + 1) }} className="min-h-11 px-3 underline">Try again</button>}</div>}
    {confirm ? <div className="mp-rise mt-3 rounded-2xl border border-gold/30 p-4"><p className="text-[13px]">Make this group searchable? New members can read group chat and watchlists. Reveals still require their own locked scorecard.</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy} onClick={() => setConfirm(false)} className="min-h-11 flex-1 text-[13px] text-muted">Keep invite only</button><button type="button" disabled={busy} onClick={() => void change()} className="min-h-11 flex-1 text-[13px] font-semibold text-teal">{busy ? 'Saving…' : 'Make searchable'}</button></div></div> : <button type="button" disabled={busy || enabled === null} onClick={() => enabled ? void change() : setConfirm(true)} className="mt-3 min-h-11 w-full rounded-full border border-line px-4 text-[13px] font-semibold text-teal disabled:opacity-50">{busy ? 'Saving…' : enabled === null ? 'Loading…' : enabled ? 'Make invite only' : 'Make group searchable'}</button>}
  </section>
}
