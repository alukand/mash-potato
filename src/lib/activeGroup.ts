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
