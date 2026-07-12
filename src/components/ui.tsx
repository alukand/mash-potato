import type { ReactNode } from 'react'
import { colorForGroup } from '../lib/palette'

// Shared UI recipes. One exported source for the controls every screen uses,
// so a fix in one place fixes all of them (field, CTA, group mark).

/** The app's one text-field recipe: raised surface, hairline border, teal focus. */
export const fieldClass =
  'w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-text ' +
  'placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60'

/** Compact variant for inline forms (preset names, rename fields). */
export const fieldClassSm =
  'min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] text-text ' +
  'placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60'

const CTA_TONES = {
  // gold: "act" (start / score / lock). teal: "the group's moment" (reveal / save).
  gold: {
    gradient: 'linear-gradient(180deg, #F2CD77, #DFA338)',
    shadow:
      'shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)]',
  },
  teal: {
    gradient: 'linear-gradient(180deg, #6FE3DB, #3FA9A2)',
    shadow:
      'shadow-[0_12px_32px_-12px_rgba(81,197,190,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]',
  },
} as const

interface CtaButtonProps {
  tone?: keyof typeof CTA_TONES
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  /** Sizing/width live at the call site (e.g. "w-full py-3.5 text-[14px]"). */
  className?: string
  children: ReactNode
}

/** Filled primary action: gradient pill, lift shadow, press feedback. */
export function CtaButton({
  tone = 'gold',
  type = 'button',
  disabled,
  onClick,
  className = '',
  children,
}: CtaButtonProps) {
  const t = CTA_TONES[tone]
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full font-bold text-bg transition-transform active:scale-[0.98] disabled:opacity-60 ${t.shadow} ${className}`}
      style={{ backgroundImage: t.gradient }}
    >
      {children}
    </button>
  )
}

interface GroupMarkProps {
  groupId: string
  name: string
  /** Box size in px. */
  size?: number
  className?: string
}

/**
 * A group's identity mark: its initial on a stable colour derived from the
 * group id. Square-ish on purpose — people are circles, groups are tiles.
 */
export function GroupMark({ groupId, name, size = 24, className = '' }: GroupMarkProps) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-md font-mono font-bold text-bg ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.45)),
        backgroundColor: colorForGroup(groupId),
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
