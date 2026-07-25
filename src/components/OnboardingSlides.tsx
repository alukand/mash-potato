import { useRef, useState } from 'react'
import { Logo } from './Logo'
import { CtaButton } from './ui'
import { ScoreRing } from './ScoreRing'
import { TASTE_MODES } from '../lib/rubricCatalog'
import type { TasteMode } from '../lib/rubricCatalog'

interface OnboardingSlidesProps {
  /** Done: true = jump into creating a group, false = explore first.
   *  tasteMode is the picker's final state (preselected casual). */
  onDone: (createGroup: boolean, tasteMode: TasteMode) => void
}

// Each slide teaches with a LIVE miniature of the real product, built from
// the same recipes the app uses (cards, slider fills, the ScoreRing, the
// clash headline). Mockups replay their entrance every time their slide
// becomes active (keyed remount); reduced-motion collapses everything.

const CREW = [
  { initial: 'E', color: '#51c5be' },
  { initial: 'M', color: '#e7b24e' },
  { initial: 'J', color: '#e07a5f' },
]

function CrewMock({ active }: { active: boolean }) {
  return (
    <div key={active ? 'on' : 'off'} className="flex flex-col items-center">
      <div className="flex -space-x-2.5">
        {CREW.map((m, i) => (
          <span
            key={m.initial}
            className={active ? 'mp-pop' : ''}
            style={{ animationDelay: `${i * 140}ms` }}
          >
            <span
              className="grid h-14 w-14 place-items-center rounded-full border-[3px] border-bg font-display text-[20px] font-semibold text-bg"
              style={{ backgroundColor: m.color }}
            >
              {m.initial}
            </span>
          </span>
        ))}
      </div>
      <span
        className={`mt-4 flex items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-4 py-1.5 ${
          active ? 'mp-pop' : ''
        }`}
        style={{ animationDelay: '520ms' }}
      >
        <span className="tabular font-display text-[22px] font-semibold leading-none text-teal">
          8.2
        </span>
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-teal">
          Mashed
        </span>
      </span>
    </div>
  )
}

const BLIND_ROWS = [
  { label: 'Story', value: 8, width: 0.78 },
  { label: 'Pacing', value: 4, width: 0.34 },
  { label: 'Humor', value: 9, width: 0.9 },
]

function BlindMock({ active }: { active: boolean }) {
  return (
    <div key={active ? 'on' : 'off'} className="mp-card w-[248px] rounded-2xl px-4 py-3">
      {BLIND_ROWS.map((row, i) => (
        <div key={row.label} className={`py-2 ${i > 0 ? 'border-t border-line/50' : ''}`}>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium">{row.label}</span>
            <span
              className={`tabular font-mono text-[12px] font-semibold text-gold ${
                active ? 'mp-pop' : ''
              }`}
              style={{ animationDelay: `${260 + i * 180}ms` }}
            >
              {row.value}/10
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full ${active ? 'mp-grow-x' : ''}`}
              style={{
                width: `${row.width * 100}%`,
                animationDelay: `${140 + i * 180}ms`,
                backgroundImage: 'linear-gradient(90deg, #b98a35, #e7b24e)',
              }}
            />
          </div>
        </div>
      ))}
      <div
        className={`mt-2 flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-muted ${
          active ? 'mp-pop' : ''
        }`}
        style={{ animationDelay: '900ms' }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="4" y="10" width="16" height="11" rx="2.5" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        Locked, hidden from the group
      </div>
    </div>
  )
}

function RevealMock({ active }: { active: boolean }) {
  return (
    <div key={active ? 'on' : 'off'} className="flex flex-col items-center">
      {active ? <ScoreRing value={8.2} size={112} stroke={9} /> : <div className="h-[112px]" />}
      <p
        className={`mt-3 font-display text-[17px] font-medium leading-snug ${
          active ? 'mp-rise' : ''
        }`}
        style={{ animationDelay: '650ms' }}
      >
        United on <span className="font-semibold text-teal">Story</span>.
      </p>
      <p
        className={`font-display text-[17px] font-medium leading-snug ${active ? 'mp-rise' : ''}`}
        style={{ animationDelay: '900ms' }}
      >
        Split over <span className="font-semibold text-coral">Pacing</span>.
      </p>
    </div>
  )
}

const VOTE_ROWS = [
  { label: 'Spirited Away', share: 0.72, winner: true },
  { label: 'Akira', share: 0.28, winner: false },
]

function NightsMock({ active }: { active: boolean }) {
  return (
    <div key={active ? 'on' : 'off'} className="mp-card w-[248px] rounded-2xl px-4 py-3">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-muted">
        What&apos;s next?
      </p>
      {VOTE_ROWS.map((row, i) => (
        <div key={row.label} className="mt-2.5">
          <div className="flex items-baseline justify-between">
            <span
              className={`text-[12px] font-medium ${row.winner ? 'text-teal' : ''} ${
                active ? 'mp-rise' : ''
              }`}
              style={{ animationDelay: `${i * 160}ms` }}
            >
              {row.label}
            </span>
            {row.winner && (
              <span
                className={`font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-teal ${
                  active ? 'mp-pop' : ''
                }`}
                style={{ animationDelay: '820ms' }}
              >
                Tonight
              </span>
            )}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full ${active ? 'mp-grow-x' : ''}`}
              style={{
                width: `${row.share * 100}%`,
                animationDelay: `${220 + i * 160}ms`,
                backgroundColor: row.winner ? '#51c5be' : '#352b42',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

const CASUAL_MOCK_ROWS = [
  { label: 'Enjoyment', width: 0.86 },
  { label: 'Acting', width: 0.6 },
  { label: 'Writing', width: 0.52 },
]

const BUFF_MOCK_ROWS = [
  { label: 'Story', width: 0.74 },
  { label: 'Acting', width: 0.6 },
  { label: 'Writing', width: 0.55 },
  { label: 'Cinematography', width: 0.8 },
  { label: 'Pacing', width: 0.45 },
  { label: 'Score', width: 0.66 },
  { label: 'Impact', width: 0.7 },
]

// The picker slide's miniature IS the choice: two mini scorecards, tap the
// one that sounds like you. Preselected Normie; switchable forever after.
function TasteMock({
  active,
  selected,
  onSelect,
}: {
  active: boolean
  selected: TasteMode
  onSelect: (mode: TasteMode) => void
}) {
  return (
    <div key={active ? 'on' : 'off'} className="flex items-stretch gap-3">
      {(['casual', 'buff'] as const).map((mode, i) => {
        const rows = mode === 'casual' ? CASUAL_MOCK_ROWS : BUFF_MOCK_ROWS
        const picked = selected === mode
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onSelect(mode)}
            aria-pressed={picked}
            className={`mp-card w-[150px] rounded-2xl px-3.5 pb-3 pt-2.5 text-left transition-all ${
              active ? 'mp-pop' : ''
            } ${picked ? 'ring-2 ring-teal/60' : 'opacity-80 hover:opacity-100'}`}
            style={{ animationDelay: `${i * 160}ms` }}
          >
            <span className="flex items-center justify-between">
              <span
                className={`font-mono text-[9px] font-bold uppercase tracking-[0.18em] ${
                  picked ? 'text-teal' : 'text-muted'
                }`}
              >
                {TASTE_MODES[mode].plural}
              </span>
              {picked && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-teal" aria-hidden>
                  <path d="m4.5 12.5 5 5 10-11" />
                </svg>
              )}
            </span>
            {rows.map((row) => (
              <span key={row.label} className="mt-1.5 block">
                <span
                  className={`block truncate font-medium ${
                    mode === 'casual' ? 'text-[11px]' : 'text-[9px]'
                  }`}
                >
                  {row.label}
                </span>
                <span
                  className={`mt-0.5 block overflow-hidden rounded-full bg-surface-2 ${
                    mode === 'casual' ? 'h-1.5' : 'h-1'
                  }`}
                >
                  <span
                    className={`block h-full rounded-full ${active ? 'mp-grow-x' : ''}`}
                    style={{
                      width: `${row.width * 100}%`,
                      backgroundImage: 'linear-gradient(90deg, #b98a35, #e7b24e)',
                    }}
                  />
                </span>
              </span>
            ))}
          </button>
        )
      })}
    </div>
  )
}

function StartMock({ active }: { active: boolean }) {
  return (
    <div key={active ? 'on' : 'off'} className="flex flex-col items-center">
      <span className={active ? 'mp-pop' : ''}>
        <Logo className="h-20 w-20" />
      </span>
      <div
        className={`mt-4 flex items-center gap-1 rounded-full border border-line bg-surface p-1 ${
          active ? 'mp-rise' : ''
        }`}
        style={{ animationDelay: '300ms' }}
      >
        {['Home', 'Discover', 'Rate', 'Profile'].map((label, i) => (
          <span
            key={label}
            className={`rounded-full px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${
              i === 2 ? 'bg-teal/10 text-teal' : 'text-muted'
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

interface Slide {
  key: string
  title: string
  body: string
  mock: (active: boolean) => React.ReactNode
}

const SLIDES: Slide[] = [
  {
    key: 'together',
    title: 'Movie night, scored together',
    body: 'Mash Potato is for your movie crew. Everyone rates what you watched, and it mashes into one score for the group.',
    mock: (active) => <CrewMock active={active} />,
  },
  {
    key: 'blind',
    title: 'Everyone scores blind',
    body: 'Each of you rates the categories privately, with your own one-line take. Nobody sees a number until the end, so nobody anchors the room.',
    mock: (active) => <BlindMock active={active} />,
  },
  {
    key: 'reveal',
    title: 'Then the Reveal drops',
    body: 'All the scores land at once. Where you agreed and where you clashed becomes the headline, and the argument is the fun part.',
    mock: (active) => <RevealMock active={active} />,
  },
  {
    key: 'nights',
    title: 'Plan the nights ahead',
    body: 'Search films and shows together, build watchlists with your group, and settle what to watch next with a vote.',
    mock: (active) => <NightsMock active={active} />,
  },
  {
    key: 'taste',
    title: 'How do you like to score?',
    body: 'Normies make three quick calls, and enjoyment counts most. Cinephiles work the full craft rubric. Every title shows both crowds, and you can switch anytime from your profile.',
    // rendered specially below: the miniature is the picker
    mock: () => null,
  },
  {
    key: 'start',
    title: 'Start with your people',
    body: 'Create a group and add friends by name, or explore solo and get added later. We point out the tabs when you land.',
    mock: (active) => <StartMock active={active} />,
  },
]

// First-run explainer: five swipeable slides, each with a live miniature of
// the product. Swipe or tap through; the last slide offers the two real
// paths in. State-driven transform rather than scroll-snap: programmatic
// smooth scroll is unreliable on mandatory-snap containers, and buttons must
// always work.
export function OnboardingSlides({ onDone }: OnboardingSlidesProps) {
  const touchX = useRef<number | null>(null)
  const [index, setIndex] = useState(0)
  const [tasteMode, setTasteMode] = useState<TasteMode>('casual')
  const last = index === SLIDES.length - 1

  function goTo(i: number) {
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, i)))
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe mx-auto flex w-full max-w-[480px] items-center justify-between px-6 pb-2 pt-4">
        <div className="flex items-center gap-2.5">
          <Logo className="h-9 w-9" />
          <span className="font-display text-[20px] font-semibold tracking-tight">Mash Potato</span>
        </div>
        {!last && (
          <button
            type="button"
            onClick={() => onDone(false, tasteMode)}
            className="rounded-full border border-line px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
          >
            Skip
          </button>
        )}
      </header>

      <div
        className="flex-1 overflow-hidden"
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (dx < -40) goTo(index + 1)
          else if (dx > 40) goTo(index - 1)
        }}
      >
        <div
          className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {SLIDES.map((slide, i) => (
            <section
              key={slide.key}
              aria-hidden={i !== index}
              className="grid w-full shrink-0 place-items-center px-8"
            >
              <div className="mx-auto flex max-w-[380px] flex-col items-center text-center">
                <div className="grid min-h-[190px] place-items-center">
                  {slide.key === 'taste' ? (
                    <TasteMock active={i === index} selected={tasteMode} onSelect={setTasteMode} />
                  ) : (
                    slide.mock(i === index)
                  )}
                </div>
                <h2 className="mt-5 font-display text-[30px] font-semibold leading-[1.1] tracking-tight">
                  {slide.title}
                </h2>
                <p className="mt-3.5 text-[15px] leading-relaxed text-muted">{slide.body}</p>
              </div>
            </section>
          ))}
        </div>
      </div>

      <footer className="pb-safe mx-auto w-full max-w-[480px] px-8">
        <div className="mb-5 flex items-center justify-center gap-2">
          {SLIDES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-teal' : 'w-1.5 bg-line'
              }`}
            />
          ))}
        </div>
        {last ? (
          <>
            <CtaButton onClick={() => onDone(true, tasteMode)} className="w-full py-3.5 text-[15px]">
              Create your first group
            </CtaButton>
            <button
              type="button"
              onClick={() => onDone(false, tasteMode)}
              className="mt-3 w-full rounded-full border border-line py-3 text-[13px] font-semibold text-muted transition-colors hover:text-text"
            >
              Explore first, group up later
            </button>
          </>
        ) : (
          <CtaButton tone="teal" onClick={() => goTo(index + 1)} className="w-full py-3.5 text-[15px]">
            Next
          </CtaButton>
        )}
      </footer>
    </div>
  )
}
