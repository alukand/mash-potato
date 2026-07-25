import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import { colorForGroup } from '../lib/palette'
import { scoreColor, scoreWord } from '../lib/scoreColor'
import { rubricRowsForMode, TASTE_MODES } from '../lib/rubricCatalog'
import type { TasteMode } from '../lib/rubricCatalog'

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

interface ScoreSliderRowProps {
  label: string
  /** Current 1..10 score. */
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  /** Optional quiet line under the label (e.g. the weight percentage). */
  sub?: ReactNode
  /** Row spacing/borders live at the call site. */
  className?: string
}

/**
 * The app's one score-slider recipe: label + anchor word + "N/10" readout in
 * ramp color over an mp-slider. Every scoring surface uses this row.
 */
export function ScoreSliderRow({
  label,
  value,
  onChange,
  disabled,
  sub,
  className = '',
}: ScoreSliderRowProps) {
  const color = scoreColor(value)
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[14px] font-medium leading-tight">{label}</p>
          {sub}
        </div>
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
            {scoreWord(value)}
          </span>
          <span className="tabular font-mono text-xl font-bold" style={{ color }}>
            {value}
            <span className="text-[12px] font-semibold text-muted">/10</span>
          </span>
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={`${label} score`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mp-slider mt-1.5"
        style={{ '--thumb': color, '--fill': ((value - 1) / 9) * 100 } as CSSProperties}
      />
      {/* Faint scale rail so the 1..10 range reads at a glance. The "5" sits
          where the midpoint thumb actually lands: (5-1)/9 of the track. */}
      <div
        aria-hidden
        className="relative mt-0.5 h-3 select-none font-mono text-[9px] leading-none text-muted/40"
      >
        <span className="absolute left-0.5">1</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${((5 - 1) / 9) * 100}%` }}>
          5
        </span>
        <span className="absolute right-0">10</span>
      </div>
    </div>
  )
}

interface VisibilityChipProps {
  isPublic: boolean
  /** When given, the chip is a toggle button; otherwise a static span. */
  onToggle?: () => void
  disabled?: boolean
  ariaLabel?: string
}

/**
 * The one visibility vocabulary: globe + teal = public, lock + muted =
 * private. Static (span) inside other buttons, interactive (button) when
 * onToggle is given.
 */
export function VisibilityChip({ isPublic, onToggle, disabled, ariaLabel }: VisibilityChipProps) {
  const className = `flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wide ${
    isPublic
      ? 'border-teal/30 bg-teal/10 text-teal'
      : `border-line bg-surface-2 text-muted${onToggle ? ' hover:text-text' : ''}`
  }${onToggle ? ' transition-colors disabled:opacity-50' : ''}`
  const content = (
    <>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {isPublic ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
          </>
        ) : (
          <>
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </>
        )}
      </svg>
      {isPublic ? 'Public' : 'Private'}
    </>
  )
  if (!onToggle) return <span className={className}>{content}</span>
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={isPublic}
      aria-label={ariaLabel}
      className={className}
    >
      {content}
    </button>
  )
}

interface TasteModePickerProps {
  /** null while the default is still loading: nothing reads as chosen. */
  value: TasteMode | null
  onChange: (mode: TasteMode) => void
  disabled?: boolean
  className?: string
}

/**
 * The one recipe for choosing how a group scores: two cards, each showing its
 * own rubric at a glance so the difference is visible rather than described.
 * Used on group creation and in the group's settings cluster.
 */
export function TasteModePicker({
  value,
  onChange,
  disabled = false,
  className = '',
}: TasteModePickerProps) {
  return (
    <div className={`flex items-stretch gap-2.5 ${className}`}>
      {(['casual', 'buff'] as const).map((mode) => {
        const picked = value === mode
        const rows = rubricRowsForMode(mode)
        return (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            onClick={() => onChange(mode)}
            aria-pressed={picked}
            className={`flex-1 rounded-2xl border p-3 text-left transition-colors disabled:opacity-60 ${
              picked
                ? 'border-teal/50 bg-teal/10'
                : 'border-line bg-surface-2 hover:border-line'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span
                className={`font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${
                  picked ? 'text-teal' : 'text-muted'
                }`}
              >
                {TASTE_MODES[mode].plural}
              </span>
              {picked && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-teal" aria-hidden>
                  <path d="m4.5 12.5 5 5 10-11" />
                </svg>
              )}
            </span>
            <span className="mt-1.5 block text-[12px] leading-snug text-muted">
              {TASTE_MODES[mode].blurb}
            </span>
            <span className="mt-2 flex flex-wrap gap-1">
              {rows.map((r) => (
                <span
                  key={r.key}
                  className="rounded-full border border-line/70 px-1.5 py-0.5 font-mono text-[9px] text-muted"
                >
                  {r.label}
                </span>
              ))}
            </span>
          </button>
        )
      })}
    </div>
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

interface ExtraCategoryChipsProps {
  /** Session categories outside this member's own rubric (opt-in). */
  extras: { key: string; label: string; weight: number }[]
  /** Whether a key is currently on the member's card. */
  isOn: (key: string) => boolean
  disabled?: boolean
  onToggle: (key: string) => void
  className?: string
}

/**
 * The opt-in extras row: genre add-ons and groupmates' categories this
 * member does not carry. Tapping adds the category to their card (a slider
 * appears); tapping again removes it. A skipped extra never lands on the
 * card, so its weight drops out of that member's personal denominator and
 * the group mean averages only the people who rated it.
 */
export function ExtraCategoryChips({
  extras,
  isOn,
  disabled = false,
  onToggle,
  className = '',
}: ExtraCategoryChipsProps) {
  if (extras.length === 0) return null
  return (
    <div className={className}>
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
        Extras, if you want them
      </p>
      <div className="flex flex-wrap gap-1.5">
        {extras.map((e) => {
          const on = isOn(e.key)
          return (
            <button
              key={e.key}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onToggle(e.key)}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors active:scale-95 disabled:opacity-50 ${
                on
                  ? 'border-teal/40 bg-teal/10 text-teal'
                  : 'border-dashed border-line text-muted hover:text-text'
              }`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="shrink-0" aria-hidden>
                {on ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M12 5v14M5 12h14" />}
              </svg>
              {e.label}
              <span className="tabular font-mono text-[10px] opacity-80">{e.weight}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-muted">
        Rate them or skip them, your call. A skipped one just isn't on your card, and
        its weight drops out of your number.
      </p>
    </div>
  )
}

/** The app header's right-hand slot. Screens portal their top-right control here. */
export const HEADER_ACTION_ID = 'mp-header-action'

/**
 * Renders its child into the app header's right slot, so a screen owns the
 * control (and its state) while it appears in one fixed, predictable place.
 * Nothing renders when there is no header (the pushed view-stack), which is
 * correct: those screens carry their own Back row.
 */
export function HeaderAction({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setHost(document.getElementById(HEADER_ACTION_ID))
  }, [])
  if (!host) return null
  return createPortal(children, host)
}

/** The one circular icon-button recipe (gear, star, remove, back). */
export function IconButton({
  label,
  onClick,
  active = false,
  expanded,
  size = 32,
  tone = 'teal',
  disabled,
  className = '',
  children,
}: {
  /** Accessible name; this button shows an icon only. */
  label: string
  onClick: () => void
  /** On/selected state (teal fill for teal tone, coral for coral). */
  active?: boolean
  expanded?: boolean
  size?: number
  tone?: 'teal' | 'coral'
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  const on =
    tone === 'coral'
      ? 'border-coral/40 bg-coral/10 text-coral'
      : 'border-teal/40 bg-teal/10 text-teal'
  const off =
    tone === 'coral'
      ? 'border-line text-muted transition-colors hover:border-coral/50 hover:text-coral'
      : 'border-line text-muted transition-colors hover:border-teal/50 hover:text-text'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-expanded={expanded}
      style={{ width: size, height: size }}
      className={`grid shrink-0 place-items-center rounded-full border disabled:opacity-50 ${
        active ? on : off
      } ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * Unread count pill. The app had no badge primitive at all before messaging
 * (PosterGrid's "badge" is a static string label). Caps at 99+, because
 * my_inbox stops counting at 100.
 */
export function UnreadBadge({
  count,
  className = '',
}: {
  count: number
  className?: string
}) {
  if (count <= 0) return null
  return (
    <span
      aria-label={`${count} unread`}
      className={`grid min-w-[18px] place-items-center rounded-full bg-teal px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-bg ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** The message-centre entry point: envelope, with a dot when anything waits. */
export function MessagesButton({
  unread,
  onClick,
}: {
  unread: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      data-tour="messages"
      className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:border-teal/50 hover:text-text active:bg-surface-2"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="m3.5 7 8.5 6 8.5-6" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-teal"
        />
      )}
    </button>
  )
}

/** The cog. One path, so every settings affordance looks identical. */
export function GearIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 5 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9.5a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

/**
 * The settings entry point, identical on every screen that has one: a
 * LABELLED pill in the header's top-right slot. A bare cog reads as one more
 * chip; the word is what makes it findable.
 */
export function SettingsButton({
  open,
  onClick,
  label = 'Settings',
}: {
  open: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? `Close ${label.toLowerCase()}` : label}
      data-tour="settings"
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
        open
          ? 'border-teal/40 bg-teal/10 text-teal'
          : 'border-line bg-surface-2 text-muted hover:border-teal/50 hover:text-text'
      }`}
    >
      <GearIcon size={12} />
      {open ? 'Done' : label}
    </button>
  )
}
