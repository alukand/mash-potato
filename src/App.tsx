import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { fetchMyGroups, fetchMembers } from './lib/api'
import type { GroupInfo, MemberInfo } from './lib/api'
import { pickActiveGroup, readStoredGroupId, storeGroupId } from './lib/activeGroup'
import { colorForMember } from './lib/palette'
import { Logo } from './components/Logo'
import { BottomNav } from './components/BottomNav'
import type { TabId } from './components/BottomNav'
import { AuthScreen } from './screens/AuthScreen'
import { CreateGroupScreen } from './screens/CreateGroupScreen'
import { HomeScreen } from './screens/HomeScreen'
import { DiscoverScreen } from './screens/DiscoverScreen'
import { RateScreen } from './screens/RateScreen'
import { GroupScreen } from './screens/GroupScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { TitleDetailScreen } from './screens/TitleDetailScreen'

// App shell: auth gate -> group bootstrap -> tabbed app, with a lightweight
// view-stack (no router) so a title's detail page, the profile, or a
// create-group form can open over any tab and pop back.

// A view pushed over the tabs. Tapping a bottom tab clears the whole stack.
type StackView =
  | { kind: 'title'; tmdbId: number; mediaType: 'movie' | 'tv' }
  | { kind: 'profile' }
  | { kind: 'createGroup' }

function stackKey(v: StackView): string {
  if (v.kind === 'title') return `title:${v.tmdbId}:${v.mediaType}`
  return v.kind
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
  const [tab, setTab] = useState<TabId>('home')
  // undefined = still resolving; null = signed out / no groups
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [groups, setGroups] = useState<GroupInfo[] | undefined>(undefined)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [stack, setStack] = useState<StackView[]>([])
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // The active group: the stored/selected one, else the oldest, else null.
  const group =
    groups && groups.length > 0
      ? (groups.find((g) => g.id === activeGroupId) ?? groups[0])
      : null

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setTab('home')
      setStack([])
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setGroups(undefined)
      setActiveGroupId(null)
      setMembers([])
      setLoadError(null)
      return
    }
    let cancelled = false
    setGroups(undefined)
    fetchMyGroups(session.user.id)
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
  }, [session])

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

  const refreshMembers = useCallback(() => {
    if (!groupId) return
    fetchMembers(groupId)
      .then(setMembers)
      .catch(() => {})
  }, [groupId])

  function openTitle(tmdbId: number, mediaType: 'movie' | 'tv') {
    setStack((s) => [...s, { kind: 'title', tmdbId, mediaType }])
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
  }
  function switchGroup(id: string) {
    setActiveGroupId(id)
    storeGroupId(id)
    setStack([])
    setTab('home')
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
    // First run: no groups yet. Shown as the gate (sign-out escape hatch).
    return (
      <CreateGroupScreen
        userId={session.user.id}
        onCreated={(g) => {
          setGroups([g])
          setActiveGroupId(g.id)
          storeGroupId(g.id)
        }}
      />
    )
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
                group={group}
                userId={userId}
                onBack={popView}
                onStartedSession={() => {
                  setStack([])
                  setTab('rate')
                }}
              />
            )}
            {top.kind === 'profile' && (
              <ProfileScreen
                userId={userId}
                displayName={myName}
                groups={groups}
                activeGroupId={group.id}
                onSwitchGroup={switchGroup}
                onCreateGroup={() => pushView({ kind: 'createGroup' })}
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
          {/* ---- Header: brand first; the active group is a switchable chip ---- */}
          <header className="pt-safe flex items-center justify-between gap-3 pb-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo className="h-9 w-9 shrink-0" />
              <h1 className="truncate font-display text-[24px] font-semibold leading-none tracking-tight">
                Mash Potato
              </h1>
            </div>
            <div className="relative flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setGroupMenuOpen((o) => !o)}
                aria-label="Switch group"
                aria-expanded={groupMenuOpen}
                className={`flex max-w-[150px] items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-2 transition-colors ${
                  groupMenuOpen ? 'border-teal/60 bg-teal/10' : 'border-line bg-surface-2 hover:border-teal/50'
                }`}
              >
                <span className="truncate text-[12px] font-semibold">{group.name}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-muted transition-transform ${groupMenuOpen ? 'rotate-180' : ''}`} aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => pushView({ kind: 'profile' })}
                aria-label="Your profile"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold text-bg ring-2 ring-teal/70 transition-transform active:scale-95"
                style={{ backgroundColor: colorForMember(members, userId) }}
              >
                {myName.charAt(0).toUpperCase()}
              </button>

              {/* ---- group-switch dropdown ---- */}
              {groupMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setGroupMenuOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface-2 p-1.5 shadow-[0_24px_50px_-24px_rgba(0,0,0,0.95)]">
                    <p className="px-3 pb-1.5 pt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
                      Your groups
                    </p>
                    {groups.map((g) => {
                      const active = g.id === group.id
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setGroupMenuOpen(false)
                            if (!active) switchGroup(g.id)
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface ${
                            active ? 'text-teal' : ''
                          }`}
                        >
                          <span className="truncate text-[13px] font-semibold">{g.name}</span>
                          {active && (
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
                              <path d="m5 13 4 4 10-11" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                    <div className="my-1 h-px bg-line/60" />
                    <button
                      type="button"
                      onClick={() => {
                        setGroupMenuOpen(false)
                        pushView({ kind: 'createGroup' })
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left font-semibold text-teal transition-colors hover:bg-surface"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      <span className="text-[13px]">Create a group</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </header>

          {/* key remounts the screen on tab OR group change so entrances replay */}
          <main key={`${tab}:${group.id}`}>
            {tab === 'home' && (
              <HomeScreen
                group={group}
                members={members}
                userId={userId}
                onStartSession={() => setTab('rate')}
                onOpenTitle={openTitle}
              />
            )}
            {tab === 'discover' && <DiscoverScreen onOpenTitle={openTitle} />}
            {tab === 'rate' && (
              <RateScreen
                group={group}
                members={members}
                userId={userId}
                onGoHome={() => setTab('home')}
              />
            )}
            {tab === 'group' && (
              <GroupScreen
                group={group}
                members={members}
                userId={userId}
                onMembersChanged={refreshMembers}
              />
            )}
          </main>

        </div>
      )}

      <BottomNav active={tab} onSelect={selectTab} />
    </div>
  )
}

export default App
