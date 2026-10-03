import { useState } from 'react'
import { acceptDiscussionTerms } from '../lib/api'
import { CtaButton } from './ui'
import { Sheet } from './Sheet'

// The house rules, asked for UP FRONT before someone's first words in a round
// game (guideline 1.2: a zero-tolerance agreement before posting). One
// acceptance covers every place people write, comments and messages too.
export function HouseRulesSheet({
  onAgreed,
  onClose,
}: {
  /** Called once the agreement is saved; the caller then posts. */
  onAgreed: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function agree() {
    setBusy(true)
    setError(null)
    try {
      await acceptDiscussionTerms()
      onAgreed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that. Try again.')
      setBusy(false)
    }
  }

  return (
    <Sheet label="House rules" onClose={onClose}>
      <h2 className="font-display text-[22px] font-semibold leading-tight">House rules</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Talk movies, not people. There is zero tolerance for objectionable content or abusive
        behavior here: hateful, harassing, or explicit posts get removed, and accounts that
        post them get ejected. You can report any take and block any user.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[13px] leading-snug text-coral">
          {error}
        </p>
      )}
      <CtaButton tone="teal" disabled={busy} onClick={() => void agree()} className="mt-5 w-full py-3 text-[14px]">
        {busy ? 'One sec…' : 'Agree and post'}
      </CtaButton>
      <button
        type="button"
        data-sheet-close
        className="mt-3 w-full rounded-full border border-line py-2.5 text-[13px] font-semibold text-muted transition-colors hover:text-text"
      >
        Not now
      </button>
    </Sheet>
  )
}
