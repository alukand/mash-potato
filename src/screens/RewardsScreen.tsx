import { useEffect, useState } from 'react'
import { claimToday, refreshRewards, useRewards } from '../lib/rewardsStore'
import { entryLabel, isWaiting, nextClaimLabel, tokenCount } from '../lib/rewards'
import type { RewardsSummary, TokenKind } from '../lib/rewards'
import { TokenCoin } from '../components/Tokens'
import { CtaButton } from '../components/ui'
import { useFeatureFlag, useFeatureFlagsReady } from '../lib/flags'

// Your tokens: the balance, today's token, how to earn more, and every entry.
// Everything shown comes from the server's own rules (my_rewards), so the
// amounts and caps here can never disagree with what actually pays.
//
// Spending is deliberately unpromised: "ways to spend tokens are on the way",
// no gift cards, no dates, until redemption actually exists.

function EarnRow({
  label,
  hint,
  amount,
  progress,
}: {
  label: string
  hint: string
  amount: string
  progress?: string
}) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted">{hint}</span>
        {progress && (
          <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            {progress}
          </span>
        )}
      </span>
      <span className="tabular shrink-0 font-display text-[18px] font-semibold text-gold">{amount}</span>
    </li>
  )
}

function howToEarn(r: RewardsSummary) {
  const tokens = (k: TokenKind) => r.rules[k]?.tokens ?? 0
  const cap = (k: TokenKind) => r.rules[k]?.dailyCap ?? null
  const today = (k: 'rating_solo' | 'rating_group' | 'take') => {
    const c = cap(k)
    return c === null ? undefined : `Today: ${r.today[k] ?? 0} of ${c}`
  }
  const minChars = r.rules.take_bonus?.minChars ?? 300
  const hold = r.rules.take_bonus?.holdHours ?? 48
  return [
    { key: 'group', label: 'Rate a film with your group', hint: 'Lock your card in a movie night that reaches its Reveal.', amount: `+${tokens('rating_group')}`, progress: today('rating_group') },
    { key: 'solo', label: 'Rate a film solo', hint: 'Your first rating of a film.', amount: `+${tokens('rating_solo')}`, progress: today('rating_solo') },
    { key: 'take', label: 'Write a take on a film', hint: 'Any length, on the film’s page.', amount: `+${tokens('take')}`, progress: today('take') },
    { key: 'long', label: `Long take (${minChars}+ characters)`, hint: `Real writing that stays up for ${hold} hours.`, amount: `+${tokens('take_bonus')}` },
    { key: 'react', label: 'Someone reacts to your take', hint: 'The first reaction from someone else.', amount: `+${tokens('take_reaction')}` },
    { key: 'daily', label: 'Open the app', hint: 'Claim one token a day.', amount: `+${tokens('daily_claim')}` },
  ]
}

export function RewardsScreen({ userId, onBack }: { userId: string; onBack: () => void }) {
  const rewards = useRewards(userId)
  const rewardsOn = useFeatureFlag('rewards')
  const flagsReady = useFeatureFlagsReady()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    void refreshRewards(userId)
  }, [userId])

  // the countdown to the next daily token stays honest while you look at it
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  async function claim() {
    setBusy(true)
    setError(null)
    try {
      await claimToday(userId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim it')
    } finally {
      setBusy(false)
    }
  }

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
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Only you can see this</p>
          <h1 className="truncate font-display text-[22px] font-semibold leading-tight">Your tokens</h1>
        </div>
      </header>

      {!rewards &&
        (flagsReady && !rewardsOn ? (
          <p className="px-1 text-[14px] leading-relaxed text-muted">
            Tokens aren’t available right now. Anything you’ve earned is still yours.
          </p>
        ) : (
          <p className="px-1 font-mono text-[11px] text-muted">counting…</p>
        ))}

      {rewards && (
        <div className="flex flex-col gap-5">
          {/* ---- the balance (personal numbers are gold) ---- */}
          <section className="mp-rise mp-card rounded-[26px] p-6 text-center">
            <div className="flex items-center justify-center gap-3">
              <TokenCoin size={40} />
              <p className="tabular font-display text-[56px] font-semibold leading-none text-gold">{rewards.balance}</p>
            </div>
            <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              {rewards.balance === 1 ? 'Token' : 'Tokens'}
            </p>
            {rewards.pending > 0 && (
              <p className="mt-3 text-[13px] text-muted">
                {tokenCount(rewards.pending, true)} waiting: long-take bonuses unlock after{' '}
                {rewards.rules.take_bonus?.holdHours ?? 48} quiet hours.
              </p>
            )}

            <div className="mt-5">
              {rewards.claimedToday ? (
                <p className="text-[13px] text-muted">
                  Today’s token is claimed. The next one is ready {nextClaimLabel(rewards.nextClaimAt, now)}.
                </p>
              ) : (
                <CtaButton onClick={() => void claim()} disabled={busy} className="min-h-12 w-full px-4 text-[14px]">
                  {busy ? 'Claiming…' : `Claim today’s token (+${rewards.rules.daily_claim?.tokens ?? 1})`}
                </CtaButton>
              )}
              {error && <p className="mt-2 text-[12px] text-coral">{error}</p>}
            </div>
          </section>

          {/* ---- how to earn, straight from the server's rules ---- */}
          <section className="mp-rise mp-card rounded-[26px] px-5 py-2" style={{ animationDelay: '60ms' }}>
            <h2 className="pt-3 font-display text-[18px] font-semibold">How to earn</h2>
            <p className="mt-1 text-[12px] leading-snug text-muted">
              Each film earns once for rating and once for a take. What you say never changes what you earn.
            </p>
            <ul className="divide-y divide-line/60">
              {howToEarn(rewards).map((row) => (
                <EarnRow key={row.key} label={row.label} hint={row.hint} amount={row.amount} progress={row.progress} />
              ))}
            </ul>
          </section>

          {/* ---- spending: nothing promised until it exists ---- */}
          <section className="mp-rise rounded-[22px] border border-line/60 px-5 py-4" style={{ animationDelay: '120ms' }}>
            <h2 className="font-display text-[16px] font-semibold">Spending tokens</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Ways to spend tokens are on the way. Your balance carries over.
            </p>
          </section>

          {/* ---- every entry ---- */}
          <section className="mp-rise" style={{ animationDelay: '180ms' }}>
            <h2 className="mb-2 px-1 font-display text-[18px] font-semibold">History</h2>
            {rewards.history.length === 0 ? (
              <p className="px-1 text-[13px] text-muted">Nothing yet. Claim today’s token or rate a film to start.</p>
            ) : (
              <ul className="divide-y divide-line/60 rounded-[22px] border border-line/60 px-4">
                {rewards.history.map((e) => {
                  const waiting = isWaiting(e, now)
                  return (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="min-w-0">
                        <span className={`block truncate text-[13px] ${e.status === 'void' ? 'text-muted line-through' : ''}`}>
                          {entryLabel(e, now)}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                          {new Date(e.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          {waiting ? ', waiting' : ''}
                        </span>
                      </span>
                      <span
                        className={`tabular shrink-0 font-mono text-[13px] font-bold ${
                          e.status === 'void' || waiting ? 'text-muted' : e.amount < 0 ? 'text-coral' : 'text-gold'
                        }`}
                      >
                        {e.amount > 0 ? `+${e.amount}` : `−${Math.abs(e.amount)}`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <p className="px-1 text-[11px] leading-relaxed text-muted">
            Tokens have no cash value. They can’t be bought, sold or transferred, and they’re removed if you
            delete your account. How tokens work may change; see the{' '}
            <a href="https://mashpotato.app/terms" target="_blank" rel="noreferrer" className="underline hover:text-text">
              Terms
            </a>
            .
          </p>
        </div>
      )}
    </div>
  )
}
