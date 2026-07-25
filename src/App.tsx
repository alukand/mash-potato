import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import {
  fetchInbox,
  fetchMyGroups,
  fetchMembers,
  onInboxChange,
  updateMyTasteMode,
} from './lib/api'
import type { GroupInfo, MemberInfo } from './lib/api'
import type { TasteMode } from './lib/rubricCatalog'
import {
  clearToured,
  pickActiveGroup,
  readOnboarded,
  readStoredGroupId,
  readStoredTab,
  readToured,
  storeGroupId,
  storeOnboarded,
  storeTab,
  storeToured,
  touchRecentGroup,
} from './lib/activeGroup'
import { bindPushOpenHandler, enablePush } from './lib/push'
import { Logo } from './components/Logo'
import { BottomNav } from './components/BottomNav'
import { FirstRunTour } from './components/FirstRunTour'
import { OnboardingSlides } from './components/OnboardingSlides'
import { CtaButton, HEADER_ACTION_ID, MessagesButton } from './components/ui'
import { MessagesScreen } from './screens/MessagesScreen'
import { ThreadScreen } from './screens/ThreadScreen'
import type { TabId } from './components/BottomNav'
import { AuthScreen } from './screens/AuthScreen'
import { CreateGroupScreen } from './screens/CreateGroupScreen'
import { HomeScreen } from './screens/HomeScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { GroupScreen } from './screens/GroupScreen'
import { PlaylistScreen } from './screens/PlaylistScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { PublicProfileScreen } from './screens/PublicProfileScreen'
import { TitleDetailScreen } from './screens/TitleDetailScreen'

// App shell: auth gate -> group bootstrap -> tabbed app, with a lightweight
// view-stack (no router) so a title's detail page, the profile, or a
// create-group form can open over any tab and pop back.

// A view pushed over the tabs. Tapping a bottom tab clears the whole stack.
type StackView =
  | {
      kind: 'title'
      tmdbId: number
      mediaType: 'movie' | 'tv'
      /** Open the discussion on this group's thread (reveal deep link). */
      discussGroupId?: string
      /** Composer placeholder seed (the reveal's clash headline). */
      discussSeed?: string
    }
  | { kind: 'createGroup' }
  | { kind: 'user'; userId: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'messages' }
  | { kind: 'thread'; conversationId: string }

function stackKey(v: StackView): string {
  if (v.kind === 'title') return `title:${v.tmdbId}:${v.mediaType}`
  if (v.kind === 'user') return `user:${v.userId}`
  if (v.kind === 'playlist') return `playlist:${v.playlistId}`
  if (v.kind === 'thread') return `thread:${v.conversationId}`
  return v.kind
}

// The Rate and Group tabs need a group; before one exists they teach the two
// ways in instead of gating the whole app.
function NoGroupYet({
  headline,
  note,
  onCreate,
}: {
  headline: string
  note: string
  onCreate: () => void
}) {
  return (
    <section className="mp-rise mp-card rounded-[26px] p-6 text-center">
      <h2 className="font-display text-[24px] font-semibold leading-tight">{headline}</h2>
      <p className="mt-2 text-[13px] leading-snug text-muted">{note}</p>
      <CtaButton onClick={onCreate} className="mt-5 w-full py-3 text-[14px]">
        Create a group
      </CtaButton>
      <p className="mt-3 text-[13px] leading-snug text-muted">
        Joining a friend's group instead? Ask them to add you; they can find you by your name.
      </p>
    </section>
  )
}

function Splash({ note }: { note?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="mp-rise flex flex-col items-center">
        <Logo className="h-14 w-14" />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
          {note ?? 'loading'}
        </p>
      </div>
    </div>
  )
}

function App() {
  const [tab, setTab] = useState<TabId>(() => readStoredTab() ?? 'home')
  // undefined = still resolving; null = signed out / no groups
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [groups, setGroups] = useState<GroupInfo[] | undefined>(undefined)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [stack, setStack] = useState<StackView[]>([])
  /** Unread across every conversation, for the header envelope's dot. */
  const [unreadTotal, setUnreadTotal] = useState(0)
  // First-run tab walkthrough: dims the app, pulses each tab in turn.
  const [tourActive, setTourActive] = useState(false)
  const [tourTab, setTourTab] = useState<TabId>('home')
  const [loadError, setLoadError] = useState<string | null>(null)
  // A notification tap names its target before groups have loaded; park it here.
  const [pushTarget, setPushTarget] = useState<{
    groupId: string | null
    tmdbId: number | null
    mediaType: 'movie' | 'tv' | null
  } | null>(null)
  // First run: the slides show once per device, then the app opens group-less.
  const [onboarded, setOnboarded] = useState(() => readOnboarded())
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  // What the onboarding picker chose, handed straight to CreateGroupScreen.
  const [pickedTasteMode, setPickedTasteMode] = useState<TasteMode | null>(null)

  // The active group: the stored/selected one, else the oldest, else null.
  const group =
    groups && groups.length > 0
      ? (groups.find((g) => g.id === activeGroupId) ?? groups[0])
      : null

  const lastUidRef = useRef<string | null>(null)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      lastUidRef.current = data.session?.user.id ?? null
      setSession(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Reset navigation only when WHO is signed in changes. Token refreshes
      // and same-user re-auth (the current-password check) fire SIGNED_IN
      // too, and must not yank the view out from under the user.
      const nextUid = s?.user.id ?? null
      if (nextUid !== lastUidRef.current) {
        lastUidRef.current = nextUid
        setTab('home')
        setStack([])
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // Data effects key on WHO is signed in, not the session object: token
  // refreshes and same-user re-auth mint new session objects and must not
  // blank the app back to its loading gate.
  const uid = session?.user.id ?? null

  useEffect(() => {
    if (!uid) {
      setGroups(undefined)
      setActiveGroupId(null)
      setMembers([])
      setLoadError(null)
      return
    }
    let cancelled = false
    setGroups(undefined)
    fetchMyGroups(uid)
      .then((gs) => {
        if (cancelled) return
        setGroups(gs)
        setActiveGroupId(pickActiveGroup(gs, readStoredGroupId())?.id ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load your groups')
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  // Native only (no-op in the browser): register this device for pushes once
  // signed in. Permission prompt fires here on first run.
  useEffect(() => {
    if (uid) void enablePush()
  }, [uid])

  // Unread total for the header envelope. Realtime keeps it honest without a
  // poll; a failure just leaves the dot off rather than breaking the shell.
  useEffect(() => {
    if (!uid) {
      setUnreadTotal(0)
      return
    }
    let cancelled = false
    const refresh = () => {
      void fetchInbox(false)
        .then((rows) => {
          if (!cancelled) {
            setUnreadTotal(rows.reduce((sum, r) => sum + r.unreadCount, 0))
          }
        })
        .catch(() => {})
    }
    refresh()
    const unsubscribe = onInboxChange(refresh)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [uid])

  // The first signed-in landing gets the tab walkthrough, once per device.
  // Group-less first-timers see the slides first (onboarded flips after).
  useEffect(() => {
    if (!uid || groups === undefined || showCreateGroup) return
    if (tourActive || readToured()) return
    if (!onboarded && groups.length === 0) return
    setTourActive(true)
    setTourTab('home')
    setStack([])
    setTab('home')
  }, [uid, groups, onboarded, showCreateGroup, tourActive])

  // Notification taps land on the group's round/reveal: the tap handler binds
  // at mount (cold-start taps included) and parks the group id until the
  // group list is ready.
  useEffect(() => {
    void bindPushOpenHandler()
    const onOpen = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          groupId?: string | null
          tmdbId?: number | null
          mediaType?: 'movie' | 'tv' | null
        }>
      ).detail
      if (!detail) return
      setPushTarget({
        groupId: detail.groupId ?? null,
        tmdbId: detail.tmdbId ?? null,
        mediaType: detail.mediaType ?? null,
      })
    }
    window.addEventListener('mp:push-open', onOpen)
    return () => window.removeEventListener('mp:push-open', onOpen)
  }, [])

  useEffect(() => {
    if (!pushTarget || !groups) return
    if (pushTarget.groupId && groups.some((g) => g.id === pushTarget.groupId)) {
      setActiveGroupId(pushTarget.groupId)
      storeGroupId(pushTarget.groupId)
    }
    if (pushTarget.tmdbId !== null && pushTarget.mediaType !== null) {
      // a comment reply lands on the title's discussion
      setStack([{ kind: 'title', tmdbId: pushTarget.tmdbId, mediaType: pushTarget.mediaType }])
    } else if (pushTarget.groupId && groups.some((g) => g.id === pushTarget.groupId)) {
      setStack([])
      setTab('rate')
      storeTab('rate')
      // Even when already on this tab and group, land the eye on the round.
      window.scrollTo(0, 0)
    }
    setPushTarget(null)
  }, [pushTarget, groups])

  const groupId = group?.id ?? null
  useEffect(() => {
    if (!groupId) {
      setMembers([])
      return
    }
    let cancelled = false
    fetchMembers(groupId)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => !cancelled && setMembers([]))
    return () => {
      cancelled = true
    }
  }, [groupId])

  // Refresh whatever caches identity bits (name or avatar changed on Profile).
  const refreshMembers = useCallback(() => {
    if (!groupId) return
    fetchMembers(groupId)
      .then(setMembers)
      .catch(() => {})
  }, [groupId])

  // Refetch the group list after a rename / leave / delete. If the active
  // group is gone the picker falls back (or the create-group gate shows).
  const refreshGroups = useCallback(async () => {
    if (!session) return
    const gs = await fetchMyGroups(session.user.id)
    setGroups(gs)
    setActiveGroupId((prev) => pickActiveGroup(gs, prev)?.id ?? null)
  }, [session])

  function openTitle(
    tmdbId: number,
    mediaType: 'movie' | 'tv',
    discuss?: { groupId: string; seed?: string },
  ) {
    setStack((s) => [
      ...s,
      {
        kind: 'title',
        tmdbId,
        mediaType,
        discussGroupId: discuss?.groupId,
        discussSeed: discuss?.seed,
      },
    ])
    window.scrollTo(0, 0)
  }
  function pushView(view: StackView) {
    setStack((s) => [...s, view])
    window.scrollTo(0, 0)
  }
  function popView() {
    setStack((s) => s.slice(0, -1))
  }
  function selectTab(next: TabId) {
    setStack([])
    setTab(next)
    storeTab(next)
  }
  // Switching groups stays WHERE YOU ARE (the Group tab switcher swaps the
  // group in place); flows that want a destination set the tab themselves.
  function switchGroup(id: string) {
    setActiveGroupId(id)
    storeGroupId(id)
    touchRecentGroup(id)
    setStack([])
  }

  if (loadError) {
    return (
      <div className="grid min-h-dvh place-items-center px-5">
        <div className="mp-rise flex flex-col items-center text-center">
          <Logo className="h-12 w-12" />
          <p className="mt-4 max-w-[300px] text-[13px] leading-snug text-coral">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-full border border-line px-5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted hover:text-text"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (session === undefined) return <Splash />
  if (session === null) return <AuthScreen />
  if (groups === undefined) return <Splash note="loading your groups" />
  if (!group) {
    // First run: the slides explain the app, then the user chooses their way
    // in. The app itself opens group-less; Rate and Group teach the next step.
    if (!onboarded) {
      return (
        <OnboardingSlides
          onDone={(createGroup, tasteMode) => {
            // fire and forget: the picker's state (preselected casual) becomes
            // the profile's mode; a failure just leaves the column default.
            // The pick is ALSO held in state and handed to the create-group
            // screen, which would otherwise race this write and preselect the
            // stale mode.
            void updateMyTasteMode(session.user.id, tasteMode).catch(() => {})
            setPickedTasteMode(tasteMode)
            storeOnboarded()
            setOnboarded(true)
            setShowCreateGroup(createGroup)
          }}
        />
      )
    }
    if (showCreateGroup) {
      return (
        <CreateGroupScreen
          userId={session.user.id}
          initialTasteMode={pickedTasteMode}
          onBack={() => setShowCreateGroup(false)}
          onCreated={(g) => {
            setGroups([g])
            setActiveGroupId(g.id)
            storeGroupId(g.id)
            setShowCreateGroup(false)
          }}
        />
      )
    }
    // fall through: the tabbed app with no active group
  }

  const userId = session.user.id
  const me = members.find((m) => m.userId === userId)
  const myName = me?.displayName ?? 'You'
  const top = stack[stack.length - 1]

  return (
    <div className="min-h-dvh">
      {top ? (
        <div className="mx-auto w-full max-w-[480px] pb-32">
          <div key={stackKey(top)} className="mp-rise">
            {top.kind === 'title' && (
              <TitleDetailScreen
                tmdbId={top.tmdbId}
                mediaType={top.mediaType}
                groups={groups}
                userId={userId}
                discussGroupId={top.discussGroupId ?? null}
                discussSeed={top.discussSeed ?? null}
                onBack={popView}
                onStartedSession={(groupId) => {
                  switchGroup(groupId)
                  setTab('rate')
                  storeTab('rate')
                }}
              />
            )}
            {top.kind === 'user' && (
              <PublicProfileScreen
                userId={top.userId}
                onOpenPlaylist={(id) => pushView({ kind: 'playlist', playlistId: id })}
                onBack={popView}
              />
            )}
            {top.kind === 'playlist' && (
              <PlaylistScreen
                playlistId={top.playlistId}
                userId={userId}
                groups={groups}
                onOpenTitle={openTitle}
                onOpenUser={(id) => pushView({ kind: 'user', userId: id })}
                onOpenPlaylist={(id) => pushView({ kind: 'playlist', playlistId: id })}
                onBack={popView}
                onDeleted={popView}
              />
            )}
            {top.kind === 'messages' && (
              <MessagesScreen
                userId={userId}
                onOpenThread={(conversationId) => pushView({ kind: 'thread', conversationId })}
                onBack={popView}
              />
            )}
            {top.kind === 'thread' && (
              <ThreadScreen
                conversationId={top.conversationId}
                userId={userId}
                onOpenTitle={openTitle}
                onBack={popView}
              />
            )}
            {top.kind === 'createGroup' && (
              <CreateGroupScreen
                userId={userId}
                onBack={popView}
                onCreated={(g) => {
                  setGroups((prev) => [...(prev ?? []), g])
                  setActiveGroupId(g.id)
                  storeGroupId(g.id)
                  setStack([])
                  setTab('home')
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[480px] px-5 pb-32">
          {/* ---- Header: the brand, plus one top-right slot screens fill ---- */}
          <header className="pt-safe flex items-center gap-2.5 pb-5">
            <Logo className="h-9 w-9 shrink-0" />
            <h1 className="truncate font-display text-[24px] font-semibold leading-none tracking-tight">
              Mash Potato
            </h1>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/* App owns the message centre (it is cross-tab); screens portal
                  their own settings control into the slot beside it. Keeping
                  them separate matters: React children and portal children in
                  the SAME node fight over unmount order. */}
              <MessagesButton
                unread={unreadTotal}
                onClick={() => pushView({ kind: 'messages' })}
              />
              <div id={HEADER_ACTION_ID} className="flex items-center gap-2" />
            </div>
          </header>

          {/* key remounts the screen on tab OR group change so entrances replay */}
          <main key={`${tab}:${group?.id ?? 'none'}`}>
            {tab === 'home' && (
              <HomeScreen
                groups={groups}
                userId={userId}
                onOpenGroup={(groupId, dest) => {
                  switchGroup(groupId)
                  setTab(dest)
                }}
                onOpenTitle={openTitle}
                onExplore={() => setTab('discover')}
              />
            )}
            {tab === 'discover' && <DiscoverScreen userId={userId} onOpenTitle={openTitle} />}
            {tab === 'rate' &&
              (group ? (
                <GroupScreen
                  group={group}
                  groups={groups}
                  members={members}
                  userId={userId}
                  onMembersChanged={refreshMembers}
                  onGroupsChanged={refreshGroups}
                  onOpenTitle={openTitle}
                  onOpenUser={(id) => pushView({ kind: 'user', userId: id })}
                  onSwitchGroup={switchGroup}
                  onCreateGroup={() => pushView({ kind: 'createGroup' })}
                  onOpenPlaylist={(id) => pushView({ kind: 'playlist', playlistId: id })}
                  onStartedInGroup={switchGroup}
                />
              ) : (
                <NoGroupYet
                  headline="Rating happens in a group"
                  note="Pick a title together, score it blind, then catch the Reveal as a crew."
                  onCreate={() => pushView({ kind: 'createGroup' })}
                />
              ))}
            {tab === 'profile' && (
              <ProfileScreen
                userId={userId}
                displayName={myName}
                groups={groups}
                activeGroupId={group?.id ?? null}
                onSwitchGroup={(id) => {
                  // A group tap needs a destination: land on Rate so the
                  // switch is visible (Home is group-agnostic).
                  switchGroup(id)
                  selectTab('rate')
                }}
                onCreateGroup={() => pushView({ kind: 'createGroup' })}
                onOpenTitle={openTitle}
                onOpenUser={(id) => pushView({ kind: 'user', userId: id })}
                onOpenPlaylist={(id) => pushView({ kind: 'playlist', playlistId: id })}
                onNameChanged={refreshMembers}
                onGroupsChanged={refreshGroups}
                onReplayTour={() => {
                  clearToured()
                  setStack([])
                  setTourTab('home')
                  setTab('home')
                  setTourActive(true)
                }}
              />
            )}
          </main>

        </div>
      )}

      <BottomNav active={tab} onSelect={selectTab} highlight={tourActive ? tourTab : null} />

      {tourActive && (
        <FirstRunTour
          onStep={(t) => {
            setTourTab(t)
            setTab(t)
            storeTab(t)
          }}
          onDone={() => {
            storeToured()
            setTourActive(false)
            setTab('home')
            storeTab('home')
          }}
        />
      )}
    </div>
  )
}

export default App
