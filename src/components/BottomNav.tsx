import type { CSSProperties, ReactNode } from 'react'

export type TabId = 'home' | 'discover' | 'rate' | 'profile'

interface TabDef {
  id: TabId
  label: string
  icon: ReactNode
}

const TABS: TabDef[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    id: 'discover',
    label: 'Discover',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
      </svg>
    ),
  },
  {
    // The centre of five, and the only FILLED icon in the bar. Rating is what
    // the app is for, so the star carries gold (DESIGN.md: personal numbers are
    // gold) whether or not the tab is active — it reads as a destination rather
    // than as one of four peers.
    id: 'rate',
    label: 'Rate',
    icon: (
      <svg width="29" height="29" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" className="text-gold drop-shadow-[0_2px_8px_rgba(231,178,78,0.35)]" aria-hidden>
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
]

interface BottomNavProps {
  active: TabId
  onSelect: (tab: TabId) => void
  /**
   * Opens the More menu. It is a SHEET, not a fifth tab: it holds destinations
   * that already exist elsewhere, so giving it a TabId would mean a URL, a
   * stored-tab migration and a base tab for views that already have one.
   */
  onMore: () => void
  /** Unread messages — the menu now holds Messages, so it says so. */
  unread?: number
  /** First-run tour: this tab breathes a gold ring while it's being shown. */
  highlight?: TabId | null
}

/** Icons sit in a fixed-height box so the labels below them stay on one line. */
function Item({
  icon,
  label,
  active,
  tone = 'teal',
  onClick,
  tour,
  pulse,
  dot,
}: {
  icon: ReactNode
  label: string
  active: boolean
  tone?: 'teal' | 'gold'
  onClick: () => void
  tour: string
  pulse?: boolean
  dot?: boolean
}) {
  const activeSkin = tone === 'gold' ? 'text-gold' : 'text-teal'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      // the first-run tour cuts its spotlight around these
      data-tour={tour}
      className={`mp-nav-item relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[20px] px-0.5 py-2 transition-colors ${
        pulse ? 'mp-tour-pulse' : ''
      } ${active ? activeSkin : 'text-muted hover:text-text'}`}
    >
      <span className="flex h-[29px] items-center justify-center">{icon}</span>
      <span className="text-[10px] font-semibold leading-none tracking-[0.01em]">{label}</span>
      {dot && (
        <span
          aria-hidden
          className="absolute right-[18%] top-1.5 h-2 w-2 rounded-full bg-coral shadow-[0_0_0_2px_var(--color-surface)]"
        />
      )}
    </button>
  )
}

// Floating pill nav. Labels sit UNDER the icons: five destinations will not fit
// side-by-side with their text at a tap target worth hitting.
export function BottomNav({ active, onSelect, onMore, unread = 0, highlight = null }: BottomNavProps) {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-4 z-20 mx-auto grid max-w-[420px] grid-cols-5 items-stretch rounded-[30px] border border-line p-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      style={{
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
        backgroundColor: 'color-mix(in oklab, var(--color-surface) 88%, transparent)',
      }}
    >
      <span aria-hidden className="mp-nav-marker" style={{ transform: `translateX(${TABS.findIndex((t) => t.id === active) * 100}%)`, '--nav-tone': active === 'rate' ? 'var(--color-gold)' : 'var(--color-teal)' } as CSSProperties} />
      {TABS.map((tab) => (
        <Item
          key={tab.id}
          icon={tab.icon}
          label={tab.label}
          active={tab.id === active}
          tone={tab.id === 'rate' ? 'gold' : 'teal'}
          onClick={() => onSelect(tab.id)}
          tour={`tab-${tab.id}`}
          pulse={tab.id === highlight}
        />
      ))}
      <Item
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        }
        label="More"
        // Never "active": it opens a menu over whatever you were doing rather
        // than taking you somewhere.
        active={false}
        onClick={onMore}
        tour="tab-more"
        dot={unread > 0}
      />
    </nav>
  )
}
