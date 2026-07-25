import { useEffect, useState } from 'react'
import type { TabId } from './BottomNav'
import { CtaButton } from './ui'

interface TourStep {
  tab: TabId
  /** Value of the target's data-tour attribute; the spotlight cuts around it. */
  anchor: string
  title: string
  body: string
}

// Every step names the thing to press. Anchors are data-tour attributes, so a
// step can point at any element on any screen, not just a tab.
const TOUR_STEPS: TourStep[] = [
  {
    tab: 'home',
    anchor: 'tab-home',
    title: 'Home is your overview',
    body: 'Live rounds, fresh reveals, and your saved list, across every group you are in.',
  },
  {
    tab: 'discover',
    anchor: 'tab-discover',
    title: 'Tap Discover to find the next one',
    body: 'One search covers films and shows. The shelves run deep: trending, anime, hidden gems, and rows picked from what you rate.',
  },
  {
    tab: 'rate',
    anchor: 'tab-rate',
    title: 'Tap Rate for movie night',
    body: 'Pick a title, everyone scores blind, then the Reveal drops every number at once.',
  },
  {
    tab: 'rate',
    anchor: 'settings',
    title: 'Settings sits up here',
    body: 'Same corner on every screen. This is where your group picks how it scores, and who is in it.',
  },
  {
    tab: 'profile',
    anchor: 'tab-profile',
    title: 'Profile is you',
    body: 'Your look, your groups, your playlists and friends, plus your account and data.',
  },
]

interface FirstRunTourProps {
  /** The tour drives the active tab so each step shows its real screen. */
  onStep: (tab: TabId) => void
  onDone: () => void
}

/** Where the card can sit without covering the thing we're pointing at. */
type Rect = { top: number; left: number; width: number; height: number }

const PAD = 8

// First-run walkthrough: dims the app, cuts a hole around the element each
// step is about, and shows the real screen behind. Skippable, shown once
// (mp.toured) and replayable from Profile.
export function FirstRunTour({ onStep, onDone }: FirstRunTourProps) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const current = TOUR_STEPS[step]
  const lastStep = step === TOUR_STEPS.length - 1

  // Measure the step's target. The screen behind swaps on every step, so poll
  // until it mounts rather than measuring once and giving up. Timers, not
  // requestAnimationFrame: rAF is throttled to nothing in background tabs and
  // headless runs, and this must not depend on a frame ever being painted.
  useEffect(() => {
    let tries = 0
    let timer: ReturnType<typeof setTimeout>
    setRect(null)
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${current.anchor}"]`)
      const r = el?.getBoundingClientRect()
      if (r && r.width > 0 && r.height > 0) {
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
        return true
      }
      return false
    }
    const poll = () => {
      // ~2s of retries; a missing anchor just leaves the plain dim in place.
      if (measure() || tries++ > 40) return
      timer = setTimeout(poll, 50)
    }
    poll()
    // The target can move under us (rotation, keyboard, layout settling).
    const remeasure = () => void measure()
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
    }
  }, [current.anchor, step])

  function advance() {
    if (lastStep) {
      onDone()
      return
    }
    const next = step + 1
    setStep(next)
    onStep(TOUR_STEPS[next].tab)
  }

  // Keep the card clear of the hole: below it when the target is up top,
  // above the nav otherwise.
  const cardStyle =
    rect !== null && rect.top < window.innerHeight / 2
      ? { top: rect.top + rect.height + PAD + 12 }
      : { bottom: 'calc(max(1rem, env(safe-area-inset-bottom)) + 72px)' }

  return (
    <>
      {rect ? (
        // The cutout: a transparent box at the target with a huge shadow
        // spread, so everything EXCEPT the target dims. Survives
        // prefers-reduced-motion, which flattens the pulse to nothing.
        <div
          aria-hidden
          className="pointer-events-none fixed z-10 rounded-2xl ring-2 ring-gold/70"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(11,12,16,0.78)',
          }}
        />
      ) : (
        <div className="fixed inset-0 z-10 bg-bg/70" aria-hidden />
      )}

      <div className="fixed inset-x-5 z-20 mx-auto max-w-[400px]" style={cardStyle}>
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
