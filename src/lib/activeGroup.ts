// Which group is "active" across the app. The choice persists in localStorage
// so a reload lands you back where you were, and falls back gracefully when the
// stored group no longer exists (you left it, or signed in as someone else).

import type { GroupInfo } from './api'

const STORAGE_KEY = 'mp.activeGroupId'

/**
 * The group to make active: the stored one if the user is still a member,
 * else the first (oldest) group, else null when they have none.
 */
export function pickActiveGroup(groups: GroupInfo[], storedId: string | null): GroupInfo | null {
  if (groups.length === 0) return null
  if (storedId) {
    const stored = groups.find((g) => g.id === storedId)
    if (stored) return stored
  }
  return groups[0]
}

export function readStoredGroupId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeGroupId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // ignore (private mode / storage disabled) — we just fall back to first
  }
}

// The active TAB persists the same way: a reload (or iOS reclaiming the
// webview) lands you back on the tab you were using.

const TAB_KEY = 'mp.activeTab'
const TAB_IDS = ['home', 'discover', 'rate', 'group'] as const
type StoredTab = (typeof TAB_IDS)[number]

export function readStoredTab(): StoredTab | null {
  try {
    const v = localStorage.getItem(TAB_KEY)
    return (TAB_IDS as readonly string[]).includes(v ?? '') ? (v as StoredTab) : null
  } catch {
    return null
  }
}

export function storeTab(tab: StoredTab): void {
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    // ignore
  }
}

// Recently engaged groups (switched to, invited to a round). The invite
// picker floats these to the top, most recent first.

const RECENT_KEY = 'mp.recentGroupIds'
const RECENT_CAP = 8

export function readRecentGroupIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function touchRecentGroup(id: string): void {
  try {
    const next = [id, ...readRecentGroupIds().filter((g) => g !== id)].slice(0, RECENT_CAP)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

// First-run onboarding: once the slides have been seen on this device they
// never show again (worst case with storage disabled: they show every run).

const ONBOARDED_KEY = 'mp.onboarded'

export function readOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    return false
  }
}

export function storeOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    // ignore
  }
}
