// The app's location, as a URL.
//
// There is no router here on purpose. The view model is ALREADY a stack
// (tabs, with views pushed over them), and browser history is a stack too, so
// what is actually missing is a serialiser between the two — not a routing
// framework. App.tsx's push-notification handler already reconstructs a
// multi-entry stack from a single target ([{messages}, {thread}]); turning a
// path into a stack is that same rule, generalised.
//
// Native is unaffected: `capacitor://localhost/` parses to the home tab, and
// the push handler still sets state directly. History just mirrors it.

import type { TabId } from '../components/BottomNav'

/** A view pushed over the tabs. Tapping a bottom tab clears the whole stack. */
export type StackView =
  | {
      kind: 'title'
      tmdbId: number
      mediaType: 'movie' | 'tv'
      /**
       * Open the discussion on this group's thread (reveal deep link).
       * Deliberately NOT in the URL — see `stateToPath`.
       */
      discussGroupId?: string
      /** Composer placeholder seed (the reveal's clash headline). */
      discussSeed?: string
    }
  | { kind: 'createGroup' }
  | { kind: 'user'; userId: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'messages' }
  | { kind: 'thread'; conversationId: string }
  | { kind: 'groupHistory'; groupId: string }

/** Identity for React keys and for "is this the same view?" comparisons. */
export function stackKey(v: StackView): string {
  if (v.kind === 'title') return `title:${v.tmdbId}:${v.mediaType}`
  if (v.kind === 'user') return `user:${v.userId}`
  if (v.kind === 'playlist') return `playlist:${v.playlistId}`
  if (v.kind === 'thread') return `thread:${v.conversationId}`
  if (v.kind === 'groupHistory') return `groupHistory:${v.groupId}`
  return v.kind
}

export interface AppLocation {
  tab: TabId
  stack: StackView[]
}

const TAB_PATHS: Record<TabId, string> = {
  home: '/',
  discover: '/discover',
  rate: '/rate',
  profile: '/profile',
}

const PATH_TABS: Record<string, TabId> = {
  '': 'home',
  discover: 'discover',
  rate: 'rate',
  profile: 'profile',
}

/**
 * Which tab sits UNDER a deep-linked view.
 *
 * On a fresh link there is no history to pop back to, so closing the view has
 * to land somewhere. Home is the neutral answer for most; a group's history
 * belongs under Rate, which is the group hub the screen already returns to
 * when you open one of its nights.
 */
function baseTabFor(view: StackView): TabId {
  return view.kind === 'groupHistory' ? 'rate' : 'home'
}

/**
 * The path for the current view.
 *
 * The TOP of the stack wins: a stack is a path through the app, and the URL
 * names where you are, not how you got there. `pathToState` rebuilds the
 * entries below it.
 *
 * `discussGroupId` / `discussSeed` are left out on purpose. They are a
 * transient composer seed handed over from a reveal, not part of a location —
 * putting them in the URL would make a shared link reopen someone else's
 * half-written comment prompt.
 */
export function stateToPath(tab: TabId, stack: StackView[]): string {
  const top = stack[stack.length - 1]
  if (!top) return TAB_PATHS[tab]

  switch (top.kind) {
    case 'title':
      return `/${top.mediaType === 'movie' ? 'film' : 'show'}/${top.tmdbId}`
    case 'user':
      return `/u/${encodeURIComponent(top.userId)}`
    case 'playlist':
      return `/list/${encodeURIComponent(top.playlistId)}`
    case 'groupHistory':
      return `/group/${encodeURIComponent(top.groupId)}/history`
    case 'messages':
      return '/messages'
    case 'thread':
      return `/messages/${encodeURIComponent(top.conversationId)}`
    case 'createGroup':
      return '/new-group'
  }
}

/** Anything unrecognised lands on Home rather than a dead end. */
const HOME: AppLocation = { tab: 'home', stack: [] }

/**
 * Rebuild the app's location from a path.
 *
 * Unknown or malformed paths fall back to Home: a stale or hand-typed link
 * should drop you somewhere useful, never on an error screen.
 */
export function pathToState(pathname: string): AppLocation {
  const parts = pathname.split('/').filter((s) => s.length > 0).map(decodeURIComponent)

  if (parts.length === 0) return HOME

  const [head, second, third] = parts

  // a bare tab
  if (parts.length === 1 && head in PATH_TABS) {
    return { tab: PATH_TABS[head], stack: [] }
  }

  const view = ((): StackView | null => {
    if ((head === 'film' || head === 'show') && second) {
      const tmdbId = Number(second)
      if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null
      return { kind: 'title', tmdbId, mediaType: head === 'film' ? 'movie' : 'tv' }
    }
    if (head === 'u' && second) return { kind: 'user', userId: second }
    if (head === 'list' && second) return { kind: 'playlist', playlistId: second }
    if (head === 'group' && second && third === 'history') {
      return { kind: 'groupHistory', groupId: second }
    }
    if (head === 'new-group' && parts.length === 1) return { kind: 'createGroup' }
    if (head === 'messages') {
      if (parts.length === 1) return { kind: 'messages' }
      if (second) return { kind: 'thread', conversationId: second }
    }
    return null
  })()

  if (!view) return HOME

  // A thread keeps the inbox beneath it, so Back walks out to the message
  // centre rather than dumping you on Home — the same two-entry shape the
  // push handler builds for a message tap.
  const stack: StackView[] =
    view.kind === 'thread' ? [{ kind: 'messages' }, view] : [view]

  return { tab: baseTabFor(view), stack }
}
