import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { renderRevealCard, shareRevealCard } from '../lib/shareCard'
import type { RevealCardInput } from '../lib/shareCard'
import { formatScore } from '../lib/scoring'
import { CtaButton } from './ui'

interface ShareRevealSheetProps {
  card: RevealCardInput
  onClose: () => void
}

/**
 * Preview-then-send for the shareable Reveal.
 *
 * The preview is not decoration. This is the one control in the app that sends
 * group data OUT, and the card is drawn rather than screenshotted precisely so
 * it carries no names or personal scores — showing the user the actual image
 * before it leaves is what makes that claim checkable instead of a promise.
 */
export function ShareRevealSheet({ card, onClose }: ShareRevealSheetProps) {
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let url: string | null = null
    renderRevealCard(card)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setPreview({ blob, url })
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not draw the card')
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [card])

  async function handleShare() {
    if (!preview || busy) return
    setBusy(true)
    setError(null)
    try {
      const safe = card.titleName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'reveal'
      const outcome = await shareRevealCard(preview.blob, `mashed-${safe.toLowerCase()}.png`)
      if (outcome === 'downloaded') setDone('Saved to your downloads.')
      else onClose()
    } catch (err) {
      // A cancelled share sheet rejects too; that is not an error worth shouting.
      const message = err instanceof Error ? err.message : ''
      if (!/abort|cancel/i.test(message)) setError(message || 'Could not share the card')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet label="Share this reveal" onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-semibold leading-tight">
            Share this reveal
          </h2>
          <p className="mt-0.5 text-[13px] leading-snug text-muted">
            Your group&apos;s score and the split. No names, no one&apos;s individual scores.
          </p>
        </div>
        <button
          type="button"
          data-sheet-close
          aria-label="Close"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:text-text active:bg-surface-2"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex justify-center">
        {preview ? (
          <img
            src={preview.url}
            alt={`Shareable card: ${card.titleName}, mashed ${
              card.mashed === null ? 'unscored' : formatScore(card.mashed)
            }`}
            className="w-[62%] rounded-2xl border border-line/60"
          />
        ) : (
          <div className="grid aspect-[4/5] w-[62%] place-items-center rounded-2xl border border-line/60 bg-surface-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {error ? 'no card' : 'drawing…'}
            </p>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-center text-[12px] leading-snug text-coral">
          {error}
        </p>
      )}
      {done && (
        <p className="mt-3 text-center text-[12px] leading-snug text-teal">{done}</p>
      )}

      <div className="mt-5 pb-5">
        <CtaButton
          tone="teal"
          onClick={() => void handleShare()}
          disabled={!preview || busy}
          className="w-full py-3.5 text-[14px]"
        >
          {busy ? 'Sharing…' : 'Share the card'}
        </CtaButton>
      </div>
    </Sheet>
  )
}
