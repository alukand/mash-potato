import { describe, expect, it } from 'vitest'
import {
  entryLabel,
  newEarnings,
  nextClaimLabel,
  parseRewards,
  takeBonusHint,
  tokenCount,
} from './rewards'
import type { TokenEntry } from './rewards'

const entry = (over: Partial<TokenEntry>): TokenEntry => ({
  id: 1,
  kind: 'take',
  amount: 3,
  status: 'available',
  maturesAt: null,
  createdAt: '2026-10-01T12:00:00Z',
  reason: null,
  titleName: 'Nosferatu',
  ...over,
})

describe('parseRewards', () => {
  it('reads the server payload', () => {
    const r = parseRewards({
      enabled: true,
      balance: 26,
      pending: 2,
      claimedToday: true,
      nextClaimAt: '2026-10-02T05:00:00Z',
      rules: {
        take: { tokens: 3, dailyCap: 3 },
        take_bonus: { tokens: 2, dailyCap: null, min_chars: 300, hold_hours: 48 },
      },
      today: { take: 2 },
      history: [{ id: 7, kind: 'take_bonus', amount: 2, status: 'pending', maturesAt: '2026-10-03T12:00:00Z', titleName: 'Nosferatu' }],
    })
    expect(r.balance).toBe(26)
    expect(r.rules.take_bonus).toEqual({ tokens: 2, dailyCap: null, minChars: 300, holdHours: 48 })
    expect(r.today).toEqual({ rating_solo: 0, rating_group: 0, take: 2 })
    expect(r.history[0]).toMatchObject({ id: 7, status: 'pending', titleName: 'Nosferatu' })
  })

  it('treats a missing or broken payload as nothing earned, and off', () => {
    const r = parseRewards(null)
    expect(r.enabled).toBe(false)
    expect(r.balance).toBe(0)
    expect(r.history).toEqual([])
    expect(parseRewards({ enabled: 'yes', balance: '12' }).enabled).toBe(false)
    expect(parseRewards({ balance: '12' }).balance).toBe(0)
  })
})

describe('entryLabel', () => {
  const now = Date.parse('2026-10-02T12:00:00Z')

  it('names every kind in plain words', () => {
    expect(entryLabel(entry({ kind: 'daily_claim', titleName: null }), now)).toBe('Daily token')
    expect(entryLabel(entry({ kind: 'rating_group' }), now)).toBe('Movie night: Nosferatu')
    expect(entryLabel(entry({ kind: 'rating_solo' }), now)).toBe('Rated Nosferatu')
    expect(entryLabel(entry({ kind: 'take_reaction' }), now)).toBe('Someone reacted to your take on Nosferatu')
  })

  it('tells a waiting bonus from a spendable one and a voided one', () => {
    const waiting = entry({ kind: 'take_bonus', status: 'pending', maturesAt: '2026-10-03T12:00:00Z' })
    const matured = entry({ kind: 'take_bonus', status: 'pending', maturesAt: '2026-10-01T12:00:00Z' })
    expect(entryLabel(waiting, now)).toContain('unlocks soon')
    expect(entryLabel(matured, now)).toBe('Long-take bonus on Nosferatu')
    expect(entryLabel(entry({ kind: 'take_bonus', status: 'void' }), now)).toContain('came down')
  })

  it('explains clawbacks and restores', () => {
    expect(entryLabel(entry({ kind: 'take_reconcile', amount: -6, reason: 'hidden' }), now))
      .toBe('Take on Nosferatu hidden after reports')
    expect(entryLabel(entry({ kind: 'take_reconcile', amount: 6, reason: 'restored' }), now))
      .toBe('Take on Nosferatu restored')
  })
})

describe('takeBonusHint', () => {
  const rules = { take: { tokens: 3, dailyCap: 3 }, take_bonus: { tokens: 2, dailyCap: null, minChars: 300 } }

  it('counts down to the long-take bonus', () => {
    expect(takeBonusHint(212, rules)).toEqual({ base: 3, bonus: 2, remaining: 88, reached: false })
  })

  it('reaches it at exactly the threshold', () => {
    expect(takeBonusHint(300, rules).reached).toBe(true)
    expect(takeBonusHint(299, rules).reached).toBe(false)
  })

  it('falls back to 300 when the server sends no threshold', () => {
    expect(takeBonusHint(0, {}).remaining).toBe(300)
  })
})

describe('nextClaimLabel', () => {
  const now = Date.parse('2026-10-01T12:00:00Z')
  it('reads like a countdown', () => {
    expect(nextClaimLabel('2026-10-01T17:12:00Z', now)).toBe('in 5h 12m')
    expect(nextClaimLabel('2026-10-01T15:00:00Z', now)).toBe('in 3h')
    expect(nextClaimLabel('2026-10-01T12:12:00Z', now)).toBe('in 12m')
    expect(nextClaimLabel('2026-10-01T12:00:30Z', now)).toBe('any minute')
    expect(nextClaimLabel(null, now)).toBe('tomorrow')
  })
})

describe('newEarnings', () => {
  const history = [
    entry({ id: 5, kind: 'rating_group', amount: 3 }),
    entry({ id: 4, kind: 'take_bonus', amount: 2, status: 'void' }),
    entry({ id: 3, kind: 'take_reconcile', amount: -3, reason: 'hidden' }),
    entry({ id: 2, kind: 'daily_claim', amount: 1 }),
  ]

  it('announces only what is new and positive', () => {
    expect(newEarnings(history, 2)).toMatchObject({ total: 3, waiting: 0, newest: 5 })
    expect(newEarnings(history, 2).entries.map((e) => e.id)).toEqual([5])
  })

  it('keeps a bonus still in its hold out of the spendable total', () => {
    const now = Date.parse('2026-10-01T12:00:00Z')
    const posted = [
      entry({ id: 9, kind: 'take_bonus', amount: 2, status: 'pending', maturesAt: '2026-10-03T12:00:00Z' }),
      entry({ id: 8, kind: 'take', amount: 3 }),
    ]
    expect(newEarnings(posted, 7, now)).toMatchObject({ total: 3, waiting: 2, newest: 9 })
    expect(newEarnings(posted, 7, now).entries.map((e) => e.id)).toEqual([8])
  })

  it('stays quiet on a first look, but remembers where it is', () => {
    expect(newEarnings(history, null)).toEqual({ total: 0, waiting: 0, entries: [], newest: 5 })
  })

  it('has nothing to say when nothing is new', () => {
    expect(newEarnings(history, 5).total).toBe(0)
  })
})

describe('tokenCount', () => {
  it('pluralises and signs', () => {
    expect(tokenCount(1)).toBe('1 token')
    expect(tokenCount(5, true)).toBe('+5 tokens')
    expect(tokenCount(-6)).toBe('−6 tokens')
  })
})
