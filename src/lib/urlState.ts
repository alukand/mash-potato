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
import type { TitlePart } from './titleParts'

/** A view pushed over the tabs. Tapping a bottom tab clears the whole stack. */
export type StackView =
  | {
      kind: 'title'
      tmdbId: number
      mediaType: 'movie' | 'tv'
      /** A season or an episode of the show (lib/titleParts.ts); absent = the show. */
      part?: TitlePart
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
  | { kind: 'moderation' }
  /** Your tokens: balance, today's token, how to earn, history. Private. */
  | { kind: 'rewards' }

/** How a link opens a title page: which part, and whether straight into a discussion. */
export interface OpenTitleOptions {
  part?: TitlePart | null
  discuss?: { groupId: string; seed?: string }
}

/** The one signature every "open this title" prop shares (App.tsx openTitle). */
export type OpenTitle = (
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  options?: OpenTitleOptions,
) => void

/** Identity for React keys and for "is this the same view?" comparisons. */
export function stackKey(v: StackView): string {
  if (v.kind === 'title') {
    const part = v.part ? `:s${v.part.season}${v.part.episode !== null ? `e${v.part.episode}` : ''}` : ''
    return `title:${v.tmdbId}:${v.mediaType}${part}`
  }
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
  if (view.kind === 'groupHistory') return 'rate'
  // The moderation queue is reached from Profile's settings cluster, so that
  // is where closing it belongs.
  if (view.kind === 'moderation') return 'profile'
  return 'home'
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
    case 'title': {
      const base = `/${top.mediaType === 'movie' ? 'film' : 'show'}/${top.tmdbId}`
      if (!top.part || top.mediaType !== 'tv') return base
      const season = `${base}/season/${top.part.season}`
      return top.part.episode === null ? season : `${season}/episode/${top.part.episode}`
    }
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
    case 'moderation':
      return '/moderation'
    case 'rewards':
      return '/rewards'
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
      // /show/:id/season/:n[/episode/:m]. A malformed part is refused outright
      // rather than quietly opening the show it was meant to narrow.
      if (head === 'show' && third === 'season') {
        const season = Number(parts[3])
        if (!Number.isInteger(season) || season < 0 || season > 999) return null
        if (parts.length === 4) return { kind: 'title', tmdbId, mediaType: 'tv', part: { season, episode: null } }
        const episode = Number(parts[5])
        if (parts.length !== 6 || parts[4] !== 'episode') return null
        if (!Number.isInteger(episode) || episode < 0 || episode > 9999) return null
        return { kind: 'title', tmdbId, mediaType: 'tv', part: { season, episode } }
      }
      return { kind: 'title', tmdbId, mediaType: head === 'film' ? 'movie' : 'tv' }
    }
    if (head === 'u' && second) return { kind: 'user', userId: second }
    if (head === 'list' && second) return { kind: 'playlist', playlistId: second }
    if (head === 'group' && second && third === 'history') {
      return { kind: 'groupHistory', groupId: second }
    }
    if (head === 'new-group' && parts.length === 1) return { kind: 'createGroup' }
    // Reachable by anyone who types it; the screen and the server both refuse
    // a non-moderator, so the route needs no gate of its own.
    if (head === 'moderation' && parts.length === 1) return { kind: 'moderation' }
    // Your own tokens only; signed out it is just a path that needs sign-in.
    if (head === 'rewards' && parts.length === 1) return { kind: 'rewards' }
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
