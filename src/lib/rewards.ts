// Tokens, client side: turning the server's my_rewards() payload into what the
// screens show. Pure, so it is unit-tested; lib/rewardsStore.ts does the I/O.
//
// The server decides everything that matters (supabase/migrations/
// 20261001120000_rewards.sql): what earns, the caps, the 48-hour hold, the
// clawbacks. Nothing here can grant a token; it only describes them.

export type TokenKind =
  | 'daily_claim'
  | 'rating_solo'
  | 'rating_group'
  | 'take'
  | 'take_bonus'
  | 'take_reaction'
  | 'take_reconcile'
  | 'adjustment'

export interface TokenRule {
  tokens: number
  dailyCap: number | null
  /** take_bonus: characters needed for the long-take bonus */
  minChars?: number
  /** take_bonus: how long the bonus waits before it can be spent */
  holdHours?: number
}

export interface TokenEntry {
  id: number
  kind: TokenKind
  amount: number
  status: 'available' | 'pending' | 'void'
  maturesAt: string | null
  createdAt: string
  /** take_reconcile: why the take's tokens moved */
  reason: 'hidden' | 'restored' | null
  titleName: string | null
}

export interface RewardsSummary {
  enabled: boolean
  balance: number
  pending: number
  claimedToday: boolean
  nextClaimAt: string | null
  rules: Partial<Record<TokenKind, TokenRule>>
  /** Today's capped awards so far, by kind. */
  today: Partial<Record<'rating_solo' | 'rating_group' | 'take', number>>
  history: TokenEntry[]
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** The server payload, defensively typed: a missing field reads as nothing earned. */
export function parseRewards(raw: unknown): RewardsSummary {
  const r = (raw ?? {}) as Record<string, unknown>
  const rules: Partial<Record<TokenKind, TokenRule>> = {}
  for (const [key, value] of Object.entries((r.rules ?? {}) as Record<string, Record<string, unknown>>)) {
    rules[key as TokenKind] = {
      tokens: num(value.tokens),
      dailyCap: typeof value.dailyCap === 'number' ? value.dailyCap : null,
      minChars: typeof value.min_chars === 'number' ? value.min_chars : undefined,
      holdHours: typeof value.hold_hours === 'number' ? value.hold_hours : undefined,
    }
  }
  const today = (r.today ?? {}) as Record<string, unknown>
  return {
    enabled: r.enabled === true,
    balance: num(r.balance),
    pending: num(r.pending),
    claimedToday: r.claimedToday === true,
    nextClaimAt: typeof r.nextClaimAt === 'string' ? r.nextClaimAt : null,
    rules,
    today: {
      rating_solo: num(today.rating_solo),
      rating_group: num(today.rating_group),
      take: num(today.take),
    },
    history: Array.isArray(r.history)
      ? (r.history as Record<string, unknown>[]).map((h) => ({
          id: num(h.id),
          kind: String(h.kind) as TokenKind,
          amount: num(h.amount),
          status: h.status === 'pending' || h.status === 'void' ? h.status : 'available',
          maturesAt: typeof h.maturesAt === 'string' ? h.maturesAt : null,
          createdAt: typeof h.createdAt === 'string' ? h.createdAt : '',
          reason: h.reason === 'hidden' || h.reason === 'restored' ? h.reason : null,
          titleName: typeof h.titleName === 'string' ? h.titleName : null,
        }))
      : [],
  }
}

/** Whether a pending entry is still waiting at `now` (the server counts it once matured). */
export function isWaiting(entry: TokenEntry, now: number): boolean {
  return entry.status === 'pending' && entry.maturesAt !== null && Date.parse(entry.maturesAt) > now
}

/** One line of history, in plain words. */
export function entryLabel(entry: TokenEntry, now: number): string {
  const film = entry.titleName ?? 'a film'
  switch (entry.kind) {
    case 'daily_claim':
      return 'Daily token'
    case 'rating_solo':
      return `Rated ${film}`
    case 'rating_group':
      return `Movie night: ${film}`
    case 'take':
      return `Take on ${film}`
    case 'take_bonus':
      if (entry.status === 'void') return `Long-take bonus on ${film} (the take came down)`
      return isWaiting(entry, now) ? `Long-take bonus on ${film} (unlocks soon)` : `Long-take bonus on ${film}`
    case 'take_reaction':
      return `Someone reacted to your take on ${film}`
    case 'take_reconcile':
      return entry.reason === 'restored' ? `Take on ${film} restored` : `Take on ${film} hidden after reports`
    case 'adjustment':
      return 'Adjustment'
  }
}

/**
 * What the composer says about a take's tokens: the base, and how far the
 * writer is from the long-take bonus. `chars` is the trimmed length.
 */
export function takeBonusHint(
  chars: number,
  rules: Partial<Record<TokenKind, TokenRule>>,
): { base: number; bonus: number; remaining: number; reached: boolean } {
  const base = rules.take?.tokens ?? 0
  const bonus = rules.take_bonus?.tokens ?? 0
  const minChars = rules.take_bonus?.minChars ?? 300
  const remaining = Math.max(0, minChars - chars)
  return { base, bonus, remaining, reached: remaining === 0 }
}

/** "in 5h 12m", "in 12m", "any minute": until the next daily token. */
export function nextClaimLabel(nextClaimAt: string | null, now: number): string {
  if (!nextClaimAt) return 'tomorrow'
  const mins = Math.ceil((Date.parse(nextClaimAt) - now) / 60_000)
  if (!Number.isFinite(mins)) return 'tomorrow'
  if (mins <= 1) return 'any minute'
  if (mins < 60) return `in ${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`
}

/**
 * Entries newer than the last one this device has seen, for the "+N tokens"
 * moment. `total` is what can be spent now; `waiting` is new bonus still in
 * its hold, said separately so the moment never overstates the balance.
 * `lastSeen` null means a first look: nothing is announced, so an update
 * never greets someone with a pile of old news.
 */
export function newEarnings(
  history: TokenEntry[],
  lastSeen: number | null,
  now: number = Date.now(),
): { total: number; waiting: number; entries: TokenEntry[]; newest: number } {
  const newest = history.reduce((max, e) => Math.max(max, e.id), lastSeen ?? 0)
  if (lastSeen === null) return { total: 0, waiting: 0, entries: [], newest }
  const fresh = history.filter((e) => e.id > lastSeen && e.status !== 'void' && e.amount > 0)
  const entries = fresh.filter((e) => !isWaiting(e, now))
  const waiting = fresh.filter((e) => isWaiting(e, now)).reduce((sum, e) => sum + e.amount, 0)
  return { total: entries.reduce((sum, e) => sum + e.amount, 0), waiting, entries, newest }
}

/** "+1 token", "+5 tokens". */
export function tokenCount(n: number, signed = false): string {
  const sign = signed && n > 0 ? '+' : n < 0 ? '−' : ''
  const abs = Math.abs(n)
  return `${sign}${abs} ${abs === 1 ? 'token' : 'tokens'}`
}
