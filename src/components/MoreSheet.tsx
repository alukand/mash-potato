import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchAmModerator } from '../lib/api'

/**
 * The "More" menu.
 *
 * Everything in here already existed and was reachable only from somewhere
 * cramped: Messages lived in a single header icon, starting a group was buried
 * on Profile, and the report queue sat inside Profile's settings cluster. None
 * of these earned a tab of their own, which is exactly what a More menu is for.
 *
 * It is a sheet rather than a fifth tab so it costs no URL, no stored-tab
 * migration, and no base tab — and so it opens OVER what you were doing instead
 * of navigating away from it.
 */

function Row({
  icon,
  label,
  hint,
  badge,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-2xl px-3 py-3 text-left transition-colors active:bg-surface-2"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line/70 bg-surface-2/50 text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[15px] font-medium">{label}</span>
          {badge != null && badge > 0 && (
            <span className="rounded-full bg-coral px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-bg">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{hint}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted" aria-hidden>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  )
}

interface MoreSheetProps {
  unread: number
  onMessages: () => void
  onNewGroup: () => void
  onModeration: () => void
  onClose: () => void
}

export function MoreSheet({
  unread,
  onMessages,
  onNewGroup,
  onModeration,
  onClose,
}: MoreSheetProps) {
  // Asked for only when the menu opens: almost nobody is a moderator, and this
  // is one RPC that would otherwise run on every app start for nothing.
  const [amModerator, setAmModerator] = useState(false)
  useEffect(() => {
    void fetchAmModerator()
      .then(setAmModerator)
      .catch(() => setAmModerator(false))
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="More"
        className="mp-card max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[26px] px-4 pb-safe pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" aria-hidden />

        <Row
          icon={
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="m3.5 7 8.5 6 8.5-6" />
            </svg>
          }
          label="Messages"
          hint="Your inbox, group chats and requests"
          badge={unread}
          onClick={onMessages}
        />

        <Row
          icon={
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="9" cy="8" r="3.4" />
              <path d="M3 19a6 6 0 0 1 12 0" />
              <path d="M18 7.5v6M15 10.5h6" />
            </svg>
          }
          label="Start a new group"
          hint="Pick a rubric and invite the people you watch with"
          onClick={onNewGroup}
        />

        {/* A courtesy door, not a gate — every RPC behind it re-checks the role. */}
        {amModerator && (
          <Row
            icon={
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 21V4M5 4h11l-1.5 3.5L16 11H5" />
              </svg>
            }
            label="Reports"
            hint="Reported comments and messages, and what was done about them"
            onClick={onModeration}
          />
        )}

        <div className="mt-2 flex items-center justify-center gap-4 border-t border-line/60 px-3 pb-3 pt-3.5">
          <a
            href="https://mashpotato.app/terms"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-muted transition-colors hover:text-text"
          >
            Terms
          </a>
          <span className="text-line" aria-hidden>
            ·
          </span>
          <a
            href="https://mashpotato.app/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-muted transition-colors hover:text-text"
          >
            Privacy
          </a>
          <span className="text-line" aria-hidden>
            ·
          </span>
          <a
            href="https://mashpotato.app/support"
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-muted transition-colors hover:text-text"
          >
            Support
          </a>
          <span className="text-line" aria-hidden>
            ·
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] text-muted transition-colors hover:text-text"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
