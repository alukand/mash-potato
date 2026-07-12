import { useState } from 'react'
import type { FormEvent } from 'react'
import { signIn, signUp } from '../lib/api'
import { Logo } from '../components/Logo'
import { CtaButton, fieldClass } from '../components/ui'

// Email + password auth against local/hosted Supabase. On success the
// onAuthStateChange listener in App flips the screen — no navigation here.

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password, displayName.trim() || 'Member')
      } else {
        await signIn(email.trim(), password)
      }
      // success: App's auth listener takes over
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-[400px]">
        <header className="mp-rise mb-8 flex flex-col items-center text-center">
          <Logo className="h-14 w-14" />
          <h1 className="mt-4 font-display text-[34px] font-semibold leading-none tracking-tight">
            Mash Potato
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            Rate movies and shows with your friends.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mp-rise mp-card rounded-[26px] p-6"
          style={{ animationDelay: '80ms' }}
        >
          <div className="mb-5 flex rounded-full border border-line bg-surface-2 p-1">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setError(null)
                }}
                className={`flex-1 rounded-full py-2 text-[12px] font-semibold transition-colors ${
                  mode === m ? 'bg-teal/10 text-teal' : 'text-muted'
                }`}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {mode === 'signup' && (
              <input
                type="text"
                required
                maxLength={60}
                placeholder="Display name"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={fieldClass}
              />
            )}
            <input
              type="email"
              required
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </div>

          {error && (
            <p role="alert" className="mt-3 text-[12px] leading-snug text-coral">
              {error}
            </p>
          )}

          <CtaButton type="submit" disabled={busy} className="mt-5 w-full py-3.5 text-[14px]">
            {busy
              ? mode === 'signin'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
          </CtaButton>
        </form>

        <p
          className="mp-rise mt-6 text-center font-mono text-[10px] text-muted"
          style={{ animationDelay: '160ms' }}
        >
          ratings stay hidden until the whole group reveals
        </p>
      </div>
    </div>
  )
}
