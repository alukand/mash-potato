import { useState } from 'react'
import { Logo } from '../components/Logo'
import { AuthScreen } from './AuthScreen'
import { DiscoverScreen } from './DiscoverScreen'
import { TitleDetailScreen } from './TitleDetailScreen'

// App Store guideline 5.1.1(v): an app may require an account for
// account-based features, but NOT for the rest. Browsing the catalogue is not
// account based, so signed out the app opens on Discover — the full TMDB
// lineup, search, filters, and title pages with cast, overview and where to
// watch — and asks for an account only at the point a feature genuinely needs
// one (rating, saving, groups, messages, discussion).
//
// Deliberately self-contained: the signed-in shell in App.tsx (tabs, groups,
// members, URL sync, push routing, tour) all assumes a session, and threading
// `null` through it would put a sign-in branch in dozens of places. This is
// the whole signed-out surface in one file.

type View = { kind: 'discover' } | { kind: 'title'; tmdbId: number; mediaType: 'movie' | 'tv' }

export function SignedOutShell() {
  const [authOpen, setAuthOpen] = useState(false)
  const [view, setView] = useState<View>({ kind: 'discover' })

  if (authOpen) return <AuthScreen onBack={() => setAuthOpen(false)} />

  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-[480px] px-5 pb-16">
        <header className="pt-safe flex items-center gap-2.5 pb-5">
          <Logo className="h-9 w-9 shrink-0" />
          <h1 className="truncate font-display text-[24px] font-semibold leading-none tracking-tight">
            Mash Potato
          </h1>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="ml-auto shrink-0 rounded-full border border-teal/40 bg-teal/10 px-4 py-2 text-[13px] font-semibold text-teal transition-colors hover:bg-teal/20"
          >
            Sign in
          </button>
        </header>

        {view.kind === 'discover' ? (
          <main key="discover">
            <DiscoverScreen
              userId={null}
              onOpenTitle={(tmdbId, mediaType) => {
                setView({ kind: 'title', tmdbId, mediaType })
                window.scrollTo(0, 0)
              }}
            />
          </main>
        ) : (
          <main key={`title:${view.mediaType}:${view.tmdbId}`} className="-mx-5">
            <TitleDetailScreen
              tmdbId={view.tmdbId}
              mediaType={view.mediaType}
              groups={[]}
              userId={null}
              onSignIn={() => setAuthOpen(true)}
              onBack={() => {
                setView({ kind: 'discover' })
                window.scrollTo(0, 0)
              }}
              onStartedSession={() => setAuthOpen(true)}
            />
          </main>
        )}
      </div>
    </div>
  )
}
