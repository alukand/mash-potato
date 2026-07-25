import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createGroup, fetchMyTasteMode } from '../lib/api'
import type { GroupInfo } from '../lib/api'
import type { TasteMode } from '../lib/rubricCatalog'
import { signOutWithPushCleanup } from '../lib/push'
import { Logo } from '../components/Logo'
import { CtaButton, TasteModePicker, fieldClass } from '../components/ui'

interface CreateGroupScreenProps {
  userId: string
  onCreated: (group: GroupInfo) => void
  /**
   * The mode to preselect. Passed straight from the onboarding picker so the
   * choice you just made is the one you see (fetching it here would race the
   * profile write). Omitted elsewhere: we read your saved mode instead.
   */
  initialTasteMode?: TasteMode | null
  /** When present, this screen was pushed from within the app (Profile →
   *  "create another group") rather than shown as the first-run gate. */
  onBack?: () => void
}

// First-run: name the group. Creating it also seeds membership (owner) and
// an equal-weight rubric via DB triggers. Joining someone else's group needs
// an invite mechanism — a later milestone.

export function CreateGroupScreen({
  userId,
  onCreated,
  initialTasteMode = null,
  onBack,
}: CreateGroupScreenProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null until your personal mode loads, so the picker never shows a guess
  // and then visibly flips under you.
  const [mode, setMode] = useState<TasteMode | null>(initialTasteMode)

  useEffect(() => {
    if (initialTasteMode !== null) return
    let cancelled = false
    fetchMyTasteMode(userId)
      .then((m) => !cancelled && setMode(m))
      .catch(() => !cancelled && setMode('casual'))
    return () => {
      cancelled = true
    }
  }, [userId, initialTasteMode])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === null) return
    setBusy(true)
    setError(null)
    try {
      onCreated(await createGroup(userId, name.trim(), mode))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-[400px]">
        <header className="mp-rise mb-8 flex flex-col items-center text-center">
          <Logo className="h-12 w-12" />
          <h1 className="mt-4 font-display text-[28px] font-semibold leading-tight">
            Create a group
          </h1>
          <p className="mt-2 max-w-[300px] text-[13px] leading-snug text-muted">
            You'll rate movies and shows together. Everyone scores privately, then the results
            are revealed at the same time.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mp-rise mp-card rounded-[26px] p-6"
          style={{ animationDelay: '80ms' }}
        >
          <input
            type="text"
            required
            maxLength={80}
            placeholder="e.g. Friday Film Club"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldClass}
          />

          <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            How this group scores
          </p>
          <TasteModePicker value={mode} onChange={setMode} disabled={busy} />
          <p className="mt-2.5 text-[12px] leading-snug text-muted">
            Everyone in the group scores the same way. The owner can change it later.
          </p>

          {error && (
            <p role="alert" className="mt-3 text-[13px] leading-snug text-coral">
              {error}
            </p>
          )}

          <CtaButton
            type="submit"
            disabled={busy || mode === null || name.trim().length === 0}
            className="mt-4 w-full py-3.5 text-[14px]"
          >
            {busy ? 'Creating…' : 'Create the group'}
          </CtaButton>
        </form>

        {!onBack && (
          <p
            className="mp-rise mt-5 text-center text-[13px] leading-snug text-muted"
            style={{ animationDelay: '120ms' }}
          >
            Joining a friend's group instead? Ask them to add you; they can find you by your
            name.
          </p>
        )}

        <button
          type="button"
          onClick={() => (onBack ? onBack() : void signOutWithPushCleanup())}
          className="mp-rise mx-auto mt-6 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
          style={{ animationDelay: '160ms' }}
        >
          {onBack ? 'Back' : 'Not you? Sign out'}
        </button>
      </div>
    </div>
  )
}
