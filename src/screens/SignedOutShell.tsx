import { useEffect, useState } from 'react'
import { Logo } from '../components/Logo'
import { AuthScreen } from './AuthScreen'
import { DiscoverScreen } from './DiscoverScreen'
import { TitleDetailScreen } from './TitleDetailScreen'
import { OpenGroups } from '../components/OpenGroups'
import { CtaButton } from '../components/ui'
import { getAuthLinkError } from '../lib/authLinks'

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

type View = { kind: 'discover' } | { kind: 'groups' } | { kind: 'title'; tmdbId: number; mediaType: 'movie' | 'tv' }

export function SignedOutShell() {
  const [authOpen, setAuthOpen] = useState(() => getAuthLinkError() !== null)
  const [view, setView] = useState<View>({ kind: 'discover' })

  useEffect(() => {
    const onError = () => setAuthOpen(true)
    window.addEventListener('mp:auth-link-error', onError)
    return () => window.removeEventListener('mp:auth-link-error', onError)
  }, [])

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
            aria-label="Sign in or create an account"
            className="ml-auto flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-gold px-4 text-[13px] font-bold text-bg ring-2 ring-gold/30 ring-offset-2 ring-offset-bg transition-transform active:scale-95"
          >
            <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>
            Get started
          </button>
        </header>

        {view.kind === 'groups' ? <main><button type="button" onClick={() => setView({ kind: 'discover' })} className="mb-4 min-h-11 text-[13px] text-muted">← Back to browsing</button><h2 className="mb-5 font-display text-[28px] font-semibold">Find your movie-night group</h2><OpenGroups userId={null} onSignIn={() => setAuthOpen(true)} /></main> : view.kind === 'discover' ? (
          <main key="discover">
            <section className="mp-rise mb-6">
              <h2 className="font-display text-[28px] font-semibold leading-tight">Your taste. Your people.</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">Create your rubric, find a group, and compare your takes after the Reveal.</p>
              <CtaButton onClick={() => setAuthOpen(true)} className="mt-4 min-h-12 w-full px-4 text-[14px]">Sign in or create an account</CtaButton>
              <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[12px] text-muted">Or keep browsing below.</p><button type="button" onClick={() => setView({ kind: 'groups' })} className="min-h-11 text-[13px] font-semibold text-teal">Browse groups →</button></div>
            </section>
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
