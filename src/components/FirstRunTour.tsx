import { useState } from 'react'
import type { TabId } from './BottomNav'
import { CtaButton } from './ui'

interface TourStep {
  tab: TabId
  title: string
  body: string
}

const TOUR_STEPS: TourStep[] = [
  {
    tab: 'home',
    title: 'Home is your overview',
    body: 'Live rounds, fresh reveals, and your saved list, across every group you are in.',
  },
  {
    tab: 'discover',
    title: 'Discover finds the next one',
    body: 'One search covers films and shows. Shelves run deep: trending, anime, hidden gems, and rows picked from what you rate.',
  },
  {
    tab: 'rate',
    title: 'Rate is the main event',
    body: 'Pick a title, everyone scores blind, then the Reveal drops every number at once. Votes, watchlists, and your group live here too.',
  },
  {
    tab: 'profile',
    title: 'Profile is you',
    body: 'Your look, your groups, your playlists and friends, plus your account and data.',
  },
]

interface FirstRunTourProps {
  /** The tour drives the active tab so each step shows its real screen. */
  onStep: (tab: TabId) => void
  onDone: () => void
}

// First-run walkthrough: dims the app, keeps the tab bar bright, and pulses
// the tab each step is about while the real screen shows behind. Four beats,
// skippable, shown once (mp.toured).
export function FirstRunTour({ onStep, onDone }: FirstRunTourProps) {
  const [step, setStep] = useState(0)
  const current = TOUR_STEPS[step]
  const lastStep = step === TOUR_STEPS.length - 1

  function advance() {
    if (lastStep) {
      onDone()
      return
    }
    const next = step + 1
    setStep(next)
    onStep(TOUR_STEPS[next].tab)
  }

  return (
    <>
      {/* Dim layer sits UNDER the bottom nav (z-20), so the tabs stay lit. */}
      <div className="fixed inset-0 z-10 bg-bg/60" aria-hidden />
      <div
        className="fixed inset-x-5 z-20 mx-auto max-w-[400px]"
        style={{ bottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 72px)' }}
      >
        <div key={step} className="mp-rise mp-card rounded-[22px] p-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-gold">
            {step + 1} of {TOUR_STEPS.length}
          </p>
          <h2 className="mt-1.5 font-display text-[21px] font-semibold leading-tight">
            {current.title}
          </h2>
          <p className="mt-1.5 text-[13px] leading-snug text-muted">{current.body}</p>
          <div className="mt-4 flex items-center gap-2">
            <CtaButton onClick={advance} className="flex-1 py-2.5 text-[13px]">
              {lastStep ? "Let's go" : 'Next'}
            </CtaButton>
            {!lastStep && (
              <button
                type="button"
                onClick={onDone}
                className="shrink-0 rounded-full border border-line px-4 py-2.5 text-[12px] font-semibold text-muted transition-colors hover:text-text"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
