import type { ReactNode } from 'react'

function Tab({
  label,
  active = false,
  children,
}: {
  label: string
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
        active ? 'text-teal' : 'text-muted hover:text-text'
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

// Static app-shell nav — makes this read as a real mobile app, not a page.
export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[480px] items-stretch gap-1 border-t border-line px-5 pt-1.5 backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in oklab, var(--color-surface) 82%, transparent)',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <Tab label="Home" active>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
        </svg>
      </Tab>
      <Tab label="Rate">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z" />
        </svg>
      </Tab>
      <Tab label="Group">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.6a3 3 0 0 1 0 5.4" />
          <path d="M17 14.3a5.5 5.5 0 0 1 3.5 4.7" />
        </svg>
      </Tab>
    </nav>
  )
}
