import { useState } from 'react'
import type { FormEvent } from 'react'
import { createGroup, signOut } from '../lib/api'
import type { GroupInfo } from '../lib/api'
import { Logo } from '../components/Logo'

interface CreateGroupScreenProps {
  userId: string
  onCreated: (group: GroupInfo) => void
}

// First-run: name the group. Creating it also seeds membership (owner) and
// an equal-weight rubric via DB triggers. Joining someone else's group needs
// an invite mechanism — a later milestone.

export function CreateGroupScreen({ userId, onCreated }: CreateGroupScreenProps) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await createGroup(userId, name.trim()))
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
            Name your crew
          </h1>
          <p className="mt-2 max-w-[300px] text-[13px] leading-snug text-muted">
            A group is a shared definition of a good movie. You set the rubric together — then
            everyone scores blind.
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
            className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-[14px] text-text placeholder:text-muted/70 outline-none transition-colors focus:border-teal/60"
          />

          {error && (
            <p role="alert" className="mt-3 text-[12px] leading-snug text-coral">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || name.trim().length === 0}
            className="mt-4 w-full rounded-full py-3.5 text-[14px] font-bold text-bg shadow-[0_12px_32px_-12px_rgba(231,178,78,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-transform active:scale-[0.98] disabled:opacity-60"
            style={{ backgroundImage: 'linear-gradient(180deg, #F2CD77, #DFA338)' }}
          >
            {busy ? 'Creating…' : 'Create the group'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mp-rise mx-auto mt-6 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:text-text"
          style={{ animationDelay: '160ms' }}
        >
          Not you? Sign out
        </button>
      </div>
    </div>
  )
}
