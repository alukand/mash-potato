import { useEffect, useId, useState } from 'react'
import { claimToday, takeUnshownEarnings, useRewards } from '../lib/rewardsStore'
import type { TokensEarnedDetail } from '../lib/rewardsStore'
import { tokenCount } from '../lib/rewards'

// Tokens' small pieces: the coin, the "+N tokens" moment, and Home's daily
// token. The balance is private (DESIGN.md "Reward loop law"): it appears
// only to its owner, never beside anyone else's name.

/** The token glyph: a gold coin. Unique gradient ids, so many can share a page. */
export function TokenCoin({ size = 20 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`${id}-coin`} x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F6D98E" />
          <stop offset="1" stopColor="#D9A23C" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={`url(#${id}-coin)`} />
      <circle cx="12" cy="12" r="6.6" fill="none" stroke="#8A5A1C" strokeOpacity="0.45" strokeWidth="1.4" />
      <path d="M9.6 9.2c.8-.9 3.9-.9 4.8 0" fill="none" stroke="#FFF3CF" strokeOpacity="0.8" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * "+3 tokens" and what earned them, for a few seconds, whenever the
 * rewards store finds something newly earned. Mounted once by the app.
 */
export function TokenToast() {
  const [shown, setShown] = useState<(TokensEarnedDetail & { key: number }) | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = (detail: TokensEarnedDetail | null) => {
      if (!detail || detail.total <= 0) return
      setShown({ ...detail, key: Date.now() })
      clearTimeout(timer)
      timer = setTimeout(() => setShown(null), 3600)
    }
    // anything earned while the app was still loading
    show(takeUnshownEarnings())
    const onEarned = () => show(takeUnshownEarnings())
    window.addEventListener('mp:tokens-earned', onEarned)
    return () => {
      window.removeEventListener('mp:tokens-earned', onEarned)
      clearTimeout(timer)
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-5 pt-[calc(env(safe-area-inset-top)+12px)]"
    >
      {shown && (
        <div
          key={shown.key}
          className="mp-rise flex max-w-[440px] items-center gap-2.5 rounded-full border border-gold/30 bg-surface/95 py-2 pl-2.5 pr-4 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] backdrop-blur"
        >
          <TokenCoin size={22} />
          <span className="tabular shrink-0 text-[14px] font-bold text-gold">{tokenCount(shown.total, true)}</span>
          <span className="min-w-0 truncate text-[13px] text-muted">{shown.label}</span>
        </div>
      )}
    </div>
  )
}

/** Home's daily token: there while it's unclaimed, gone once it isn't. */
export function DailyTokenStrip({ userId }: { userId: string }) {
  const rewards = useRewards(userId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!rewards?.enabled || rewards.claimedToday) return null
  const amount = rewards.rules.daily_claim?.tokens ?? 1

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
    <section className="mp-rise rounded-2xl border border-gold/25 bg-gold/[0.07] px-4 py-3">
      <div className="flex items-center gap-3">
        <TokenCoin size={30} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Today’s token is ready</p>
          <p className="text-[12px] leading-snug text-muted">There’s a new one every day.</p>
        </div>
        <button
          type="button"
          onClick={() => void claim()}
          disabled={busy}
          className="mp-cta min-h-11 shrink-0 rounded-full bg-gold px-4 text-[13px] font-bold text-bg disabled:opacity-60"
        >
          {busy ? 'Claiming…' : `Claim +${amount}`}
        </button>
      </div>
      {error && <p className="mt-2 text-[12px] text-coral">{error}</p>}
    </section>
  )
}
