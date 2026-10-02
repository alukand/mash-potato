// The signed-in user's tokens, shared by Home, More, Rewards and the take
// composer: one summary in memory, re-read after anything that may have earned.
//
// The "+N tokens" moment: each refresh compares the ledger with the newest
// entry this device has already seen (localStorage, per user) and announces
// what is new on `mp:tokens-earned` (TokenToast shows it). Refreshes run one
// at a time, so two quick actions can never announce the same tokens twice.
// A first look announces nothing, so an update never opens on old news.
//
// Quiet on failure: tokens must never break the screen they sit on.

import { useSyncExternalStore } from 'react'
import { claimDailyTokens, fetchMyRewards } from './api'
import { flagStore } from './flags'
import { entryLabel, newEarnings } from './rewards'
import type { RewardsSummary } from './rewards'

export interface TokensEarnedDetail {
  total: number
  label: string
}

let state: { uid: string | null; summary: RewardsSummary | null } = { uid: null, summary: null }
const listeners = new Set<() => void>()

function set(uid: string | null, summary: RewardsSummary | null) {
  state = { uid, summary }
  for (const listener of listeners) listener()
}

const seenKey = (uid: string) => `mp:tokens-seen:${uid}`

function readSeen(uid: string): number | null {
  try {
    const v = localStorage.getItem(seenKey(uid))
    return v === null || !Number.isFinite(Number(v)) ? null : Number(v)
  } catch {
    return null
  }
}

function writeSeen(uid: string, id: number) {
  try {
    localStorage.setItem(seenKey(uid), String(id))
  } catch {
    // private mode: the moment just repeats on another device, harmless
  }
}

// The latest moment no toast has taken yet. The launch refresh can land while
// the app is still on its loading screen, before TokenToast exists to hear it.
let unshown: TokensEarnedDetail | null = null

/** Take the latest "+N tokens" moment that nothing has shown yet. */
export function takeUnshownEarnings(): TokensEarnedDetail | null {
  const detail = unshown
  unshown = null
  return detail
}

function announce(uid: string, next: RewardsSummary) {
  const lastSeen = readSeen(uid)
  const { total, waiting, entries, newest } = newEarnings(next.history, lastSeen)
  // Record even an empty ledger (0), or a brand-new account's first token
  // would be mistaken for old news.
  if (lastSeen === null || newest > lastSeen) writeSeen(uid, newest)
  if (total <= 0) return
  const what = entries.length === 1 ? entryLabel(entries[0], Date.now()) : 'For what you just did'
  const label = waiting > 0 ? `${what}, and +${waiting} waiting` : what
  unshown = { total, label }
  window.dispatchEvent(new CustomEvent<TokensEarnedDetail>('mp:tokens-earned', { detail: unshown }))
}

let queue: Promise<void> = Promise.resolve()
// A refresh queued but not yet started covers any asked for meanwhile (the
// app, Home and the flag arriving all ask at launch).
let waiting: string | null = null

/** Re-read the caller's tokens (no-op while the `rewards` flag is off). */
export function refreshRewards(uid: string | null): Promise<void> {
  if (!uid) {
    set(null, null)
    return queue
  }
  if (state.uid !== uid) set(uid, null)
  if (waiting === uid) return queue
  waiting = uid
  queue = queue.then(async () => {
    waiting = null
    if (!flagStore.isOn('rewards')) return
    try {
      const next = await fetchMyRewards()
      if (state.uid !== uid) return // signed out or switched while it ran
      announce(uid, next)
      set(uid, next)
    } catch {
      // keep what we had
    }
  })
  return queue
}

/** Claim today's token. Resolves to whether it paid; throws if the server refused. */
export async function claimToday(uid: string): Promise<boolean> {
  const { claimed, summary } = await claimDailyTokens()
  if (state.uid === uid) {
    announce(uid, summary)
    set(uid, summary)
  }
  return claimed
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** This user's summary; null until loaded, while off, or for anyone else. */
export function useRewards(uid: string | null): RewardsSummary | null {
  return useSyncExternalStore(subscribe, () =>
    uid !== null && state.uid === uid ? state.summary : null,
  )
}
