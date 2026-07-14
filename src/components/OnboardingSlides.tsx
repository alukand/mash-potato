import { useRef, useState } from 'react'
import { Logo } from './Logo'
import { CtaButton } from './ui'

interface OnboardingSlidesProps {
  /** Done: true = jump into creating a group, false = explore first. */
  onDone: (createGroup: boolean) => void
}

interface Slide {
  key: string
  title: string
  body: string
  glyph: React.ReactNode
}

const glyphStroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const SLIDES: Slide[] = [
  {
    key: 'together',
    title: 'Movie night, scored together',
    body: 'Mash Potato is for your movie group. Everyone rates what you watched, and your group’s taste becomes one score you’ll actually argue about less.',
    glyph: (
      <svg width="72" height="72" viewBox="0 0 48 48" {...glyphStroke} className="text-teal" aria-hidden>
        <circle cx="17" cy="20" r="7" />
        <circle cx="31" cy="20" r="7" className="text-gold" stroke="currentColor" />
        <path d="M8 38c1.5-5 5-8 9-8s7.5 3 9 8M22 38c1.5-5 5-8 9-8s7.5 3 9 8" />
      </svg>
    ),
  },
  {
    key: 'blind',
    title: 'Everyone scores blind',
    body: 'After the movie, each of you rates the categories privately. Nobody sees anyone else’s numbers until the end, so nobody anchors the room.',
    glyph: (
      <svg width="72" height="72" viewBox="0 0 48 48" {...glyphStroke} className="text-muted" aria-hidden>
        <rect x="12" y="21" width="24" height="17" rx="4" />
        <path d="M17 21v-5a7 7 0 0 1 14 0v5" />
        <circle cx="24" cy="29" r="2" className="text-gold" stroke="currentColor" />
      </svg>
    ),
  },
  {
    key: 'reveal',
    title: 'Then comes the Reveal',
    body: 'All the scores drop at once and mash into one Mashed score. Where you agreed and where you clashed becomes the night’s headline.',
    glyph: (
      <svg width="72" height="72" viewBox="0 0 48 48" {...glyphStroke} className="text-teal" aria-hidden>
        <circle cx="24" cy="24" r="10" />
        <path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M38.1 9.9l-4.2 4.2M14.1 33.9l-4.2 4.2" />
      </svg>
    ),
  },
  {
    key: 'yours',
    title: 'The rubric is yours',
    body: 'Your group decides what matters: Story, Acting, Emotional Impact, and more, each with its own weight. Comedy nights weigh Humor heavy; horror nights, Fear Factor.',
    glyph: (
      <svg width="72" height="72" viewBox="0 0 48 48" {...glyphStroke} className="text-gold" aria-hidden>
        <path d="M10 14h28M10 24h28M10 34h28" className="text-muted" stroke="currentColor" />
        <circle cx="30" cy="14" r="4" fill="var(--color-bg)" />
        <circle cx="17" cy="24" r="4" fill="var(--color-bg)" />
        <circle cx="35" cy="34" r="4" fill="var(--color-bg)" />
      </svg>
    ),
  },
  {
    key: 'start',
    title: 'Start with your people',
    body: 'Create a group and add friends by name, or have a friend add you to theirs. Either way, you can explore titles and build playlists right now.',
    glyph: (
      <svg width="72" height="72" viewBox="0 0 48 48" {...glyphStroke} className="text-teal" aria-hidden>
        <circle cx="24" cy="24" r="16" />
        <path d="M24 16v16M16 24h16" />
      </svg>
    ),
  },
]

// First-run explainer: five swipeable slides instead of a forced create-group
// form. Swipe or tap through; the last slide offers the two real paths in
// (create a group, or explore and get added by a friend). State-driven
// transform rather than scroll-snap: programmatic smooth scroll is unreliable
// on mandatory-snap containers, and buttons must always work.
export function OnboardingSlides({ onDone }: OnboardingSlidesProps) {
  const touchX = useRef<number | null>(null)
  const [index, setIndex] = useState(0)
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
            onClick={() => onDone(false)}
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
                <div className="grid h-28 w-28 place-items-center rounded-[32px] border border-line/60 bg-surface">
                  {slide.glyph}
                </div>
                <h2 className="mt-6 font-display text-[30px] font-semibold leading-[1.1] tracking-tight">
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
            <CtaButton onClick={() => onDone(true)} className="w-full py-3.5 text-[15px]">
              Create your first group
            </CtaButton>
            <button
              type="button"
              onClick={() => onDone(false)}
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
