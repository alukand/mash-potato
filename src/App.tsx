import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { fetchMyGroup, fetchMembers } from './lib/api'
import type { GroupInfo, MemberInfo } from './lib/api'
import { AVATAR_PALETTE } from './lib/palette'
import { Logo } from './components/Logo'
import { BottomNav } from './components/BottomNav'
import type { TabId } from './components/BottomNav'
import { AuthScreen } from './screens/AuthScreen'
import { CreateGroupScreen } from './screens/CreateGroupScreen'
import { HomeScreen } from './screens/HomeScreen'
import { RateScreen } from './screens/RateScreen'
import { GroupScreen } from './screens/GroupScreen'

// App shell: auth gate -> group bootstrap -> tabbed app.
// Group tab is fully live; Home/Rate still run on sample sessions until the
// sessions/scores milestone.

function Splash({ note }: { note?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="mp-rise flex flex-col items-center">
        <Logo className="h-14 w-14" />
        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
          {note ?? 'warming up'}
        </p>
      </div>
    </div>
  )
}

function App() {
  const [tab, setTab] = useState<TabId>('home')
  // undefined = still resolving; null = signed out / no group
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [group, setGroup] = useState<GroupInfo | null | undefined>(undefined)
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setTab('home')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setGroup(undefined)
      setMembers([])
      setLoadError(null)
      return
    }
    let cancelled = false
    setGroup(undefined)
    fetchMyGroup(session.user.id)
      .then((g) => !cancelled && setGroup(g))
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load your group')
      })
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    if (!group) {
      setMembers([])
      return
    }
    let cancelled = false
    fetchMembers(group.id)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => !cancelled && setMembers([]))
    return () => {
      cancelled = true
    }
  }, [group])

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
  if (group === undefined) return <Splash note="finding your crew" />
  if (group === null) {
    return <CreateGroupScreen userId={session.user.id} onCreated={setGroup} />
  }

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-[480px] px-5 pb-32">
        {/* ---- Header (live group) ---- */}
        <header className="flex items-center justify-between pt-7 pb-5">
          <div className="flex items-center gap-2.5">
            <Logo className="h-9 w-9" />
            <div className="min-w-0">
              <h1 className="truncate font-display text-[26px] font-semibold leading-none tracking-tight">
                {group.name}
              </h1>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Mash Potato · {members.length || 1} member{members.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 -space-x-2">
            {members.map((m, i) => (
              <span
                key={m.userId}
                title={m.displayName}
                className="grid h-7 w-7 place-items-center rounded-full border-2 border-bg font-mono text-[10px] font-bold text-bg"
                style={{ backgroundColor: AVATAR_PALETTE[i % AVATAR_PALETTE.length] }}
              >
                {m.displayName.charAt(0).toUpperCase()}
              </span>
            ))}
          </div>
        </header>

        {/* key remounts the screen on tab change so the entrance plays again */}
        <main key={tab}>
          {tab === 'home' && <HomeScreen />}
          {tab === 'rate' && <RateScreen />}
          {tab === 'group' && (
            <GroupScreen group={group} members={members} userId={session.user.id} />
          )}
        </main>

        <p className="mt-7 text-center font-mono text-[10px] text-muted">
          M4 · auth &amp; group live · sessions still sample data
        </p>
      </div>

      <BottomNav active={tab} onSelect={setTab} />
    </div>
  )
}

export default App
