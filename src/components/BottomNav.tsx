import type { ReactNode } from 'react'

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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    id: 'discover',
    label: 'Discover',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
      </svg>
    ),
  },
  {
    id: 'rate',
    label: 'Rate',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    ),
  },
]

interface BottomNavProps {
  active: TabId
  onSelect: (tab: TabId) => void
  /** First-run tour: this tab breathes a gold ring while it's being shown. */
  highlight?: TabId | null
}

// Floating pill nav.
export function BottomNav({ active, onSelect, highlight = null }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-5 z-20 mx-auto flex max-w-[400px] items-center gap-1 rounded-full border border-line p-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      style={{
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
        backgroundColor: 'color-mix(in oklab, var(--color-surface) 88%, transparent)',
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active
        const isHighlighted = tab.id === highlight
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            // the first-run tour cuts its spotlight around these
            data-tour={`tab-${tab.id}`}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[11px] font-semibold transition-colors ${
              isHighlighted ? 'mp-tour-pulse' : ''
            } ${
              isActive
                ? 'bg-teal/10 text-teal shadow-[inset_0_0_0_1px_rgba(81,197,190,0.25),0_0_16px_-6px_rgba(81,197,190,0.55)]'
                : 'text-muted hover:text-text'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
