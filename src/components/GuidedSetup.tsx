import { useEffect, useRef, useState } from 'react'
import { browseOpenGroups, completeOnboarding, joinOpenGroup, saveOnboardingRubric } from '../lib/api'
import type { OnboardingProgress, OpenGroup } from '../lib/api'
import { defaultRubricRows } from '../lib/rubricCatalog'
import { RubricRowsEditor } from './RubricRowsEditor'
import { Logo } from './Logo'
import { CtaButton, fieldClass } from './ui'

export function GuidedSetup({ userId, progress, onDone }: { userId: string; progress: OnboardingProgress; onDone: (groupId?: string) => Promise<void> }) {
  const [step, setStep] = useState<1 | 2>(progress.rubricId ? 2 : 1)
  const [displayName, setDisplayName] = useState(progress.displayName === 'Member' ? '' : progress.displayName)
  const [rows, setRows] = useState(progress.rows ?? defaultRubricRows())
  const [customize, setCustomize] = useState(false)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<OpenGroup | null>(null)
  const [joining, setJoining] = useState(false)
  const [joinRetry, setJoinRetry] = useState(0)
  useEffect(() => {
    if (step !== 2) return
    let stale = false
    setJoining(true); setError(null)
    void (async () => {
      try {
        const [group] = await browseOpenGroups('', true)
        if (stale) return
        if (!group) throw new Error('Our starter group is not available right now. Try again, or explore the app below.')
        await joinOpenGroup(group.id)
        if (!stale) setSuggestion(group)
      } catch (err) { if (!stale) setError(err instanceof Error ? err.message : 'Could not join the starter group. Try again.') }
      finally { if (!stale) setJoining(false) }
    })()
    return () => { stale = true }
  }, [step, userId, joinRetry])
  async function save() {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    try { await saveOnboardingRubric(displayName, rows); setStep(2); window.scrollTo(0, 0) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save your rubric. Try again.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  async function finish(groupId?: string) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null)
    try { await completeOnboarding(groupId); await onDone(groupId) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not finish setup. Try again.'); throw err }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <main className="mx-auto min-h-dvh w-full max-w-[480px] px-5 pb-10 pt-safe">
    <header className="mb-7 flex items-center gap-3"><Logo className="h-10 w-10" /><span className="font-display text-[23px] font-semibold">Make it your movie night</span></header>
    <ol aria-label="Getting started" className="mb-7 flex gap-4 text-[13px] font-semibold"><li aria-current={step === 1 ? 'step' : undefined} className={step === 1 ? 'text-gold' : 'text-teal'}>{step === 1 ? '1' : '✓'} Your rubric</li><li aria-current={step === 2 ? 'step' : undefined} className={step === 2 ? 'text-gold' : 'text-muted'}>2 Your group</li></ol>
    {error && <p role="alert" className="mb-4 text-[13px] text-coral">{error}</p>}
    {step === 1 ? <section className="mp-rise">
      <h1 className="font-display text-[30px] font-semibold leading-tight">What makes a movie good to you?</h1>
      <p className="mb-5 mt-3 text-[15px] leading-relaxed text-muted">Your rubric tells the group what matters to you. Start with these seven categories, or change their weights. Next, we’ll add you to our starter group.</p>
      <form onSubmit={(e) => { e.preventDefault(); void save() }}><fieldset disabled={busy}>
        <label className="mb-5 block text-[13px] font-semibold">What should your group call you?<input required maxLength={60} autoComplete="nickname" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your display name" className={`mt-2 ${fieldClass}`} /></label>
        <div className="mp-card rounded-[22px] p-5">{customize ? <RubricRowsEditor rows={rows} onChange={setRows} disabled={busy} reorder={false} /> : <ul className="divide-y divide-line/50">{rows.filter((r) => r.enabled).map((r) => <li key={r.key} className="flex items-center justify-between gap-3 py-2.5 text-[14px]"><span>{r.label}</span><span className="font-mono text-gold">{r.weight}</span></li>)}</ul>}
          <button type="button" onClick={() => setCustomize((v) => !v)} className="mt-3 min-h-11 w-full rounded-full border border-line px-4 text-[13px] font-semibold text-gold" aria-expanded={customize}>{customize ? 'Show my rubric summary' : 'Customize my weights'}</button>
        </div>
        <p className="mt-3 text-[13px] leading-snug text-muted">These numbers are weights: 40 counts twice as much as 20. You can edit them later in Profile → Personal rubrics.</p>
        <CtaButton type="submit" disabled={busy || !displayName.trim() || !rows.some((r) => r.enabled && r.weight > 0)} className="mt-5 min-h-12 w-full px-4 text-[14px]">{busy ? 'Saving your rubric…' : 'Save my rubric and join the starter group'}</CtaButton>
      </fieldset></form>
    </section> : <section className="mp-rise">
      <p className="mb-2 text-[13px] font-semibold text-teal">Your rubric is saved ✓</p><h1 className="font-display text-[30px] font-semibold leading-tight">{suggestion ? `You’re in ${suggestion.name}` : 'Meet your first movie-night group'}</h1>
      {joining ? <p role="status" className="mt-5 text-[15px] text-muted">Joining your suggested group…</p> : suggestion ? <div className="mp-card mt-5 rounded-[22px] p-5"><p className="text-[13px] font-semibold text-teal">Suggested for new members · Joined ✓</p><h2 className="mt-2 font-display text-[24px] font-semibold">{suggestion.name}</h2><p className="mt-3 text-[15px] leading-relaxed text-muted">Your rubric came with you. Open the group to rate a movie or show together. Your scores stay hidden until the Reveal.</p><p className="mt-3 text-[13px] leading-snug text-muted">Chat and watchlists are ready to explore. You can leave the group from its Settings at any time.</p><CtaButton onClick={() => void finish(suggestion.id).catch(() => {})} disabled={busy} className="mt-5 min-h-12 w-full px-4 text-[14px]">{busy ? 'Opening your group…' : 'Let’s rate something'}</CtaButton></div> : <button type="button" onClick={() => setJoinRetry((n) => n + 1)} className="mt-4 min-h-11 w-full text-[14px] font-semibold text-teal">Try joining again</button>}
    </section>}
    <button type="button" disabled={busy || joining} onClick={() => void finish(suggestion?.id).catch(() => {})} className="mt-3 min-h-11 w-full text-[13px] text-muted hover:text-text">{step === 1 ? 'Use default weights and join the starter group' : 'Explore the app first'}</button>
  </main>
}
